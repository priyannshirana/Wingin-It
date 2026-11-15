"""§B13 real-speech path with fakes only: SDK arguments, handler, translator, push-to-talk."""

from __future__ import annotations

import asyncio
import inspect
import re
from typing import Any

import pytest
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.model import Alternative, Item, Result, Transcript, TranscriptEvent
from botocore.exceptions import ClientError

from app.config import Settings
from app.main import handle_audio
from app.protocol import Lang
from app.rooms import wait_for
from app.speech.base import PartialCallback, SpeechSession, WordItem
from app.speech.transcribe_aws import Handler, stream_kwargs
from app.speech.transcribe_mock import MockSession
from app.speech.translate import AwsTranslator, TranslateError
from tests.conftest import MakeRoom, Table, make_settings

DEVA = re.compile(r"[ऀ-ॿ]")
FRAME = b"\x01\x00" * 1600  # 100 ms of 16 kHz PCM16


# ---------------------------------------------------------------- SDK arguments (§B13.3)


@pytest.mark.parametrize("multi", [True, False])
@pytest.mark.parametrize("lang", ["hi", "en"])
def test_stream_kwargs_bind_to_the_installed_sdk(multi: bool, lang: Lang) -> None:
    s = make_settings(
        transcribe_multi_lang=multi, transcribe_vocab_hi="wingin-hi", transcribe_vocab_en="w-en"
    )
    kwargs = stream_kwargs(s, lang)
    sig = inspect.signature(TranscribeStreamingClient.start_stream_transcription)
    sig.bind(None, **kwargs)  # raises TypeError on any wrong parameter name
    if multi:
        assert kwargs["language_code"] is None and kwargs["identify_multiple_languages"] is True
        assert kwargs["language_options"] == ["hi-IN", "en-US"]
        assert kwargs["preferred_language"] == ("hi-IN" if lang == "hi" else "en-US")
        assert kwargs["vocabulary_names"] == ["wingin-hi", "w-en"]
    else:
        assert kwargs["language_code"] == ("hi-IN" if lang == "hi" else "en-US")
        assert kwargs["vocabulary_name"] == ("wingin-hi" if lang == "hi" else "w-en")
    assert kwargs["media_sample_rate_hz"] == 16000 and kwargs["media_encoding"] == "pcm"


def test_multi_language_is_opt_in() -> None:
    # §B3: single-language per speaker unless TRANSCRIBE_MULTI_LANG=1.
    assert Settings.from_env({}).transcribe_multi_lang is False
    assert Settings.from_env({"TRANSCRIBE_MULTI_LANG": "1"}).transcribe_multi_lang is True
    assert stream_kwargs(Settings.from_env({}), "hi")["language_code"] == "hi-IN"


async def test_handler_partials_and_finals() -> None:
    partials: list[str] = []

    async def on_partial(text: str) -> None:
        partials.append(text)

    h = Handler(stream=None, on_partial=on_partial)  # type: ignore[arg-type]
    part = Result(is_partial=True, alternatives=[Alternative("तीन नं", [], [])])
    final = Result(
        is_partial=False,
        alternatives=[
            Alternative(
                "तीन नंबर।",
                [
                    Item(0.1, 0.4, "pronunciation", "तीन", confidence=0.9),
                    Item(0.4, 0.8, "pronunciation", "नंबर", confidence=0.8),
                    Item(None, None, "punctuation", "।"),
                ],
                [],
            )
        ],
    )
    await h.handle_transcript_event(TranscriptEvent(Transcript([part, final])))
    assert partials == ["तीन नं"]
    assert h.finals[0].transcript == "तीन नंबर।"
    assert [i.kind for i in h.finals[0].items] == ["pronunciation", "pronunciation", "punctuation"]
    assert h.finals[0].items[0].start_s == 0.1 and h.finals[0].items[0].confidence == 0.9


# ----------------------------------------------------------------- translator (§B14.1)


class FakeTranslateClient:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = fail

    def translate_text(self, **kw: Any) -> dict[str, str]:
        self.calls.append(kw)
        if self.fail:
            raise ClientError({"Error": {"Code": "Throttling", "Message": "x"}}, "TranslateText")
        return {"TranslatedText": f"<{kw['TargetLanguageCode']}>{kw['Text']}"}


