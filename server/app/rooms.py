"""Rooms, players, connections, the registry, and the single send/broadcast path (§B7)."""

from __future__ import annotations

import asyncio
import logging
import math
import secrets
import time
from collections import deque
from collections.abc import Awaitable, Callable, Coroutine
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, TypeVar

import orjson
from pydantic import BaseModel

from app.config import Settings
from app.constants import (
    RATE_AUDIO_FRAMES_PER_S,
    RATE_INTERACT_PER_S,
    RATE_TEXT_BURST,
    RATE_TEXT_SUSTAINED_PER_S,
    RECONNECT_GRACE_S,
    ROOM_CODE_ALPHABET,
)
from app.content import Content
from app.language.exposure import PlayerStats
from app.language.lexicon import Lexicon
from app.logging_setup import log_event
from app.protocol import (
    ALL_ROLES,
    BlockReason,
    ErrorCode,
    ErrorMsg,
    Gender,
    Joined,
    JoinMsg,
    Lang,
    PlayerPublic,
    ReadyMsg,
    Role,
    RoomState,
    Status,
    UpdatePlayerMsg,
    dump,
)

if TYPE_CHECKING:
    from fastapi import WebSocket

    from app.deck import Reporter
    from app.game import Game
    from app.persistence import Persister
    from app.speech.base import SessionFactory, Transmission, Utterance
    from app.speech.translate import Translator

log = logging.getLogger("wingin.rooms")
T = TypeVar("T")

# ---------------------------------------------------------------------------------- clock


class Cancellable(Protocol):
    def cancel(self) -> None: ...


class Clock(Protocol):
    """Injected time source: real in production, `FakeClock` in tests."""

    def monotonic(self) -> float: ...

    def now_ms(self) -> int: ...

    def call_later(self, delay_s: float, cb: Callable[[], None]) -> Cancellable: ...

    async def wait(self, aw: Awaitable[T], timeout_s: float) -> T: ...


class RealClock:
    """Wall/monotonic time and the running asyncio loop's timers."""

    def monotonic(self) -> float:
        return time.monotonic()

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def call_later(self, delay_s: float, cb: Callable[[], None]) -> Cancellable:
        return asyncio.get_running_loop().call_later(max(0.0, delay_s), cb)

    async def wait(self, aw: Awaitable[T], timeout_s: float) -> T:
        return await asyncio.wait_for(aw, timeout_s)


# ---------------------------------------------------------------------------- rate limits


@dataclass(slots=True)
class TokenBucket:
    """Burst `capacity`, refilled at `rate` per second."""

    capacity: float
    rate: float
    tokens: float = -1.0
    t: float = 0.0

    def allow(self, now: float) -> bool:
        if self.tokens < 0:
            self.tokens, self.t = self.capacity, now
        self.tokens = min(self.capacity, self.tokens + (now - self.t) * self.rate)
        self.t = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


def _bucket(capacity: float, rate: float) -> TokenBucket:
    return TokenBucket(capacity=capacity, rate=rate)


# ----------------------------------------------------------------------------- connection


@dataclass(slots=True, eq=False)
class Connection:
    """One socket. Its writer task is the only thing that writes to the WebSocket (§B1)."""

    queue: asyncio.Queue[str | None] = field(default_factory=asyncio.Queue)
    ws: WebSocket | None = None
    writer: asyncio.Task[None] | None = None
    player_id: str | None = None
    closed: bool = False
    msg_times: deque[float] = field(default_factory=lambda: deque(maxlen=64))
    text_bucket: TokenBucket = field(
        default_factory=lambda: _bucket(RATE_TEXT_BURST, RATE_TEXT_SUSTAINED_PER_S)
    )
    interact_bucket: TokenBucket = field(
        default_factory=lambda: _bucket(RATE_INTERACT_PER_S, RATE_INTERACT_PER_S)
    )
    audio_bucket: TokenBucket = field(
        default_factory=lambda: _bucket(RATE_AUDIO_FRAMES_PER_S, RATE_AUDIO_FRAMES_PER_S)
    )
    last_say_ms: float = -math.inf
    last_rate_notice_ms: float = -math.inf

    def put(self, data: str) -> None:
        """Queue one outbound text frame."""
        if not self.closed:
            self.queue.put_nowait(data)

    def close(self) -> None:
        """Stop accepting frames and wake the writer so it exits."""
        if not self.closed:
            self.closed = True
            self.queue.put_nowait(None)


