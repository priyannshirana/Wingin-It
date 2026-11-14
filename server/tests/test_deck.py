"""§B15 word deck, clips, mission report, persistence."""

from __future__ import annotations

import asyncio
import io
import wave
from decimal import Decimal
from typing import Any

from botocore.exceptions import ClientError

from app import audio, deck
from app.deck import BedrockReporter, ReportError
from app.language.lexicon import Lexicon
from app.language.normalize import tokenize
from app.persistence import DynamoPersister, NoopPersister, to_dynamo
from app.speech.base import Utterance, WordItem
from tests.conftest import MakeRoom, Table


class RecordingPersister:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    async def save(self, item: dict[str, Any]) -> None:
        self.items.append(item)


async def finished(make_room: MakeRoom, **kw: Any) -> Table:
    t = await make_room(seed=5, **kw)
    t.room.svc.persister = RecordingPersister()
    await t.play_to_deck(naturally=True)
    await t.settle()
    return t


async def test_learned_rule_and_ordering(make_room: MakeRoom) -> None:
    t = await finished(make_room)
    d = t.last("flyer", "deck")
    words = d["words"]
    assert len(words) == 20
    for w in words:
        assert w["learned"] == (w["understood"] >= 1 or w["spoken"] >= 1)
    learned = [w for w in words if w["learned"]]
    assert d["learned_count"] == len(learned) > 0
    assert words[: len(learned)] == learned  # learned first
    scores = [w["understood"] + w["spoken"] for w in learned]
    assert scores == sorted(scores, reverse=True)
    order = [c.id for c in t.room.svc.content.lexicon.concepts]
    rest = [w["concept"] for w in words[len(learned) :]]
    assert rest == [c for c in order if c in rest]  # then lexicon order


async def test_meanings_in_own_script_words_in_partner_language(make_room: MakeRoom) -> None:
    t = await finished(make_room)
    tower_deck = t.last("tower", "deck")
    red = next(w for w in tower_deck["words"] if w["concept"] == "RED")
    assert red["word"] == "red" and red["meaning"] == "लाल" and red["meaning_script"] == "deva"
    assert tower_deck["partner_lang"] == "en" and tower_deck["partner_gender"] == "female"
    flyer_deck = t.last("flyer", "deck")
    red = next(w for w in flyer_deck["words"] if w["concept"] == "RED")
    assert red["word"] == "laal" and red["meaning"] == "red" and red["meaning_script"] == "latin"
    assert all(w["clip_url"] is None for w in flyer_deck["words"])  # mock: no clips


async def test_stats(make_room: MakeRoom) -> None:
    t = await finished(make_room)
    st = t.last("flyer", "deck")["stats"]
    assert [p["phase"] for p in st["phases"]] == [1, 2, 3]
    assert st["wrong_actions_total"] == 0 and st["lifelines_used"] == {"mine": 0, "partner": 0}
    assert st["fuel_left_final_s"] == st["phases"][2]["fuel_left_s"] > 0
    assert st["total_time_s"] > 0 and all(p["attempts"] == 1 for p in st["phases"])


async def test_template_report_without_bedrock(make_room: MakeRoom) -> None:
    t = await finished(make_room)
    d = t.last("flyer", "deck")
    assert d["report_pending"] is False
    assert d["report"].startswith("Flyer and Tower landed with ")
    assert "You learned" in d["report"]
    hi = t.last("tower", "deck")["report"]
    assert hi.startswith("Flyer और Tower ने ") and "शब्द सीखे" in hi


def test_template_drops_including_clause_below_two_words() -> None:
    assert deck.TEMPLATES_SHORT["en"].format(flyer="A", tower="B", fuel=3, n=1) == (
        "A and B landed with 3s of fuel to spare. You learned 1 words."
    )


