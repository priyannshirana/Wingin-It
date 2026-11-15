"""Abuse and cost limits (§B22)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import orjson
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.game import start_translation
from app.limits import DailyCap
from app.main import create_app, handle_audio, handle_text
from tests.conftest import MakeRoom, Table, make_settings
from tests.test_deck import FakeReporter
from tests.test_speech import Factory

FRAME = b"\x00\x01" * 1600


def _client(**overrides: object) -> TestClient:
    return TestClient(create_app(make_settings(**overrides)))


def test_room_creation_429_after_limit() -> None:
    with _client(rooms_per_ip=3) as c:
        codes = [c.post("/api/rooms", json={}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_room_creation_body_on_429() -> None:
    with _client(rooms_per_ip=1) as c:
        c.post("/api/rooms", json={})
        r = c.post("/api/rooms", json={})
    assert r.status_code == 429 and r.json() == {"error": "rate_limited"}


def test_room_lookup_rate_limited() -> None:
    with _client(room_gets_per_min_per_ip=2) as c:
        codes = [c.get("/api/rooms/ABCD").status_code for _ in range(3)]
    assert codes == [404, 404, 429]


def test_ws_per_ip_cap() -> None:
    with _client(ws_per_ip=2) as c:
        code = c.post("/api/rooms", json={}).json()["code"]
        with c.websocket_connect(f"/ws/{code}") as a, c.websocket_connect(f"/ws/{code}") as b:
            assert a.receive_json()["type"] == "welcome"
            assert b.receive_json()["type"] == "welcome"
            with pytest.raises(WebSocketDisconnect) as ei, c.websocket_connect(f"/ws/{code}"):
                pass
            assert ei.value.code == 1008
        # slots are released when sockets close
        with c.websocket_connect(f"/ws/{code}") as d:
            assert d.receive_json()["type"] == "welcome"


def test_message_flood_gets_rate_limited_then_closed() -> None:
    with _client() as c:
        code = c.post("/api/rooms", json={}).json()["code"]
        with c.websocket_connect(f"/ws/{code}") as ws:
            ws.receive_json()
            ws.receive_json()
            ping = orjson.dumps({"type": "ping", "client_ms": 1}).decode()
            for _ in range(400):
                ws.send_text(ping)
            seen_error = False
            with pytest.raises(WebSocketDisconnect) as ei:
                while True:
                    m = ws.receive_json()
                    seen_error = seen_error or m.get("code") == "rate_limited"
            assert ei.value.code == 1008
            assert seen_error


async def test_flood_marks_connection_abusive(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    conn = t.flyer.conn
    for _ in range(200):
        await handle_text(t.room, conn, '{"type":"ping","client_ms":1}')
    assert conn.abusive
    assert any(m.get("code") == "rate_limited" for m in t.flyer.of("error"))


async def test_normal_play_never_rate_limited(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.play_to_deck()
    assert not t.flyer.conn.abusive and not t.tower.conn.abusive
    assert not [m for m in t.flyer.of("error") if m["code"] == "rate_limited"]


async def test_audio_frames_beyond_double_real_time_dropped(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    conn = t.flyer.conn
    for _ in range(60):  # 60 frames in one instant: bucket holds 20
        await handle_audio(t.room, conn, FRAME)
    assert conn.strikes and len(conn.strikes) >= 30
    assert [m for m in t.flyer.of("error") if m["code"] == "rate_limited"]


async def test_room_max_age_closes_playing_room(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    assert t.room.status != "LOBBY"
    reg = t.h.registry
    t.clock.advance(59 * 60_000)
    assert reg.sweep() == []
    t.clock.advance(2 * 60_000)
    assert reg.sweep() == [t.room.code]
    assert t.room.code not in reg.rooms


async def _ptt_room(make_room: MakeRoom, **settings: Any) -> Table:
    t = await make_room(seed=1, mock=False, **settings)
    t.room.svc.open_session = Factory(transcript="Yes")
    t.until_active()
    t.clear()
    return t


async def test_transcribe_room_cap_refuses_ptt(make_room: MakeRoom) -> None:
    t = await _ptt_room(make_room, transcribe_room_min=1)
    t.room.charge_transcribe(60)
    await t.flyer.send({"type": "ptt_start"})
    assert t.last("flyer", "error")["code"] == "transcribe_failed"
    assert t.room.channel_holder is None


async def test_transcribe_daily_cap_refuses_then_resets_next_utc_day(make_room: MakeRoom) -> None:
    t = await _ptt_room(make_room, transcribe_daily_min=1)
    t.room.charge_transcribe(60)
    await t.tower.send({"type": "ptt_start"})
    assert t.last("tower", "error")["code"] == "transcribe_failed"
    t.clock.advance(86_400_000)
    t.room.transcribe_s = 0
    await t.tower.send({"type": "ptt_start"})
    assert t.room.channel_holder == "tower"


async def test_transmission_seconds_are_charged(make_room: MakeRoom) -> None:
    t = await _ptt_room(make_room)
    await t.flyer.send({"type": "ptt_start"})
    for _ in range(10):
        t.clock.advance(100)
        await handle_audio(t.room, t.flyer.conn, FRAME)
    await t.flyer.send({"type": "ptt_end"})
    await t.settle()
    assert t.room.transcribe_s == pytest.approx(1.0)
    assert t.room.svc.limits.transcribe.used == pytest.approx(1.0)


def test_daily_cap_warns_once_and_resets(caplog: pytest.LogCaptureFixture) -> None:
    cap = DailyCap("translate_calls", 2)
    assert cap.take(0) and cap.take(0)
    with caplog.at_level("WARNING"):
        assert not cap.take(0) and not cap.take(0)
    assert len([r for r in caplog.records if r.levelname == "WARNING"]) == 1
    assert cap.take(86_400_000)


async def test_translate_cap_falls_back_to_authored_lines(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, mock=False, mock_speech=False, translate_daily_calls=1)
    calls: list[str] = []

    class Spy:
        async def translate(self, text: str, src: str, dst: str) -> str:
            calls.append(text)
            return "x"

    t.room.svc.translator = Spy()  # type: ignore[assignment]

    def utt() -> Any:
        return SimpleNamespace(
            listener_lang="hi",
            lang="en",
            transcript="hello",
            translation=None,
            translation_status="pending",
            translation_event=asyncio.Event(),
        )

    start_translation(t.room, utt())
    start_translation(t.room, utt())
    await t.settle()
    assert calls == ["hello"]  # the second call never reached the paid translator


async def test_bedrock_cap_uses_template_report(make_room: MakeRoom) -> None:
    t = await make_room(
        seed=5, mock=False, bedrock_model_id="anthropic.test", bedrock_daily_reports=0
    )
    rep = FakeReporter("never")
    t.room.svc.reporter = rep
    await t.play_to_deck(naturally=True)
    await t.settle()
    d = t.last("flyer", "deck")
    assert d["report_pending"] is False and d["report"].startswith("Flyer and Tower landed")
    assert rep.prompts == []
