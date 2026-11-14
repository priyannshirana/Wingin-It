"""FastAPI app: routes, the WebSocket endpoint and startup validation (§A4, §A5, §B7, §B17)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import orjson
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, ValidationError

from app import VERSION, dev, game
from app.config import HI_STREAMING_REGIONS, Settings, get_settings
from app.constants import (
    BYTES_PER_SECOND,
    MAX_FRAME_BYTES,
    MAX_TEXT_FRAME_BYTES,
    MAX_UTTERANCE_BUFFER_S,
    MAX_UTTERANCE_MS,
    MIN_UTTERANCE_MS,
    PARTIAL_MIN_INTERVAL_MS,
    RATE_LIMITED_NOTICE_GAP_MS,
    RATE_SAY_TEXT_MIN_GAP_MS,
    ROOM_CLEANUP_INTERVAL_S,
    TRANSCRIBE_FINAL_TIMEOUT_MS,
)
from app.content import load_content, load_validator
from app.deck import BedrockReporter
from app.language.lexicon import Lexicon
from app.language.normalize import gaps, nfc, tokenize
from app.language.romanize import display_line
from app.logging_setup import log_event, setup_logging
from app.persistence import DynamoPersister, NoopPersister
from app.protocol import (
    C2S,
    CaptionPartial,
    ChannelMsg,
    DevMsg,
    ErrorMsg,
    InteractMsg,
    JoinMsg,
    LifelineMsg,
    PingMsg,
    PlayAgainMsg,
    Pong,
    PresenterMsg,
    PttEndMsg,
    PttStartMsg,
    ReadyMsg,
    RetryMsg,
    SayTextMsg,
    SkipCinematicMsg,
    SwapRolesMsg,
    UpdatePlayerMsg,
    UtteranceDropped,
    Welcome,
    parse_c2s,
)
from app.rooms import (
    Clock,
    Connection,
    Player,
    RealClock,
    Registry,
    Room,
    Services,
    broadcast_all,
    handle_join,
    handle_ready,
    handle_update_player,
    on_disconnect,
    room_state_msg,
    send,
    send_conn,
    send_error,
)
from app.speech.base import Transmission, abort_transmission, finish_transmission, run_feeder
from app.speech.transcribe_aws import aws_session_factory
from app.speech.translate import AwsTranslator, MockTranslator

log = logging.getLogger("wingin.main")
DEV_CODE = re.compile(r"^[A-Z]{4}$")


class CreateRoomReq(BaseModel):
    """`POST /api/rooms` body (§A4)."""

    model_config = ConfigDict(extra="forbid")
    demo: bool | None = None
    seed: int | None = None
    mock: bool | None = None


def build_services(settings: Settings, clock: Clock | None = None) -> Services:
    """Load + validate content and wire every service (§B6.1)."""
    content = load_content(settings.content_dir)
    lexicon = Lexicon(content.lexicon)
    validator = load_validator(settings.content_dir)
    report = validator.validate(content, lexicon)
    if not report.ok:
        log_event(log, "content_invalid", level=logging.ERROR, report=report.text())
        raise SystemExit(1)
    svc = Services(settings=settings, content=content, lexicon=lexicon, clock=clock or RealClock())
    wire_speech(svc)
    return svc


def wire_speech(svc: Services) -> None:
    """Translators and the speech-session factory (§B13.1, §B14.1)."""
    s = svc.settings
    svc.mock_translator = MockTranslator(svc.content, svc.lexicon)
    svc.persister = DynamoPersister(s.ddb_table, s.aws_region) if s.ddb_table else NoopPersister()
    if not s.mock_speech and s.bedrock_model_id:
        svc.reporter = BedrockReporter(s.aws_region, s.bedrock_model_id)
    if not s.mock_speech:
        svc.translator = AwsTranslator(s.aws_region, s.translate_terminology)
        svc.open_session = aws_session_factory(s)


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    """Build the FastAPI app; content is validated in the lifespan (§B6.1)."""
    s = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        setup_logging(s.log_level)
        svc = build_services(s, clock)
        app.state.svc = svc
        app.state.registry = Registry(svc)
        app.state.conns = set()
        if not s.mock_speech and s.aws_region not in HI_STREAMING_REGIONS:
            log_event(log, "region_warning", level=logging.WARNING, region=s.aws_region)
        cleanup = asyncio.create_task(_cleanup_loop(app.state.registry))
        log_event(log, "startup", mock=s.mock_speech, dev=s.dev_mode, demo=s.demo_mode)
        try:
            yield
        finally:
            cleanup.cancel()
            conns: set[Connection] = app.state.conns
            for conn in list(conns):
                if conn.ws is not None:
                    with contextlib.suppress(RuntimeError, OSError):
                        await conn.ws.close(code=1012)
            for room in app.state.registry.rooms.values():
                room.cancel_tasks()

    app = FastAPI(title="Wingin' it!", version=VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(s.allowed_origins),
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" if s.dev_mode else None,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    _routes(app, s)
    return app


async def _cleanup_loop(registry: Registry) -> None:
    while True:
        await asyncio.sleep(ROOM_CLEANUP_INTERVAL_S)
        gone = registry.sweep()
        for code in gone:
            log_event(log, "room_deleted", room=code)


def _routes(app: FastAPI, s: Settings) -> None:
    @app.get("/health")
    async def health(request: Request) -> dict[str, Any]:
        registry: Registry = request.app.state.registry
        return {
            "ok": True,
            "mock_speech": s.mock_speech,
            "dev_mode": s.dev_mode,
            "demo_mode": s.demo_mode,
            "rooms": len(registry.rooms),
            "version": VERSION,
        }

    @app.post("/api/rooms")
    async def create_room(request: Request, body: CreateRoomReq | None = None) -> JSONResponse:
        registry: Registry = request.app.state.registry
        if len(registry.rooms) >= s.max_rooms:
            return JSONResponse({"error": "too many rooms"}, status_code=503)
        req = body or CreateRoomReq()
        overrides = s.dev_mode or s.demo_mode
        room = registry.create(
            demo=req.demo if overrides else None,
            mock=req.mock if overrides else None,
            seed=req.seed if s.dev_mode else None,
        )
        return JSONResponse({"code": room.code})

    @app.get("/api/rooms/{code}")
    async def get_room(request: Request, code: str) -> JSONResponse:
        registry: Registry = request.app.state.registry
        room = registry.get(code)
        if room is None:
            return JSONResponse({"exists": False}, status_code=404)
        return JSONResponse(
            {
                "exists": True,
                "status": room.status,
                "roles_taken": sorted(room.players),
                "demo": room.demo,
            }
        )

    @app.get("/clips/{clip_name}")
    async def get_clip(request: Request, clip_name: str) -> Response:
        registry: Registry = request.app.state.registry
        if not clip_name.endswith(".wav"):
            return Response(status_code=404)
        clip_id = clip_name[: -len(".wav")]
        for room in registry.rooms.values():
            data = room.clips.get(clip_id)
            if data is not None:
                return Response(
                    content=data,
                    media_type="audio/wav",
                    headers={"Cache-Control": "private, max-age=3600"},
                )
        return Response(status_code=404)

    @app.websocket("/ws/{code}")
    async def ws_endpoint(ws: WebSocket, code: str) -> None:
        await websocket_session(ws, code, s)


# ------------------------------------------------------------------------ WebSocket (§B7)


async def _writer(ws: WebSocket, conn: Connection) -> None:
    """The only writer for this socket: drains the connection queue."""
    try:
        while True:
            data = await conn.queue.get()
            if data is None:
                break
            await ws.send_text(data)
    except (WebSocketDisconnect, RuntimeError, OSError):
        conn.closed = True
    except Exception:
        log.exception("writer failed")
        conn.closed = True


async def websocket_session(ws: WebSocket, raw_code: str, s: Settings) -> None:
    """One socket: origin check, handshake, receive loop, disconnect (§B7)."""
    registry: Registry = ws.app.state.registry
    if not s.origin_allowed(ws.headers.get("origin")):
        await ws.close(code=4403)
        return
    code = raw_code.upper()
    room = registry.get(code)
    if room is None:
        if s.dev_mode and DEV_CODE.match(code):
            room = registry.create(code=code)
        else:
            await ws.accept()
            await ws.send_text(
                orjson.dumps(
                    {"type": "error", "code": "room_not_found", "message": "no such room"}
                ).decode()
            )
            await ws.close(code=4404)
            return
    await ws.accept()
    conn = Connection(ws=ws)
    conn.writer = asyncio.create_task(_writer(ws, conn))
    conns: set[Connection] = ws.app.state.conns
    conns.add(conn)
    async with room.lock:
        on_connect(room, conn)
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            text = msg.get("text")
            if text is not None:
                await handle_text(room, conn, text)
                continue
            data = msg.get("bytes")
            if data is not None:
                await handle_audio(room, conn, data)
    except WebSocketDisconnect:
        pass
    finally:
        conns.discard(conn)
        conn.close()
        if conn.writer is not None:
            conn.writer.cancel()
        async with room.lock:
            on_disconnect(room, conn)
            room.after_handle()


def on_connect(room: Room, conn: Connection) -> None:
    """Handshake: spectator until `join`; welcome + room_state (§A5)."""
    room.spectators.add(conn)
    room.last_activity = room.clock.monotonic()
    send_conn(
        conn,
        Welcome(
            type="welcome",
            server_ms=room.now_ms(),
            room_code=room.code,
            mock_speech=room.mock_speech,
            dev_mode=room.svc.settings.dev_mode,
            demo=room.demo,
            gloss_threshold=room.svc.settings.gloss_threshold,
            version=VERSION,
        ),
    )
    send_conn(conn, room_state_msg(room))


def _rate_limited(room: Room, conn: Connection) -> None:
    now = room.clock.monotonic() * 1000
    if now - conn.last_rate_notice_ms >= RATE_LIMITED_NOTICE_GAP_MS:
        conn.last_rate_notice_ms = now
        send_error(conn, "rate_limited", "slow down")


async def handle_text(room: Room, conn: Connection, raw: str) -> None:
    """Parse, rate-limit and route one text frame (§B7, §B17)."""
    now_s = room.clock.monotonic()
    if len(raw.encode()) > MAX_TEXT_FRAME_BYTES:
        send_error(conn, "bad_message", "frame too large")
        return
    if not conn.text_bucket.allow(now_s):
        _rate_limited(room, conn)
        return
    try:
        msg: C2S = parse_c2s(orjson.loads(raw))
    except (orjson.JSONDecodeError, ValidationError, TypeError):
        send_error(conn, "bad_message", "invalid message")
        return
    if isinstance(msg, InteractMsg) and not conn.interact_bucket.allow(now_s):
        _rate_limited(room, conn)
        return
    if isinstance(msg, SayTextMsg):
        if now_s * 1000 - conn.last_say_ms < RATE_SAY_TEXT_MIN_GAP_MS:
            _rate_limited(room, conn)
            return
        conn.last_say_ms = now_s * 1000
    if isinstance(msg, PingMsg):
        send_conn(conn, Pong(type="pong", client_ms=msg.client_ms, server_ms=room.now_ms()))
        return
    if isinstance(msg, LifelineMsg | PttEndMsg):
        await handle_async(room, conn, msg)
        return
    async with room.lock:
        try:
            dispatch(room, conn, msg)
        except Exception:
            log.exception("handler failed", extra={"room": room.code})
            send_error(conn, "internal", "internal error")
        room.after_handle()


def dispatch(room: Room, conn: Connection, msg: C2S) -> None:
    """Route a parsed message to its module (lock held, no awaits)."""
    room.last_activity = room.clock.monotonic()
    if isinstance(msg, JoinMsg):
        handle_join(room, conn, msg)
        return
    p = room.player_by_id(conn.player_id)
    if p is None:
        send_error(conn, "not_joined", "join first")
        return
    match msg:
        case UpdatePlayerMsg():
            handle_update_player(room, p, msg)
        case ReadyMsg():
            handle_ready(room, p, msg)
        case PttStartMsg():
            handle_ptt_start(room, p)
        case SayTextMsg():
            game.handle_say_text(room, p, msg)
        case InteractMsg():
            game.handle_interact(room, p, msg)
        case SkipCinematicMsg():
            game.handle_skip(room, p)
        case RetryMsg():
            game.handle_retry(room, p)
        case PlayAgainMsg():
            game.handle_play_again(room, p)
        case SwapRolesMsg():
            game.handle_swap_roles(room, p)
        case PresenterMsg():
            dev.handle_presenter(room, p, msg)
        case DevMsg():
            dev.handle_dev(room, p, msg)
        case _:
            send_error(conn, "bad_message", "unexpected message")


async def handle_async(room: Room, conn: Connection, msg: LifelineMsg | PttEndMsg) -> None:
    """Handlers that await slow work; they release the room lock while waiting."""
    async with room.lock:
        p = room.player_by_id(conn.player_id)
        if p is None:
            send_error(conn, "not_joined", "join first")
            return
        tx = room.transmission
        if isinstance(msg, PttEndMsg) and (tx is None or tx.player_id != p.id):
            send_error(conn, "not_allowed_now", "not transmitting")
            room.after_handle()
            return
    if isinstance(msg, PttEndMsg):
        if tx is not None:
            await end_transmission(room, tx)
        return
    await game.handle_lifeline(room, p, msg)


# -------------------------------------------------------------- push-to-talk (§B13.2)


def handle_ptt_start(room: Room, p: Player) -> None:
    """Grant the radio channel and open a Transcribe stream (lock held, no awaits)."""
    if room.status == "DECK":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="game over"))
        return
    holder = room.channel_holder
    if holder is not None and holder != p.role:
        send(p, ErrorMsg(type="error", code="channel_busy", message="channel busy"))
        return
    if holder == p.role:
        return  # already transmitting
    if room.mock_speech:
        send(p, ErrorMsg(type="error", code="mock_only", message="mock rooms use say_text"))
        return
    factory = room.svc.open_session
    if factory is None:
        send(p, ErrorMsg(type="error", code="transcribe_failed", message="speech unavailable"))
        return
    room.channel_holder = p.role
    room.channel_token += 1
    tx = Transmission(
        role=p.role,
        player_id=p.id,
        lang=p.lang,
        token=room.channel_token,
        started_at=room.clock.monotonic(),
    )
    room.transmission = tx
    broadcast_all(room, ChannelMsg(type="channel", busy_by=p.role))

    async def on_partial(text: str) -> None:
        send_partial(room, tx, text)

    tx.feeder = room.spawn(run_feeder(tx, factory, on_partial))

    def force_end() -> None:
        if room.transmission is tx:
            room.spawn(end_transmission(room, tx))

    room.schedule(MAX_UTTERANCE_MS + 500, force_end, key=lambda: room.channel_token, notify=False)


def send_partial(room: Room, tx: Transmission, text: str) -> None:
    """`caption_partial` to the speaker: romanized like the echo, throttled to 5/s."""
    now = room.clock.monotonic() * 1000
    if room.transmission is not tx or now - tx.last_partial_ms < PARTIAL_MIN_INTERVAL_MS:
        return
    tx.last_partial_ms = now
    speaker = room.player_by_id(tx.player_id)
    toks = tokenize(text)
    lexicon = room.svc.lexicon
    shown = display_line(toks, gaps(text, toks), tx.lang, lexicon.match(toks, tx.lang), lexicon)
    send(speaker, CaptionPartial(type="caption_partial", text=shown))


async def handle_audio(room: Room, conn: Connection, data: bytes) -> None:
    """Binary frame: accepted only from the channel holder, size-checked (§A5, §B17)."""
    async with room.lock:
        tx = room.transmission
        p = room.player_by_id(conn.player_id)
        if tx is None or p is None or tx.player_id != p.id:
            return  # not holding the channel: drop silently
        if len(data) % 2 or len(data) > MAX_FRAME_BYTES or not data:
            return
        if not conn.audio_bucket.allow(room.clock.monotonic()):
            _rate_limited(room, conn)
            return
        if len(tx.buffer) + len(data) > MAX_UTTERANCE_BUFFER_S * BYTES_PER_SECOND:
            return
        tx.buffer += data
        tx.frames.put_nowait(data)


async def end_transmission(room: Room, tx: Transmission) -> None:
    """`ptt_end` (or the 12.5 s force end): release, transcribe, finalize (§B13.2)."""
    async with room.lock:
        if room.transmission is not tx:
            return
        room.transmission = None
        room.channel_holder = None
        room.channel_token += 1
        broadcast_all(room, ChannelMsg(type="channel", busy_by=None))
        speaker = room.player_by_id(tx.player_id)
        duration_ms = len(tx.buffer) / BYTES_PER_SECOND * 1000
        released_at = room.clock.monotonic()
        too_short = duration_ms < MIN_UTTERANCE_MS
        if too_short:
            send(speaker, UtteranceDropped(type="utterance_dropped", reason="too_short"))
        room.after_handle()
    if too_short:
        await abort_transmission(tx)
        return
    result = await finish_transmission(tx, TRANSCRIBE_FINAL_TIMEOUT_MS / 1000)
    async with room.lock:
        speaker = room.player_by_id(tx.player_id)
        if speaker is None:
            return
        if not result.ok:
            log_event(
                log, "transcribe_fail", level=logging.WARNING, room=room.code, err=result.error
            )
            send(speaker, UtteranceDropped(type="utterance_dropped", reason="transcribe_failed"))
            game.toast(room, {speaker.role}, "error", "toast.didnt_catch")
        elif not result.transcript.strip():
            send(speaker, UtteranceDropped(type="utterance_dropped", reason="no_speech"))
        else:
            game.finalize_utterance(
                room,
                speaker,
                nfc(result.transcript),
                tx.lang,
                items=[i.model_copy(update={"token": nfc(i.token)}) for i in result.items],
                pcm=bytes(tx.buffer),
                released_at=released_at,
            )
        room.after_handle()


app = create_app()
