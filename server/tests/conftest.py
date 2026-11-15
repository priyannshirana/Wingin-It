"""Shared fixtures (§B18): FakeClock, FakeSocket clients, room factory, say/click/advance."""

from __future__ import annotations

import asyncio
import concurrent.futures
import heapq
import itertools
from collections.abc import Awaitable, Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ParamSpec, TypeVar

import orjson
import pytest

from app.config import Settings
from app.content import Content, load_content
from app.language.lexicon import Lexicon
from app.main import build_services, handle_text, on_connect
from app.protocol import S2C_ADAPTER, Gender, Lang, Role, Verb
from app.rooms import Connection, Registry, Room, Services, on_disconnect

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"
T = TypeVar("T")
P = ParamSpec("P")


# ------------------------------------------------------------------------------ fake clock


@dataclass(order=True)
class _Timer:
    due: float
    seq: int
    cb: Callable[[], None] = field(compare=False)
    cancelled: bool = field(default=False, compare=False)

    def cancel(self) -> None:
        self.cancelled = True


class FakeClock:
    """Deterministic time: timers run only inside `advance()`."""

    def __init__(self, start: float = 1000.0) -> None:
        self.t = start
        self._heap: list[_Timer] = []
        self._seq = itertools.count()

    def monotonic(self) -> float:
        return self.t

    def now_ms(self) -> int:
        return int(self.t * 1000)

    def call_later(self, delay_s: float, cb: Callable[[], None]) -> _Timer:
        timer = _Timer(self.t + max(0.0, delay_s), next(self._seq), cb)
        heapq.heappush(self._heap, timer)
        return timer

    async def wait(self, aw: Awaitable[T], timeout_s: float) -> T:
        fut = asyncio.ensure_future(aw)
        timeout: asyncio.Future[None] = asyncio.get_running_loop().create_future()

        def expire() -> None:
            if not timeout.done():
                timeout.set_result(None)

        self.call_later(timeout_s, expire)
        done, _ = await asyncio.wait({fut, timeout}, return_when=asyncio.FIRST_COMPLETED)
        if fut in done:
            return fut.result()
        fut.cancel()
        raise TimeoutError

    def advance(self, ms: float) -> None:
        target = self.t + ms / 1000.0
        while self._heap and self._heap[0].due <= target:
            timer = heapq.heappop(self._heap)
            if timer.cancelled:
                continue
            self.t = max(self.t, timer.due)
            timer.cb()
        self.t = target

    def pending(self) -> int:
        return sum(1 for t in self._heap if not t.cancelled)


class InlineExecutor(concurrent.futures.ThreadPoolExecutor):
    """`asyncio.to_thread` work (fake boto3 clients) runs inline: done one loop hop later.

    With real worker threads, whether a fake Bedrock reply lands within `settle()` depends
    on OS thread scheduling — a race on a loaded CI runner.
    """

    def submit(  # type: ignore[override]
        self, fn: Callable[P, T], /, *args: P.args, **kwargs: P.kwargs
    ) -> concurrent.futures.Future[T]:
        fut: concurrent.futures.Future[T] = concurrent.futures.Future()
        try:
            fut.set_result(fn(*args, **kwargs))
        except Exception as exc:
            fut.set_exception(exc)
        return fut


# ----------------------------------------------------------------------------- fake socket


# §A8 optional fields typed `key?: T` (not `T | null`) in the client's protocol.ts: when absent
# they must be omitted from the frame, never sent as null. No other field uses these names
# with a null value.
NEVER_NULL_KEYS = frozenset(
    {"concept", "concepts", "alt_text", "translation", "row_index", "used"}
    | {"text", "value", "count"}
)