# --------------------------------------------------------------------------------- player


@dataclass(slots=True, eq=False)
class Player:
    """A seat in the room (§B7)."""

    id: str
    token: str
    name: str
    role: Role
    lang: Lang
    gender: Gender
    ready: bool = False
    is_bot: bool = False
    conn: Connection | None = None
    disconnected_at: float | None = None
    stats: PlayerStats = field(default_factory=PlayerStats)
    lifelines: int = 3

    @property
    def connected(self) -> bool:
        return self.is_bot or self.conn is not None

    @property
    def human(self) -> bool:
        return not self.is_bot


def new_player(name: str, role: Role, lang: Lang, gender: Gender, *, bot: bool = False) -> Player:
    """Create a player with a fresh id and token."""
    return Player(
        id="p_" + secrets.token_hex(4),
        token=secrets.token_urlsafe(24),
        name=name,
        role=role,
        lang=lang,
        gender=gender,
        is_bot=bot,
        ready=bot,
    )


# ------------------------------------------------------------------------------- services


@dataclass(slots=True)
class Services:
    """Process-wide dependencies injected into every room."""

    settings: Settings
    content: Content
    lexicon: Lexicon
    clock: Clock
    translator: Translator | None = None
    mock_translator: Translator | None = None
    open_session: SessionFactory | None = None
    reporter: Reporter | None = None
    persister: Persister | None = None


# ----------------------------------------------------------------------------------- room


