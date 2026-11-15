"""§B11.7 understood, spoken and crossover credits."""

from __future__ import annotations

import pytest

from tests.conftest import MakeRoom, Table


def stats(t: Table, role: str):  # type: ignore[no-untyped-def]
    return t.room.players[role].stats  # type: ignore[index]


async def test_understood_only_unglossed_and_in_phases_2_3(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    t.until_active()  # phase 1: everything glossed, no understood
    await t.say("tower", "Ek number button dabao — teen nahi!")
    await t.solve_current()
    assert sum(stats(t, "flyer").understood.values()) == 0
    await t.goto_action("P3_C1")  # level 3: nothing glossed
    await t.say("tower", "Chaar number lever neeche karo.")
    await t.say("tower", "Chaar number lever neeche karo.")  # twice: once per action
    seg = t.last("flyer", "utterance")["segments"]
    assert all(s.get("gloss") is None for s in seg if s["kind"] == "keyword")
    await t.solve_current()
    u = stats(t, "flyer").understood
    assert u["FOUR"] == 1 and u["DOWN"] == 1
    assert stats(t, "tower").understood["FOUR"] == 0  # the Tower heard nothing


async def test_phase2_glossed_not_understood_but_learned_word_is(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "RIGHT", "STILL_BURNING": "YES"})
    await t.goto_action("P2_B1")
    flyer = stats(t, "flyer")
    flyer.glossed["PULL"] = 2  # seen glossed twice in phase 1
    await t.say("tower", "Daayan laal lever kheencho — baayan nahi!")
    segs = {s["concept"]: s.get("gloss") for s in t.last("flyer", "utterance")["segments"]
            if s["kind"] == "keyword"}  # fmt: skip
    assert segs["PULL"] is None and segs["RIGHT"] == "right"
    await t.solve_current()
    assert flyer.understood["PULL"] == 1
    assert flyer.understood["RIGHT"] == 0 and flyer.understood["RED"] == 0


async def test_lifelined_utterance_gives_no_understood(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P3_C1")
    await t.say("tower", "Chaar number lever neeche karo.")
    await t.settle()
    utt_id = t.last("flyer", "utterance")["id"]
    await t.flyer.send({"type": "lifeline", "utterance_id": utt_id})
    assert t.last("flyer", "translation")["text"] == "Move lever four down."
    await t.solve_current()
    assert stats(t, "flyer").understood["FOUR"] == 0


async def test_crossover_once_per_concept_after_shown(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"MASTER_COLOR": "RED"})
    t.until_active()
    g = t.room.game
    assert g is not None
    f0 = g.fuel.value()
    await t.say("flyer", "Laal!")  # RED never shown to the Flyer yet: no bonus
    assert not t.flyer.of("toast")
    assert stats(t, "flyer").spoken["RED"] == 0
    await t.say("tower", "Kaun si light jal rahi hai — laal ya neeli?")
    await t.say("flyer", "Laal!")
    toast = t.last("tower", "toast")
    assert toast["kind"] == "crossover" and toast["key"] == "toast.crossover"
    assert toast["params"] == {"word": "laal"}
    assert t.last("flyer", "toast")["key"] == "toast.crossover"
    assert g.fuel.value() == pytest.approx(f0 + 5 - 3 * 0.4, abs=0.05)  # 3 says x 0.4 s
    await t.say("flyer", "Laal hai!")
    assert len(t.flyer.of("toast")) == 1  # once per concept per player
    assert stats(t, "flyer").spoken["RED"] == 2
    # The crossover word is plain for the Hindi listener: no chip, no exposure.
    segs = t.last("tower", "utterance")["segments"]
    assert all(s["kind"] == "plain" for s in segs)


async def test_hindi_speaker_saying_left_by_habit_gets_nothing(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P2_B1")
    await t.say("tower", "Aag left engine mein hai?")
    assert not t.tower.of("toast")
    assert stats(t, "tower").spoken["LEFT"] == 0


async def test_exposure_counts_only_while_playing(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    assert t.status == "PROLOGUE"
    await t.say("tower", "Teen number button dabao")
    seg = t.last("flyer", "utterance")
    assert seg["level"] == 0
    assert any(s.get("gloss") for s in seg["segments"])  # level 0 glosses like level 1
    assert stats(t, "flyer").heard["THREE"] == 0