async def test_aws_translator_with_fake_client() -> None:
    client = FakeTranslateClient()
    tr = AwsTranslator("us-east-1", "wingin-terms", client=client)
    assert await tr.translate("teen", "hi", "en") == "<en>teen"
    assert client.calls[0]["TerminologyNames"] == ["wingin-terms"]
    assert client.calls[0]["SourceLanguageCode"] == "hi"
    assert await tr.translate("same", "en", "en") == "same"
    assert len(client.calls) == 1
    bad = AwsTranslator("us-east-1", "", client=FakeTranslateClient(fail=True))
    with pytest.raises(TranslateError):
        await bad.translate("x", "en", "hi")


# --------------------------------------------------------------- wait_for (all Pythons)


async def test_wait_for_keeps_a_cancel_that_races_the_result() -> None:
    # 3.11's asyncio.wait_for returned the result and dropped this cancel (bpo-42130): a
    # cancelled feeder lived on, and the event loop could never shut down.
    async def opened() -> int:
        return 1

    async def feeder() -> None:
        await wait_for(opened(), 5.0)
        await asyncio.Event().wait()

    task = asyncio.create_task(feeder())
    await asyncio.sleep(0)
    task.cancel()
    for _ in range(5):
        await asyncio.sleep(0)
    assert task.cancelled()


async def test_wait_for_non_positive_timeout() -> None:
    done: asyncio.Future[int] = asyncio.get_running_loop().create_future()
    done.set_result(7)
    assert await wait_for(done, 0) == 7
    with pytest.raises(TimeoutError):
        await wait_for(asyncio.Event().wait(), 0)


# -------------------------------------------------------------- push-to-talk (§B13.2)


class Factory:
    """Scripted MockSession per transmission."""

    def __init__(self, **kw: Any) -> None:
        self.kw = kw
        self.sessions: list[MockSession] = []
        self.langs: list[Lang] = []

    async def __call__(self, lang: Lang, on_partial: PartialCallback) -> SpeechSession:
        self.langs.append(lang)
        s = MockSession(on_partial, **self.kw)
        self.sessions.append(s)
        return s


async def real_room(make_room: MakeRoom, **kw: Any) -> tuple[Table, Factory]:
    t = await make_room(seed=1, mock=False)
    f = Factory(**kw)
    t.room.svc.open_session = f
    t.until_active()
    t.clear()
    return t, f


async def frames(t: Table, role: str, n: int, frame: bytes = FRAME) -> None:
    for _ in range(n):
        t.clock.advance(100)
        await handle_audio(t.room, t.clients[role].conn, frame)  # type: ignore[index]
    await t.settle()


HINDI_ITEMS = [
    WordItem(token="तीन", start_s=0.10, end_s=0.40, confidence=0.95),
    WordItem(token="नंबर", start_s=0.40, end_s=0.70, confidence=0.9),
    WordItem(token="बटन", start_s=0.70, end_s=1.00, confidence=0.9),
    WordItem(token="दबाओ", start_s=1.00, end_s=1.40, confidence=0.8),
    WordItem(token="।", start_s=None, end_s=None, confidence=None, kind="punctuation"),
]


async def test_channel_lock_and_full_transmission(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="तीन नंबर बटन दबाओ।", items=HINDI_ITEMS)
    await t.tower.send({"type": "ptt_start"})
    assert t.last("flyer", "channel") == {"type": "channel", "busy_by": "tower"}
    await t.flyer.send({"type": "ptt_start"})
    assert t.last("flyer", "error")["code"] == "channel_busy"
    await frames(t, "flyer", 3)  # not the holder: dropped
    await frames(t, "tower", 15)
    await handle_audio(t.room, t.tower.conn, b"\x00" * 7)  # odd length: dropped
    await handle_audio(t.room, t.tower.conn, b"\x00" * 6402)  # too big: dropped
    await t.settle()
    assert f.langs == ["hi"]
    assert len(f.sessions[0].fed) == 15 and all(fr == FRAME for fr in f.sessions[0].fed)
    await t.tower.send({"type": "ptt_end"})
    await t.settle()
    assert t.last("tower", "channel")["busy_by"] is None
    utt = t.last("flyer", "utterance")
    text = "".join(s["text"] for s in utt["segments"])
    assert text == "Teen number button dabao." and not DEVA.search(text)
    assert [s["concept"] for s in utt["segments"] if s["kind"] == "keyword"] == ["THREE", "PRESS"]
    assert t.last("tower", "utterance_echo")["transcript_display"] == "Teen number button dabao."
    u = t.room.utterances[-1]
    assert u.pcm is not None and len(u.pcm) == 15 * len(FRAME)
    assert u.latency_ms is not None and list(t.room.latencies_ms) == [u.latency_ms]
    assert len(u.tokens) == 4 and u.items[0].start_s == 0.10