@dataclass(slots=True, eq=False)
class Room:
    """One game room (§B7)."""

    code: str
    svc: Services
    created_at: float
    demo: bool
    mock_speech: bool
    seed_override: int | None = None
    status: Status = "LOBBY"
    paused_from: Status | None = None
    players: dict[Role, Player] = field(default_factory=dict)
    spectators: set[Connection] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    gen: int = 0
    game: Game | None = None
    bots: dict[Role, bool] = field(default_factory=lambda: {"flyer": False, "tower": False})
    play_again_votes: set[Role] = field(default_factory=set)
    swap_votes: set[Role] = field(default_factory=set)
    last_activity: float = 0.0
    channel_holder: Role | None = None
    channel_token: int = 0
    pause_token: int = 0
    paused_had_cinematic: bool = False
    utterances: list[Utterance] = field(default_factory=list)
    clips: dict[str, bytes] = field(default_factory=dict)
    tasks: set[asyncio.Task[Any]] = field(default_factory=set)
    ticker: Callable[[], None] | None = None
    dev_last_ms: float = -math.inf
    dev_trailing_gen: int | None = None
    latencies_ms: deque[int] = field(default_factory=lambda: deque(maxlen=20))
    last_utterance: Utterance | None = None
    pending_force: dict[str, str] = field(default_factory=dict)
    transmission: Transmission | None = None

    # --------------------------------------------------------------- timers (§B1)

    @property
    def clock(self) -> Clock:
        return self.svc.clock

    def now_ms(self) -> int:
        return self.svc.clock.now_ms()

    def bump(self) -> None:
        """New timer generation: every pending gen-guarded callback becomes a no-op."""
        self.gen += 1
        if self.ticker is not None:
            self.schedule_tick()

    def schedule_tick(self) -> None:
        """(Re)arm the fuel ticker for the current generation."""
        from app.constants import FUEL_TICK_MS

        ticker = self.ticker
        if ticker is not None:
            self.schedule(FUEL_TICK_MS, ticker, notify=False)

    def schedule(
        self,
        delay_ms: float,
        fn: Callable[[], None],
        *,
        key: Callable[[], object] | None = None,
        notify: bool = True,
    ) -> Cancellable:
        """The one timer helper: runs `fn` later unless its guard key changed (default: gen)."""
        keyfn: Callable[[], object] = key if key is not None else (lambda: self.gen)
        expected = keyfn()

        def fire() -> None:
            if keyfn() != expected:
                return
            if self.lock.locked():
                self.spawn(self._fire_locked(keyfn, expected, fn, notify))
                return
            # Sync callback on the loop: atomic with respect to every locked handler.
            self._run_timer(fn, notify)

        return self.svc.clock.call_later(delay_ms / 1000.0, fire)

    async def _fire_locked(
        self, keyfn: Callable[[], object], expected: object, fn: Callable[[], None], notify: bool
    ) -> None:
        async with self.lock:
            if keyfn() == expected:
                self._run_timer(fn, notify)

    def _run_timer(self, fn: Callable[[], None], notify: bool) -> None:
        try:
            fn()
        except Exception:
            log.exception("timer callback failed", extra={"room": self.code})
        if notify:
            self.after_handle()

    def spawn(self, coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
        """Start a background task and keep a reference until it finishes."""
        task = asyncio.get_running_loop().create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    def cancel_tasks(self) -> None:
        """Cancel every background task (room cleanup)."""
        for t in list(self.tasks):
            t.cancel()
        self.tasks.clear()

    def after_handle(self) -> None:
        """Post-message / post-timer hook: dev_state (§B16.3)."""
        if self.svc.settings.dev_mode:
            from app import dev

            dev.maybe_send_dev_state(self)

    # ------------------------------------------------------------------ players

    def player_by_id(self, pid: str | None) -> Player | None:
        if pid is None:
            return None
        return next((p for p in self.players.values() if p.id == pid), None)

    def partner(self, p: Player) -> Player | None:
        return self.players.get("tower" if p.role == "flyer" else "flyer")

    def bot_roles(self) -> set[Role]:
        """Roles driven by a bot (virtual bot player or bot toggle on)."""
        return {r for r in ALL_ROLES if self.bots.get(r) or self._is_virtual(r)}

    def _is_virtual(self, role: Role) -> bool:
        p = self.players.get(role)
        return p is not None and p.is_bot

    def humans_connected(self) -> bool:
        humans = [p for p in self.players.values() if p.human]
        return all(p.conn is not None for p in humans)

    def any_human_connected(self) -> bool:
        return any(p.conn is not None for p in self.players.values() if p.human) or bool(
            self.spectators
        )

    @property
    def quick_lines_enabled(self) -> bool:
        """Quick-say / quick replies: mock rooms or Dev Mode (§B12, §B16.2)."""
        return self.mock_speech or self.svc.settings.dev_mode

    @property
    def say_text_allowed(self) -> bool:
        """`say_text`: mock rooms, Dev Mode, or demo rooms (§B3)."""
        return self.mock_speech or self.svc.settings.dev_mode or self.demo


# ------------------------------------------------------------------- the send path (§B7)


def encode(msg: BaseModel) -> str:
    """orjson-serialize one outbound message."""
    return orjson.dumps(dump(msg)).decode()


def send(player: Player | None, msg: BaseModel) -> None:
    """Send to one player (dropped if disconnected or a bot)."""
    if player is not None and player.conn is not None:
        player.conn.put(encode(msg))


def send_conn(conn: Connection, msg: BaseModel) -> None:
    """Send to a connection that may not have joined yet (handshake, errors)."""
    conn.put(encode(msg))


def broadcast(room: Room, msg_for_role: Callable[[Role], BaseModel | None]) -> None:
    """Build and send a per-role payload; the only place role filtering happens (§B7)."""
    for role in ALL_ROLES:
        p = room.players.get(role)
        if p is None or p.conn is None:
            continue
        msg = msg_for_role(role)
        if msg is not None:
            p.conn.put(encode(msg))


def send_role(room: Room, role: Role, msg: BaseModel) -> None:
    """Send to exactly one role, through `broadcast`."""
    broadcast(room, lambda r: msg if r == role else None)


def broadcast_all(room: Room, msg: BaseModel) -> None:
    """Same (secret-free) payload to both roles."""
    broadcast(room, lambda _r: msg)


def send_error(conn: Connection, code: ErrorCode, message: str) -> None:
    """Protocol error to one connection (§A15)."""
    send_conn(conn, ErrorMsg(type="error", code=code, message=message))


# ------------------------------------------------------------------------- roster (§B7)


def roster_status(room: Room) -> tuple[bool, BlockReason | None]:
    """`can_start` and `block_reason` for room_state."""
    f, t = room.players.get("flyer"), room.players.get("tower")
    if f is None or t is None or not f.connected or not t.connected:
        return False, "missing_player"
    if f.lang == t.lang:
        return False, "same_language"
    if not (f.ready or f.is_bot) or not (t.ready or t.is_bot):
        return False, "not_ready"
    return True, None


def room_state_msg(room: Room) -> RoomState:
    """The public room snapshot (no secrets)."""
    can_start, reason = roster_status(room)
    players = [
        PlayerPublic(
            id=p.id,
            name=p.name,
            role=p.role,
            lang=p.lang,
            gender=p.gender,
            ready=p.ready or p.is_bot,
            connected=p.connected,
            is_bot=p.is_bot,
        )
        for r in ALL_ROLES
        if (p := room.players.get(r)) is not None
    ]
    return RoomState(
        type="room_state",
        code=room.code,
        status=room.status,
        demo=room.demo,
        mock_speech=room.mock_speech,
        players=players,
        can_start=can_start and room.status == "LOBBY",
        block_reason=None if room.status != "LOBBY" else reason,
        play_again_votes=sorted(room.play_again_votes),
    )


def broadcast_room_state(room: Room) -> None:
    """room_state to every player and every spectator connection."""
    msg = room_state_msg(room)
    broadcast_all(room, msg)
    for conn in list(room.spectators):
        send_conn(conn, msg)


def maybe_start(room: Room) -> None:
    """Start the game as soon as the roster allows it (§B7)."""
    if room.status == "LOBBY" and roster_status(room)[0]:
        from app import game

        game.start_game(room)


def handle_join(room: Room, conn: Connection, msg: JoinMsg) -> None:
    """`join`: token rebind, new seat, or role_taken (§B7)."""
    settings = room.svc.settings
    if msg.token:
        for p in room.players.values():
            if p.human and secrets.compare_digest(p.token, msg.token):
                rebind(room, conn, p)
                return
    current = room.player_by_id(conn.player_id)
    if current is not None:
        send_error(conn, "not_allowed_now", "already joined")
        return
    held = room.players.get(msg.role)
    if held is not None:
        if held.is_bot or (held.conn is None and settings.dev_mode):
            # A virtual bot seat, or (Dev Mode) a disconnected human seat: take it over.
            held.is_bot = False
            held.name, held.lang, held.gender = msg.name, msg.lang, msg.gender
            rebind(room, conn, held)
            return
        send_error(conn, "role_taken", f"{msg.role} is taken")
        return
    if room.status != "LOBBY":
        send_error(conn, "not_allowed_now", "game in progress")
        return
    p = new_player(msg.name, msg.role, msg.lang, msg.gender)
    room.players[msg.role] = p
    _bind(room, conn, p)
    log_event(log, "join", room=room.code, role=p.role, lang=p.lang, player=p.id)
    send(p, joined_msg(p))
    broadcast_room_state(room)
    maybe_start(room)


def joined_msg(p: Player) -> Joined:
    return Joined(
        type="joined",
        player_id=p.id,
        token=p.token,
        role=p.role,
        lang=p.lang,
        gender=p.gender,
        name=p.name,
    )


def _bind(room: Room, conn: Connection, p: Player) -> None:
    if p.conn is not None and p.conn is not conn:
        old = p.conn
        old.player_id = None
        room.spectators.add(old)
    p.conn = conn
    p.disconnected_at = None
    conn.player_id = p.id
    room.spectators.discard(conn)
    room.last_activity = room.clock.monotonic()


def rebind(room: Room, conn: Connection, p: Player) -> None:
    """Re-attach a player to a new connection and send the rejoin snapshot (§B7)."""
    _bind(room, conn, p)
    log_event(log, "rejoin", room=room.code, role=p.role, player=p.id)
    send(p, joined_msg(p))
    broadcast_room_state(room)
    if room.game is not None and room.status != "LOBBY":
        from app import game

        game.send_snapshot(room, p)
        game.maybe_resume(room)
    else:
        maybe_start(room)


def handle_update_player(room: Room, p: Player, msg: UpdatePlayerMsg) -> None:
    """`update_player` (LOBBY only): change fields, reset ready (§B7)."""
    if room.status != "LOBBY":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="lobby only"))
        return
    if msg.role is not None and msg.role != p.role:
        other = room.players.get(msg.role)
        if other is not None:
            send(p, ErrorMsg(type="error", code="role_taken", message=f"{msg.role} is taken"))
            return
        del room.players[p.role]
        p.role = msg.role
        room.players[p.role] = p
    if msg.name is not None:
        p.name = msg.name
    if msg.lang is not None:
        p.lang = msg.lang
    if msg.gender is not None:
        p.gender = msg.gender
    p.ready = False
    send(p, joined_msg(p))
    broadcast_room_state(room)