class FakeReporter:
    def __init__(self, text: str | None = None, gate: asyncio.Event | None = None) -> None:
        self.text = text
        self.gate = gate
        self.prompts: list[str] = []

    async def report(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if self.gate is not None:
            await self.gate.wait()
        if self.text is None:
            raise ReportError("boom")
        return self.text


async def test_bedrock_report_pending_then_deck_report(make_room: MakeRoom) -> None:
    t = await make_room(seed=5, mock=False, bedrock_model_id="anthropic.test")
    gate = asyncio.Event()
    rep = FakeReporter("What a landing!", gate)
    t.room.svc.reporter = rep
    await t.play_to_deck(naturally=True)
    d = t.last("flyer", "deck")
    assert d["report"] is None and d["report_pending"] is True
    gate.set()
    await t.settle()
    assert t.last("flyer", "deck_report")["report"] == "What a landing!"
    assert t.last("tower", "deck_report")["report"] == "What a landing!"
    assert "Language: English" in rep.prompts[0] or "Language: English" in rep.prompts[1]
    assert any("Hindi (Devanagari script)" in p for p in rep.prompts)
    assert all('"flyer_gender": "female"' in p and "verb agreement" in p for p in rep.prompts)
    # Rejoin after the report arrived: the deck carries it.
    await t.disconnect("flyer")
    c = await t.rejoin("flyer")
    assert c.last("deck")["report"] == "What a landing!"


async def test_bedrock_failure_falls_back_to_template(make_room: MakeRoom) -> None:
    t = await make_room(seed=5, mock=False, bedrock_model_id="anthropic.test")
    t.room.svc.reporter = FakeReporter(None)
    await t.play_to_deck(naturally=True)
    await t.settle()
    report = t.last("flyer", "deck_report")["report"]
    assert report.startswith("Flyer and Tower landed")


async def test_mock_room_never_calls_bedrock(make_room: MakeRoom) -> None:
    t = await make_room(seed=5, mock=True, bedrock_model_id="anthropic.test")
    rep = FakeReporter("nope")
    t.room.svc.reporter = rep
    await t.play_to_deck(naturally=True)
    assert rep.prompts == [] and t.last("flyer", "deck")["report_pending"] is False


class FakeConverse:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.kw: dict[str, Any] = {}

    def converse(self, **kw: Any) -> dict[str, Any]:
        self.kw = kw
        if self.fail:
            raise ClientError({"Error": {"Code": "AccessDenied", "Message": "x"}}, "Converse")
        return {"output": {"message": {"content": [{"text": " Report! "}]}}}


async def test_bedrock_reporter_with_fake_client() -> None:
    c = FakeConverse()
    r = BedrockReporter("us-east-1", "m-1", client=c)
    assert await r.report("hi") == "Report!"
    assert c.kw["inferenceConfig"] == {"maxTokens": 200, "temperature": 0.7}
    assert c.kw["modelId"] == "m-1"
    bad = BedrockReporter("us-east-1", "m-1", client=FakeConverse(fail=True))
    try:
        await bad.report("hi")
        raise AssertionError("expected ReportError")
    except ReportError:
        pass


# ----------------------------------------------------------------------------- clips


def parse_wav(data: bytes) -> tuple[int, int, int, bytes]:
    with wave.open(io.BytesIO(data)) as w:
        return w.getnchannels(), w.getsampwidth(), w.getframerate(), w.readframes(10**9)


def test_wav_header() -> None:
    pcm = bytes(range(256)) * 10
    data = audio.wav_bytes(pcm)
    assert data[:4] == b"RIFF" and data[8:16] == b"WAVEfmt " and len(data) == 44 + len(pcm)
    assert parse_wav(data) == (1, 2, 16000, pcm)


def test_cut_with_padding_clamped_and_even() -> None:
    pcm = bytes(32000 * 2)  # 2 s
    clip = audio.cut(pcm, 0.5, 1.0)
    a, b = int((0.5 - 0.08) * 32000), int((1.0 + 0.12) * 32000)
    assert len(clip) == (b - b % 2) - (a - a % 2) and len(clip) % 2 == 0
    assert len(audio.cut(pcm, 0.01, 1.95)) == len(pcm)  # clamped both ends
    assert len(audio.cut(pcm, 0.1001, 0.3)) % 2 == 0


def _utt(lexicon: Lexicon, conf: float, pcm: bytes) -> Utterance:
    words = ["teen", "number", "button", "dabao"]
    items = [
        WordItem(token=w, start_s=0.2 + 0.3 * i, end_s=0.5 + 0.3 * i, confidence=conf)
        for i, w in enumerate(words)
    ]
    toks = tokenize(" ".join(words))
    return Utterance(
        id=f"u_{conf}",
        room="T",
        speaker_id="p_q",
        speaker_role="tower",
        speaker_name="Q",
        lang="hi",
        phase=1,
        level=1,
        action_id=None,
        transcript=" ".join(words),
        tokens=toks,
        gaps=[""] * 5,
        items=items,
        matches=lexicon.match(toks, "hi"),
        pcm=pcm,
    )


def test_clip_picks_best_confidence_and_is_valid_wav(lexicon: Lexicon) -> None:
    low = _utt(lexicon, 0.4, b"\x01\x00" * 32000)
    high = _utt(lexicon, 0.9, b"\x02\x00" * 32000)
    clips: dict[str, bytes] = {}
    url = audio.make_clip(clips, [low, high], "PRESS")
    assert url is not None and url.startswith("/clips/c_") and url.endswith(".wav")
    clip_id = url[len("/clips/") : -len(".wav")]
    ch, width, rate, frames = parse_wav(clips[clip_id])
    assert (ch, width, rate) == (1, 2, 16000)
    assert set(frames) == {2, 0}  # from the high-confidence utterance
    dabao = high.items[3]  # "dabao" is token 3
    assert dabao.start_s is not None and dabao.end_s is not None
    expected = audio.cut(high.pcm or b"", dabao.start_s, dabao.end_s)
    assert frames == expected
    assert audio.make_clip(clips, [low], "FIRE") is None


# ------------------------------------------------------------------------ persistence


async def test_game_item_persisted_at_ending(make_room: MakeRoom) -> None:
    t = await finished(make_room)
    p = t.room.svc.persister
    assert isinstance(p, RecordingPersister) and len(p.items) == 1
    item = p.items[0]
    assert item["game_id"].startswith("g_") and item["room"] == "TEST" and item["seed"] == 5
    assert item["demo"] is False and item["started_at"].endswith("Z")
    assert {x["role"]: x["gender"] for x in item["players"]} == {"flyer": "female", "tower": "male"}
    assert [x["phase"] for x in item["phases"]] == [1, 2, 3]
    flyer_id = t.room.players["flyer"].id
    assert item["words"][flyer_id]["RED"]["heard"] >= 1
    dyn = to_dynamo(item)
    assert isinstance(dyn["seed"], Decimal) and isinstance(dyn["phases"][0]["fuel_left_s"], Decimal)
    assert dyn["demo"] is False


class FakeTable:
    def __init__(self, fail: bool = False) -> None:
        self.items: list[dict[str, Any]] = []
        self.fail = fail

    def put_item(self, Item: dict[str, Any]) -> None:
        if self.fail:
            raise ClientError({"Error": {"Code": "Nope", "Message": "x"}}, "PutItem")
        self.items.append(Item)


async def test_dynamo_writer_and_failures_ignored() -> None:
    table = FakeTable()
    await DynamoPersister("wingin_games", "us-east-1", resource=table).save({"a": 1.5})
    assert table.items == [{"a": Decimal("1.5")}]
    await DynamoPersister("wingin_games", "us-east-1", resource=FakeTable(fail=True)).save({})
    await NoopPersister().save({"x": 1})


async def test_real_voice_clip_on_the_deck(make_room: MakeRoom) -> None:
    from app.main import handle_audio
    from tests.test_speech import FRAME, Factory

    t = await make_room(seed=5, mock=False)
    items = [
        WordItem(token="लाल", start_s=0.30, end_s=0.60, confidence=0.93),
        WordItem(token="बटन", start_s=0.60, end_s=0.90, confidence=0.9),
    ]
    t.room.svc.open_session = Factory(transcript="लाल बटन", items=items)
    t.until_active()
    await t.tower.send({"type": "ptt_start"})
    for _ in range(12):
        t.clock.advance(100)
        await handle_audio(t.room, t.tower.conn, FRAME)
    await t.settle()
    await t.tower.send({"type": "ptt_end"})
    await t.settle()
    assert "Laal" in "".join(s["text"] for s in t.last("flyer", "utterance")["segments"])
    await t.play_to_deck(naturally=True)
    red = next(w for w in t.last("flyer", "deck")["words"] if w["concept"] == "RED")
    assert red["clip_url"] is not None
    clip_id = red["clip_url"][len("/clips/") : -len(".wav")]
    _, _, rate, frames = parse_wav(t.room.clips[clip_id])
    assert rate == 16000 and len(frames) == len(audio.cut(FRAME * 12, 0.30, 0.60))
    tower_red = next(w for w in t.last("tower", "deck")["words"] if w["concept"] == "RED")
    assert tower_red["clip_url"] is None  # the Flyer never transmitted