async def test_too_short_is_dropped(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="haan")
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "flyer", 2)  # 200 ms < 300 ms
    await t.flyer.send({"type": "ptt_end"})
    await t.settle()
    assert t.last("flyer", "utterance_dropped")["reason"] == "too_short"
    assert f.sessions[0].aborted and not t.tower.of("utterance")


async def test_transcribe_failure_and_no_speech(make_room: MakeRoom) -> None:
    t, _ = await real_room(make_room, ok=False)
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "flyer", 5)
    await t.flyer.send({"type": "ptt_end"})
    await t.settle()
    assert t.last("flyer", "utterance_dropped")["reason"] == "transcribe_failed"
    assert t.last("flyer", "toast")["key"] == "toast.didnt_catch"
    t2, _ = await real_room(make_room, transcript="   ")
    await t2.flyer.send({"type": "ptt_start"})
    await frames(t2, "flyer", 5)
    await t2.flyer.send({"type": "ptt_end"})
    await t2.settle()
    assert t2.last("flyer", "utterance_dropped")["reason"] == "no_speech"


async def test_partials_romanized_and_throttled(make_room: MakeRoom) -> None:
    t, _ = await real_room(make_room, transcript="ok", partials=["तीन"] * 10)
    await t.tower.send({"type": "ptt_start"})
    for _ in range(10):
        t.clock.advance(50)  # 20 frames/s of partials: throttled to 5/s
        await handle_audio(t.room, t.tower.conn, FRAME)
        await t.settle()
    caps = t.tower.of("caption_partial")
    assert caps and all(c["text"] == "Teen" for c in caps)
    assert len(caps) <= 3
    assert not t.flyer.of("caption_partial")


async def test_max_utterance_forces_end(make_room: MakeRoom) -> None:
    t, _ = await real_room(make_room, transcript="Yes yes")
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "flyer", 5)
    t.advance(12_600)
    await t.settle()
    assert t.room.channel_holder is None
    assert t.last("tower", "utterance")["segments"]


async def test_disconnect_while_holding_releases_channel(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="Yes")
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "flyer", 5)
    await t.disconnect("flyer")
    await t.settle()
    assert t.room.channel_holder is None and t.room.transmission is None
    assert t.last("tower", "channel")["busy_by"] is None
    assert f.sessions[0].aborted