def assert_no_null_optionals(obj: object, path: str = "") -> None:
    """Fail when an optional-but-not-nullable §A8 field is sent as null."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert not (v is None and k in NEVER_NULL_KEYS), f"{path}.{k} is null"
            assert_no_null_optionals(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for v in obj:
            assert_no_null_optionals(v, f"{path}[]")


class Client:
    """A FakeSocket: records every outbound message for one connection."""

    def __init__(self, room: Room) -> None:
        self.room = room
        self.conn = Connection()
        self.msgs: list[dict[str, Any]] = []
        self.audio: list[bytes] = []  # relayed binary frames (voice rooms, §B13.5)
        self.role: Role | None = None

    def drain(self) -> list[dict[str, Any]]:
        new: list[dict[str, Any]] = []
        while not self.conn.queue.empty():
            raw = self.conn.queue.get_nowait()
            if raw is None:
                continue
            data = orjson.loads(raw)
            S2C_ADAPTER.validate_python(data)  # every outbound frame obeys the contract
            assert_no_null_optionals(data, data.get("type", "?"))
            new.append(data)
        while self.conn.audio:
            self.audio.append(self.conn.audio.popleft())
        self.msgs.extend(new)
        return new

    async def send(self, msg: dict[str, Any]) -> None:
        await handle_text(self.room, self.conn, orjson.dumps(msg).decode())
        self.drain()

    def of(self, type_: str) -> list[dict[str, Any]]:
        self.drain()
        return [m for m in self.msgs if m["type"] == type_]

    def last(self, type_: str) -> dict[str, Any]:
        found = self.of(type_)
        assert found, f"no {type_!r} message for {self.role}"
        return found[-1]

    def clear(self) -> None:
        self.drain()
        self.msgs.clear()


# ---------------------------------------------------------------------------------- table


class Table:
    """Two players in one room, driven through the real handlers."""

    def __init__(self, harness: Harness, room: Room) -> None:
        self.h = harness
        self.room = room
        self.clients: dict[Role, Client] = {}

    @property
    def clock(self) -> FakeClock:
        return self.h.clock

    @property
    def flyer(self) -> Client:
        return self.clients["flyer"]

    @property
    def tower(self) -> Client:
        return self.clients["tower"]

    async def connect(self, role: Role) -> Client:
        c = Client(self.room)
        c.role = role
        async with self.room.lock:
            on_connect(self.room, c.conn)
        c.drain()
        self.clients[role] = c
        return c

    async def join(
        self,
        role: Role,
        lang: Lang,
        *,
        name: str | None = None,
        gender: Gender = "female",
        token: str | None = None,
        ready: bool = True,
    ) -> Client:
        c = await self.connect(role)
        msg: dict[str, Any] = {
            "type": "join",
            "name": name or role.capitalize(),
            "role": role,
            "lang": lang,
            "gender": gender,
        }
        if token:
            msg["token"] = token
        await c.send(msg)
        if ready and not token:
            await c.send({"type": "ready"})
        return c

    async def disconnect(self, role: Role) -> None:
        c = self.clients[role]
        async with self.room.lock:
            on_disconnect(self.room, c.conn)
        c.conn.close()

    async def rejoin(self, role: Role) -> Client:
        old = self.clients[role]
        token = old.last("joined")["token"]
        p = self.room.players[role]
        return await self.join(role, p.lang, name=p.name, gender=p.gender, token=token)

    def drain(self) -> None:
        for c in self.clients.values():
            c.drain()

    def clear(self) -> None:
        for c in self.clients.values():
            c.clear()

    def advance(self, ms: float) -> None:
        self.clock.advance(ms)
        self.drain()

    async def settle(self) -> None:
        for _ in range(5):
            await asyncio.sleep(0)
        self.drain()

    async def click(self, object_id: str, verb: Verb) -> None:
        await self.flyer.send({"type": "interact", "object_id": object_id, "verb": verb})

    async def say(self, role: Role, text: str, lang: Lang | None = None) -> None:
        msg: dict[str, Any] = {"type": "say_text", "text": text}
        if lang:
            msg["lang"] = lang
        self.clock.advance(400)  # say_text rate limit: 1 per 300 ms
        await self.clients[role].send(msg)
        self.drain()

    async def dev(self, cmd: str, **args: Any) -> None:
        msg: dict[str, Any] = {"type": "dev", "cmd": cmd}
        if args:
            msg["args"] = args
        await self.tower.send(msg)

    def last(self, role: Role, type_: str) -> dict[str, Any]:
        return self.clients[role].last(type_)

    @property
    def status(self) -> str:
        return self.room.status

    @property
    def action_id(self) -> str | None:
        g = self.room.game
        return g.run.action.id if g and g.run else None

    def run_until(
        self, cond: Callable[[], bool], max_ms: float = 120_000, step: float = 100
    ) -> None:
        waited = 0.0
        while not cond():
            assert waited < max_ms, (
                f"timed out waiting (status={self.status}, action={self.action_id})"
            )
            self.advance(step)
            waited += step

    def until_active(self, max_ms: float = 60_000) -> None:
        from app.game import action_active

        self.run_until(lambda: action_active(self.room), max_ms)

    async def goto_phase(self, n: int) -> None:
        await self.dev("goto_phase", phase=n)
        self.until_active()

    async def goto_action(self, action_id: str) -> None:
        phase = int(action_id[1])
        g = self.room.game
        assert g is not None
        if g.phase != phase or self.status not in ("PLAYING",):
            await self.goto_phase(phase)
        self.until_active()
        while self.action_id != action_id:
            await self.dev("complete_action")
            self.until_active()
        self.drain()

    async def solve_current(self) -> None:
        """Do the current action right (the Flyer heard the Tower perfectly)."""
        g = self.room.game
        assert g is not None and g.run is not None
        run = g.run
        for s in run.steps:
            verb: Verb = s.verb
            for _ in range(s.count):
                await self.click(s.object, verb)
                self.advance(200)
            if (
                s.verb == "press"
                or self.room.svc.content.objects_by_id[s.object].control.type == "NotchLever"
            ):
                self.advance(1300)

    async def play_naturally(self) -> None:
        """Tower says the ask + the rolled branch line; the Flyer answers, then acts."""
        g = self.room.game
        assert g is not None and g.run is not None
        run = g.run
        a = run.action
        tower = self.room.players["tower"]

        def form(hi_roman: str, en: str, lang: str) -> str:
            return hi_roman if lang == "hi" else en

        if a.ask is not None:
            await self.say("tower", form(a.ask.hi_roman, a.ask.en, tower.lang))
            replies = self.flyer.last("flyer_view")["quick_replies"] or []
            if replies:
                await self.say("flyer", replies[0]["text"])
        line = None
        if a.branches is not None:
            line = next(b.say for b in a.branches if b.when == run.value)
        elif a.say is not None:
            line = a.say
        if line is not None:
            await self.say("tower", form(line.hi_roman, line.en, tower.lang))
        await self.solve_current()

    async def play_to_deck(self, *, naturally: bool = False) -> list[str]:
        from app.game import action_active

        played: list[str] = []
        while self.status != "DECK":
            if action_active(self.room):
                played.append(self.action_id or "")
                if naturally:
                    await self.play_naturally()
                else:
                    await self.solve_current()
                continue
            self.advance(100)
            assert self.clock.t < 1000 + 7200, f"stuck in {self.status}"
        return played


@dataclass
class Harness:
    clock: FakeClock
    svc: Services
    registry: Registry

    def make(
        self, *, code: str = "TEST", demo: bool = False, mock: bool = True, seed: int | None = None
    ) -> Room:
        return self.registry.create(code=code, demo=demo, mock=mock, seed=seed)


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "mock_speech": True,
        "dev_mode": True,
        "demo_mode": False,
        "content_dir": CONTENT_DIR,
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(scope="session")
def content() -> Content:
    return load_content(CONTENT_DIR)


@pytest.fixture(scope="session")
def lexicon(content: Content) -> Lexicon:
    return Lexicon(content.lexicon)


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def harness_factory(fake_clock: FakeClock) -> Callable[..., Harness]:
    def build(**settings: Any) -> Harness:
        svc = build_services(make_settings(**settings), fake_clock)
        return Harness(clock=fake_clock, svc=svc, registry=Registry(svc))

    return build


@pytest.fixture
def harness(harness_factory: Callable[..., Harness]) -> Harness:
    return harness_factory()


MakeRoom = Callable[..., Awaitable[Table]]


@pytest.fixture
def make_room(harness_factory: Callable[..., Harness]) -> Iterator[MakeRoom]:
    async def make(
        *,
        seed: int | None = 1,
        langs: tuple[Lang, Lang] = ("en", "hi"),
        mock: bool = True,
        demo: bool = False,
        force: dict[str, str] | None = None,
        start: bool = True,
        **settings: Any,
    ) -> Table:
        asyncio.get_running_loop().set_default_executor(InlineExecutor())
        h = harness_factory(**settings)
        room = h.make(demo=demo, mock=mock, seed=seed)
        if force:
            room.pending_force.update(force)
        table = Table(h, room)
        await table.join("flyer", langs[0], gender="female", ready=start)
        await table.join("tower", langs[1], gender="male", ready=start)
        return table

    yield make