def handle_ready(room: Room, p: Player, msg: ReadyMsg) -> None:
    """`ready` (LOBBY only)."""
    if room.status != "LOBBY":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="lobby only"))
        return
    p.ready = msg.ready
    broadcast_room_state(room)
    maybe_start(room)


def on_disconnect(room: Room, conn: Connection) -> None:
    """Socket closed: mark the player disconnected; pause a running game (§B8.4)."""
    room.spectators.discard(conn)
    p = room.player_by_id(conn.player_id)
    conn.player_id = None
    room.last_activity = room.clock.monotonic()
    if p is None or p.conn is not conn:
        return
    p.conn = None
    p.disconnected_at = room.clock.monotonic()
    from app import game

    game.on_player_disconnect(room, p)
    broadcast_room_state(room)
    stamp = p.disconnected_at

    def free_slot() -> None:
        if p.conn is None and p.disconnected_at == stamp and room.status in ("LOBBY", "DECK"):
            if room.players.get(p.role) is p:
                del room.players[p.role]
            broadcast_room_state(room)

    room.schedule(
        RECONNECT_GRACE_S * 1000,
        free_slot,
        key=lambda: (p.conn is None, p.disconnected_at),
    )


# ------------------------------------------------------------------------------- registry


def new_code(taken: set[str] | dict[str, Room]) -> str:
    """A random unused 4-letter room code (§A4)."""
    while True:
        code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(4))
        if code not in taken:
            return code


