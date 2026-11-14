"""§B14.2 lifelines."""

from __future__ import annotations

import asyncio

from app.protocol import Lang
from app.speech.translate import TranslateError
from tests.conftest import MakeRoom, Table


class FailingTranslator:
    async def translate(self, text: str, src: Lang, dst: Lang) -> str:
        raise TranslateError("boom")


class GateTranslator:
    """Translation that completes only when the test opens the gate."""

    def __init__(self) -> None:
        self.gate = asyncio.Event()

    async def translate(self, text: str, src: Lang, dst: Lang) -> str:
        await self.gate.wait()
        return f"[{dst}] {text}"


async def phase3(make_room: MakeRoom) -> Table:
    t = await make_room(seed=1)
    await t.goto_action("P3_C1")
    return t


async def tower_says(t: Table, text: str) -> str:
    await t.say("tower", text)
    await t.settle()
    return str(t.last("flyer", "utterance")["id"])


async def lifeline(t: Table, utt_id: str, role: str = "flyer") -> None:
    await t.clients[role].send({"type": "lifeline", "utterance_id": utt_id})  # type: ignore[index]
    await t.settle()


async def test_three_per_player_then_no_lifelines(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    gs = t.last("flyer", "game_state")
    assert gs["lifelines"] == {"flyer": 3, "tower": 3} and gs["lifelines_enabled"] is True
    ids = [await tower_says(t, line) for line in ("Chaar number lever neeche karo.",
                                                    "Laal button do baar dabao.",
                                                    "Hara button ek baar dabao.")]  # fmt: skip
    assert t.last("flyer", "utterance")["lifeline_available"] is True
    for i, uid in enumerate(ids):
        await lifeline(t, uid)
        tr = t.last("flyer", "translation")
        assert tr["utterance_id"] == uid and tr["lifelines_left"] == 2 - i and tr["lang"] == "en"
    assert t.last("tower", "game_state")["lifelines"]["flyer"] == 0
    new = await tower_says(t, "Peela switch chalu karo.")
    await lifeline(t, new)
    assert t.last("flyer", "error")["code"] == "no_lifelines"
    assert t.room.game.phase_stats[3].lifelines_used[t.room.players["flyer"].id] == 3  # type: ignore[union-attr]


async def test_refused_in_phases_1_and_2(make_room: MakeRoom) -> None:
    for phase in (1, 2):
        t = await make_room(seed=1)
        await t.goto_phase(phase)
        uid = await tower_says(t, "Teen number button dabao")
        assert t.last("flyer", "utterance")["lifeline_available"] is False
        await lifeline(t, uid)
        assert t.last("flyer", "error")["code"] == "lifeline_not_available"
        assert t.room.players["flyer"].lifelines == 3


async def test_only_partners_last_three(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    ids = [await tower_says(t, f"Teen number button dabao {i}") for i in range(4)]
    await lifeline(t, ids[0])  # 4th from last: outside the window
    assert t.last("flyer", "error")["code"] == "lifeline_not_available"
    await t.say("flyer", "Yes yes")
    own = t.last("tower", "utterance")["id"]
    await lifeline(t, own)  # own utterance
    assert t.last("flyer", "error")["code"] == "lifeline_not_available"
    await lifeline(t, ids[3])
    assert t.last("flyer", "translation")["lifelines_left"] == 2


async def test_failure_not_decremented(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    t.room.svc.mock_translator = FailingTranslator()
    uid = await tower_says(t, "Chaar number lever neeche karo.")
    await lifeline(t, uid)
    assert t.last("flyer", "error")["code"] == "translation_failed"
    assert t.room.players["flyer"].lifelines == 3


async def test_pending_translation_waits_then_delivers(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    gate = GateTranslator()
    t.room.svc.mock_translator = gate
    uid = await tower_says(t, "Chaar number lever neeche karo.")
    task = asyncio.create_task(lifeline(t, uid))
    await t.settle()
    assert not t.flyer.of("translation")
    assert not t.room.lock.locked()  # the lock is released while waiting
    gate.gate.set()
    await task
    await t.settle()
    assert t.last("flyer", "translation")["text"].startswith("[en]")
    assert t.room.players["flyer"].lifelines == 2


async def test_pending_translation_times_out_not_decremented(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    t.room.svc.mock_translator = GateTranslator()  # never opens
    uid = await tower_says(t, "Chaar number lever neeche karo.")
    task = asyncio.create_task(lifeline(t, uid))
    await t.settle()
    t.advance(3100)  # LIFELINE_WAIT_MS
    await task
    await t.settle()
    assert t.last("flyer", "error")["code"] == "translation_failed"
    assert t.room.players["flyer"].lifelines == 3


async def test_second_request_same_utterance_is_free(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    uid = await tower_says(t, "Chaar number lever neeche karo.")
    await lifeline(t, uid)
    await lifeline(t, uid)
    trs = t.flyer.of("translation")
    assert len(trs) == 2 and trs[1]["lifelines_left"] == 2
    assert t.room.players["flyer"].lifelines == 2


async def test_hindi_listener_gets_devanagari_translation(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    await t.say("flyer", "Press the red button two times.")
    await t.settle()
    uid = t.last("tower", "utterance")["id"]
    await lifeline(t, uid, "tower")
    tr = t.last("tower", "translation")
    assert tr["text"] == "लाल बटन दो बार दबाओ।" and tr["lang"] == "hi"


async def test_history_includes_revealed_translation_on_rejoin(make_room: MakeRoom) -> None:
    t = await phase3(make_room)
    uid = await tower_says(t, "Chaar number lever neeche karo.")
    await lifeline(t, uid)
    await t.disconnect("flyer")
    c = await t.rejoin("flyer")
    hist = c.last("history")["utterances"]
    assert hist[-1]["id"] == uid and hist[-1]["translation"] == "Move lever four down."
