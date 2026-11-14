"""§B9.3 the action judge, driven through the real `interact` handler."""

from __future__ import annotations

from typing import Any

from app.protocol import ToggleState
from tests.conftest import MakeRoom, Table


def results(t: Table, role: str = "flyer") -> list[dict[str, Any]]:
    return t.clients[role].of("action_result")  # type: ignore[index]


def wrongs(t: Table) -> list[dict[str, Any]]:
    return [r for r in results(t) if not r["success"]]


def fuel(t: Table) -> float:
    g = t.room.game
    assert g is not None
    return g.fuel.value()


async def test_two_quick_presses_count_as_two(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A5")  # OH_BTN_BLUE press x2
    t.clear()
    await t.click("OH_BTN_BLUE", "press")
    t.advance(500)
    await t.click("OH_BTN_BLUE", "press")
    t.advance(1200)
    last = t.last("flyer", "action_result")
    assert last["success"] is True and last["action_id"] == "P1_A5"
    assert not wrongs(t)


async def test_press_then_pause_then_press_is_two_separate_counts(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A5")
    t.clear()
    await t.click("OH_BTN_BLUE", "press")
    t.advance(1300)  # debounce closes: count 1 != 2
    await t.click("OH_BTN_BLUE", "press")
    t.advance(1300)
    w = wrongs(t)
    assert [r["reason"] for r in w] == ["wrong_count", "wrong_count"]
    assert t.action_id == "P1_A5"
    tower_w = [r for r in results(t, "tower") if not r["success"]]
    assert tower_w[0]["used"]["count"] == 1 and tower_w[0]["used"]["object_id"] == "OH_BTN_BLUE"


async def test_too_many_presses_is_wrong_count(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A5")
    t.clear()
    for _ in range(3):
        await t.click("OH_BTN_BLUE", "press")
        t.advance(300)
    t.advance(1300)
    w = wrongs(t)
    assert len(w) == 1 and w[0]["reason"] == "wrong_count"
    assert next(r for r in results(t, "tower") if not r["success"])["used"]["count"] == 3


async def test_wrong_object(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A2")  # OH_SW_2 toggle on
    t.clear()
    before = fuel(t)
    await t.click("OH_SW_3", "toggle")
    w = wrongs(t)
    assert w[0]["reason"] == "wrong_object" and w[0]["fuel_delta"] == -10
    assert "used" not in w[0] and "row_index" not in w[0]
    tw = next(r for r in results(t, "tower") if not r["success"])
    assert tw["used"]["verb"] == "toggle"
    assert "".join(s["text"] for s in tw["used"]["label"]) == "तीन नंबर स्विच"
    bounce = [m for m in t.flyer.of("object_state") if m["object_id"] == "OH_SW_3"][-1]
    assert bounce["bounce"] is True and bounce["state"] == {"kind": "toggle", "value": "on"}
    assert before - fuel(t) >= 10
    card = t.last("tower", "manual_card")["card"]
    assert card["last_wrong"]["count"] == 1


async def test_wrong_toggle_direction(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A2")  # OH_SW_2 toggle -> on
    g = t.room.game
    assert g is not None
    g.objects["OH_SW_2"] = ToggleState(kind="toggle", value="on")  # precondition: already on
    t.clear()
    await t.click("OH_SW_2", "toggle")  # would turn it off: wrong direction
    w = wrongs(t)[-1]
    assert w["reason"] == "wrong_direction"
    assert g.objects["OH_SW_2"] == ToggleState(kind="toggle", value="on")  # unchanged
    assert t.flyer.last("object_state") == {
        "type": "object_state",
        "object_id": "OH_SW_2",
        "state": {"kind": "toggle", "value": "on"},
        "bounce": True,
    }


async def test_ordered_steps_wrong_order_keeps_step_one(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A7")  # OH_SW_4 off, then OH_HANDLE_1 pull
    t.clear()
    await t.click("OH_HANDLE_1", "pull")  # step 2 first
    assert wrongs(t)[-1]["reason"] == "wrong_order"
    assert t.room.game.objects["OH_HANDLE_1"].value == "in"  # type: ignore[union-attr]
    await t.click("OH_SW_4", "toggle")  # step 1 done
    await t.click("OH_SW_1", "toggle")  # wrong: step 1 stays done
    w = wrongs(t)[-1]
    assert w["reason"] == "wrong_object" and w["completed_steps"] == 1
    await t.click("OH_HANDLE_1", "pull")
    assert results(t)[-1]["success"] is True
    assert len(wrongs(t)) == 2


async def test_unordered_either_order(make_room: MakeRoom) -> None:
    for first, second in (("FP_LEVER_1", "FP_LEVER_2"), ("FP_LEVER_2", "FP_LEVER_1")):
        t = await make_room(seed=1)
        await t.goto_action("P3_C7")
        t.clear()
        await t.click(first, "move_down")
        await t.click(second, "move_down")
        assert results(t)[-1]["success"] is True
        assert not wrongs(t)


async def test_unordered_counts_per_lever(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P3_C3")  # FP_FLAP_L x2, FP_FLAP_R x1, any order
    t.clear()
    await t.click("FP_FLAP_R", "move_down")
    t.advance(1300)
    await t.click("FP_FLAP_L", "move_down")
    t.advance(300)
    await t.click("FP_FLAP_L", "move_down")
    t.advance(1300)
    assert results(t)[-1]["success"] is True
    assert not wrongs(t)


async def test_pending_finalized_by_a_different_object(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P3_C3")
    t.clear()
    # L, R, L quickly: L finalized at 1 != 2 -> wrong; the notch springs back.
    await t.click("FP_FLAP_L", "move_down")
    await t.click("FP_FLAP_R", "move_down")
    w = wrongs(t)
    assert w[0]["reason"] == "wrong_count"
    restored = [m for m in t.flyer.of("object_state") if m["object_id"] == "FP_FLAP_L"][-1]
    assert restored["state"]["value"] == 0 and restored["bounce"] is True


async def test_partial_progress_kept_after_wrong(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P3_C7")
    t.clear()
    await t.click("FP_LEVER_1", "move_down")
    await t.click("FP_LEVER_3", "move_down")  # wrong object
    w = wrongs(t)[-1]
    assert w["completed_steps"] == 1
    await t.click("FP_LEVER_2", "move_down")
    assert results(t)[-1]["success"] is True


async def test_clicks_ignored_during_gap_cinematic_and_other_station(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A3")  # pull OH_HANDLE_3 -> p1_seat cinematic
    t.clear()
    # Other station: bounce, no penalty.
    await t.click("PD_LEVER_1", "move_down")
    assert not wrongs(t)
    assert t.flyer.of("object_state")[-1]["bounce"] is True
    await t.click("OH_HANDLE_3", "pull")
    assert results(t)[-1]["success"] is True
    assert t.room.game.cinematic is not None  # type: ignore[union-attr]
    # During the in-phase cinematic: ignored.
    await t.click("OH_SW_1", "toggle")
    assert not wrongs(t)
    assert t.flyer.of("object_state")[-1] == {
        "type": "object_state",
        "object_id": "OH_SW_1",
        "state": {"kind": "toggle", "value": "on"},
        "bounce": True,
    }
    # During the gap after an action without a cinematic.
    t.until_active()
    await t.solve_current()  # P1_A4
    assert results(t)[-1]["success"] is True
    await t.click("OH_SW_2", "toggle")
    await t.click("OH_BTN_1", "press")
    assert not wrongs(t)


async def test_pull_already_out_handle_no_penalty(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A3")
    await t.click("OH_HANDLE_3", "pull")
    t.until_active()
    await t.goto_action("P1_A7")
    t.clear()
    await t.click("OH_HANDLE_3", "pull")  # already out
    assert not wrongs(t)
    assert t.flyer.last("object_state")["bounce"] is True


async def test_tower_cannot_interact(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A2")
    await t.tower.send({"type": "interact", "object_id": "OH_SW_2", "verb": "toggle"})
    assert t.last("tower", "error")["code"] == "not_your_role"


async def test_bad_verb_for_type(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_action("P1_A2")
    await t.click("OH_SW_2", "press")
    assert t.last("flyer", "error")["code"] == "bad_message"