async def test_ptt_in_mock_room_is_mock_only(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.flyer.send({"type": "ptt_start"})
    assert t.last("flyer", "error")["code"] == "mock_only"
    n_errors = len(t.flyer.of("error"))
    await t.flyer.send({"type": "ptt_end"})
    assert len(t.flyer.of("error")) == n_errors  # §B13.2: non-holder ptt_end is ignored silently


async def test_stray_ptt_end_does_not_cut_off_partner(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="तीन नंबर बटन दबाओ।", items=HINDI_ITEMS)
    await t.tower.send({"type": "ptt_start"})
    await frames(t, "tower", 5)
    n_errors = len(t.flyer.of("error"))
    await t.flyer.send({"type": "ptt_end"})
    await t.settle()
    assert len(t.flyer.of("error")) == n_errors
    assert t.room.channel_holder == "tower" and t.room.transmission is not None
    assert t.last("flyer", "channel")["busy_by"] == "tower"
    assert not f.sessions[0].aborted


async def test_say_text_refused_in_real_room_without_dev_or_demo(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, mock=False, dev_mode=False)
    await t.say("tower", "teen")
    assert t.last("tower", "error")["code"] == "mock_only"
    t2 = await make_room(seed=1, mock=False, dev_mode=False, demo=True)
    await t2.say("tower", "teen")
    assert t2.last("flyer", "utterance")


async def test_talking_allowed_during_cinematics(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, mock=False)
    f = Factory(transcript="Yes")
    t.room.svc.open_session = f
    assert t.room.game is not None and t.room.game.cinematic is not None  # prologue
    await t.flyer.send({"type": "ptt_start"})
    assert t.room.channel_holder == "flyer"
    await asyncio.sleep(0)


# ------------------------------------------------------------- voice rooms (§A9, §B13.5)


async def test_voice_room_relays_accepted_frames_to_partner_only(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="Yes")
    t.room.voice = True
    other = bytes(range(256)) * 12 + b"\x00" * 128  # 3200 bytes, distinct content
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "tower", 3)  # not the holder: neither fed nor relayed
    await frames(t, "flyer", 2)
    await frames(t, "flyer", 1, other)
    await handle_audio(t.room, t.flyer.conn, b"\x00" * 7)  # rejected: not relayed
    await t.settle()
    t.drain()
    fed = f.sessions[0].fed
    assert t.tower.audio == fed == [FRAME, FRAME, other]
    assert t.flyer.audio == []
    await t.flyer.send({"type": "ptt_end"})
    await t.settle()
    await frames(t, "flyer", 2)  # channel released: nothing more
    t.drain()
    assert len(t.tower.audio) == 3 and t.flyer.audio == []


async def test_normal_room_relays_nothing(make_room: MakeRoom) -> None:
    t, f = await real_room(make_room, transcript="Yes")
    assert t.room.voice is False
    await t.flyer.send({"type": "ptt_start"})
    await frames(t, "flyer", 4)
    t.drain()
    assert len(f.sessions[0].fed) == 4
    assert t.tower.audio == [] and t.flyer.audio == []


async def test_mock_voice_room_never_relays(make_room: MakeRoom) -> None:
    from app.rooms import relay_audio

    t = await make_room(seed=1, mock=True)
    t.room.voice = True
    t.until_active()
    await t.flyer.send({"type": "ptt_start"})
    assert t.last("flyer", "error")["code"] == "mock_only"
    await frames(t, "flyer", 3)
    relay_audio(t.room, t.room.players["flyer"], FRAME)  # guard holds even if called directly
    t.drain()
    assert t.tower.audio == [] and t.flyer.audio == []


async def test_voice_relay_drops_when_partner_backs_up(make_room: MakeRoom) -> None:
    from app.constants import AUDIO_RELAY_MAX_QUEUED

    t, f = await real_room(make_room, transcript="Yes")
    t.room.voice = True
    await t.flyer.send({"type": "ptt_start"})
    for _ in range(AUDIO_RELAY_MAX_QUEUED + 10):  # tower's queue is never drained here
        t.clock.advance(100)
        await handle_audio(t.room, t.flyer.conn, FRAME)
    await t.settle()
    t.drain()
    assert 0 < len(t.tower.audio) <= AUDIO_RELAY_MAX_QUEUED  # backlog cap: the rest dropped
    assert len(f.sessions[0].fed) == AUDIO_RELAY_MAX_QUEUED + 10  # transcription unaffected


def test_voice_flag_in_http_welcome_and_room_state() -> None:
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app(make_settings(mock_speech=False))
    with TestClient(app) as client:
        voice = client.post("/api/rooms", json={"voice": True}).json()["code"]
        plain = client.post("/api/rooms", json={}).json()["code"]
        assert app.state.registry.get(voice).voice is True
        assert app.state.registry.get(plain).voice is False
        assert client.get(f"/api/rooms/{voice}").json()["voice"] is True
        assert client.get(f"/api/rooms/{plain}").json()["voice"] is False
        for code, want in ((voice, True), (plain, False)):
            with client.websocket_connect(f"/ws/{code}") as ws:
                assert ws.receive_json()["voice"] is want  # welcome
                assert ws.receive_json()["voice"] is want  # room_state