class Registry:
    """All rooms in this process (§B7)."""

    def __init__(self, svc: Services) -> None:
        self.svc = svc
        self.rooms: dict[str, Room] = {}

    def create(
        self,
        *,
        code: str | None = None,
        demo: bool | None = None,
        mock: bool | None = None,
        seed: int | None = None,
    ) -> Room:
        """Create a room; overrides are already filtered by the caller (§A4)."""
        s = self.svc.settings
        room = Room(
            code=code or new_code(self.rooms),
            svc=self.svc,
            created_at=self.svc.clock.monotonic(),
            demo=s.demo_mode or bool(demo),
            mock_speech=s.mock_speech if mock is None else mock,
            seed_override=seed,
            last_activity=self.svc.clock.monotonic(),
        )
        self.rooms[room.code] = room
        log_event(log, "room_created", room=room.code, demo=room.demo, mock=room.mock_speech)
        return room

    def get(self, code: str) -> Room | None:
        return self.rooms.get(code.upper())

    def sweep(self) -> list[str]:
        """Delete rooms with no connected human for ROOM_IDLE_TTL_S (and their clips)."""
        now = self.svc.clock.monotonic()
        gone = []
        for code, room in list(self.rooms.items()):
            if room.any_human_connected():
                room.last_activity = now
                continue
            if now - room.last_activity >= self.svc.settings.room_idle_ttl_s:
                room.ticker = None
                room.bump()
                room.cancel_tasks()
                room.clips.clear()
                del self.rooms[code]
                gone.append(code)
        return gone
