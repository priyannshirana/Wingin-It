"""§B7/§B8 rooms, joins, states, cinematics, crash/retry, pause/resume, deck flows."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.websockets import WebSocketDisconnect

from app.game import action_active
from tests.conftest import Harness, MakeRoom, Table


def statuses(t: Table, role: str = "flyer") -> list[str]:
    seq: list[str] = []
    for m in t.clients[role].of("game_state"):  # type: ignore[index]
        if not seq or seq[-1] != m["status"]:
            seq.append(m["status"])
    return seq


def cinematic_ids(t: Table, role: str = "flyer") -> list[str]:
    return [m["id"] for m in t.clients[role].of("cinematic")]  # type: ignore[index]


async def play_to_deck(t: Table) -> list[str]:
    played: list[str] = []
    while t.status != "DECK":
        if action_active(t.room):
            played.append(t.action_id or "")
            await t.solve_current()
            continue
        t.advance(100)
        assert t.clock.t < 1000 + 3600, f"stuck in {t.status}"
    return played


# ----------------------------------------------------------------------------- joining


async def test_join_without_valid_gender_is_rejected(harness: Harness) -> None:
    t = Table(harness, harness.make())
    c = await t.connect("flyer")
    for gender in (None, "other"):
        msg: dict[str, Any] = {"type": "join", "name": "Sam", "role": "flyer", "lang": "en"}
        if gender:
            msg["gender"] = gender
        await c.send(msg)
        assert c.last("error")["code"] == "bad_message"
    assert not t.room.players


async def test_handshake_welcome_and_spectator_room_state(harness: Harness) -> None:
    t = Table(harness, harness.make())
    c = await t.connect("flyer")
    kinds = [m["type"] for m in c.msgs]
    assert kinds[:2] == ["welcome", "room_state"]
    w = c.msgs[0]
    assert w["room_code"] == "TEST" and w["mock_speech"] is True and w["gloss_threshold"] == 2
    await c.send({"type": "ping", "client_ms": 123})
    assert c.last("pong")["client_ms"] == 123


async def test_not_joined_and_role_taken(make_room: MakeRoom) -> None:
    t = await make_room(start=False, dev_mode=False)
    extra = await t.connect("flyer")
    await extra.send({"type": "ready"})
    assert extra.last("error")["code"] == "not_joined"
    msg = {"type": "join", "name": "X", "role": "flyer", "lang": "en", "gender": "male"}
    await extra.send(msg)
    assert extra.last("error")["code"] == "role_taken"


async def test_gender_in_room_state_and_survives_rejoin_play_again_swap(
    make_room: MakeRoom,
) -> None:
    t = await make_room(seed=2)
    rs = t.last("tower", "room_state")
    genders = {p["role"]: p["gender"] for p in rs["players"]}
    assert genders == {"flyer": "female", "tower": "male"}
    await t.disconnect("tower")
    await t.rejoin("tower")
    assert t.last("tower", "joined")["gender"] == "male"
    await play_to_deck(t)
    deck = t.last("flyer", "deck")
    assert deck["partner_gender"] == "male"
    await t.flyer.send({"type": "swap_roles"})
    await t.tower.send({"type": "swap_roles"})
    assert t.status == "LOBBY"
    rs = t.flyer.last("room_state")
    by_role = {p["role"]: p for p in rs["players"]}
    assert by_role["tower"]["gender"] == "female" and by_role["tower"]["lang"] == "en"
    assert by_role["flyer"]["gender"] == "male" and by_role["flyer"]["lang"] == "hi"
    assert not by_role["flyer"]["ready"] and not by_role["tower"]["ready"]
    # The server re-sends `joined` so clients re-key their token on the new role.
    assert t.flyer.last("joined")["role"] == "tower"


async def test_lobby_to_prologue_needs_both_ready_and_different_languages(
    harness: Harness,
) -> None:
    t = Table(harness, harness.make())
    await t.join("flyer", "en", ready=False)
    await t.join("tower", "en", ready=False)
    assert t.last("tower", "room_state")["block_reason"] == "same_language"
    await t.tower.send({"type": "update_player", "lang": "hi"})
    assert t.last("tower", "room_state")["block_reason"] == "not_ready"
    await t.flyer.send({"type": "ready"})
    assert t.status == "LOBBY"
    await t.tower.send({"type": "ready"})
    assert t.status == "PROLOGUE"


async def test_dev_room_code_created_on_connect(harness: Harness) -> None:
    assert harness.registry.get("ABCD") is None
    room = harness.registry.create(code="ABCD")
    assert harness.registry.get("abcd") is room


# ------------------------------------------------------------------------- full game


async def test_one_person_finishes_the_whole_game(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    played = await play_to_deck(t)
    assert len(played) == 21
    assert statuses(t) == [
        "PROLOGUE",
        "PHASE_INTRO",
        "PLAYING",
        "PHASE_OUTRO",
        "PHASE_INTRO",
        "PLAYING",
        "PHASE_OUTRO",
        "PHASE_INTRO",
        "PLAYING",
        "PHASE_OUTRO",
        "ENDING",
        "DECK",
    ]
    assert cinematic_ids(t) == [
        "prologue",
        "p1_intro",
        "p1_seat",
        "p1_outro",
        "p2_intro",
        "p2_extinguish",
        "p2_outro",
        "p3_intro",
        "p3_runway_reveal",
        "lightning_strike",
        "p3_touchdown",
        "landing",
        "ending",
    ]
    assert cinematic_ids(t, "tower") == cinematic_ids(t)
    deck = t.last("flyer", "deck")
    assert len(deck["words"]) == 20 and deck["report"]
    assert not [r for r in t.flyer.of("action_result") if not r["success"]]


async def test_cinematic_lead_and_durations(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    cin = t.last("flyer", "cinematic")
    assert cin["id"] == "prologue" and cin["duration_ms"] == 12000
    gs = t.last("flyer", "game_state")
    assert cin["start_at_ms"] - gs["server_ms"] == 300
    t.advance(12300)
    intro = t.last("flyer", "cinematic")
    assert intro["id"] == "p1_intro" and intro["duration_ms"] == 1200
    assert intro["params"] == {"retry": False}
    assert t.last("tower", "manual_card")["card"] is None


async def test_double_skip(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.flyer.send({"type": "skip_cinematic"})
    assert t.status == "PROLOGUE"
    assert t.last("tower", "skip_votes")["roles"] == ["flyer"]
    await t.tower.send({"type": "skip_cinematic"})
    assert t.last("flyer", "cinematic_skip")["id"] == "prologue"
    assert t.status == "PHASE_INTRO"
    t.advance(100)
    # The old prologue finish timer must not fire later (generation-guarded).
    t.advance(13000)
    assert t.status == "PLAYING"
    assert cinematic_ids(t).count("p1_intro") == 1


async def test_crash_is_not_skippable_and_retry_restarts_phase(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.goto_action("P1_A2")
    g = t.room.game
    assert g is not None
    first_rolls = dict(g.vars)
    g.fuel.add(-1000)
    t.advance(200)
    assert t.status == "CRASH"
    assert t.last("tower", "crash")["phase"] == 1
    assert t.last("flyer", "cinematic")["id"] == "crash"
    await t.flyer.send({"type": "skip_cinematic"})
    assert t.last("flyer", "error")["code"] == "not_allowed_now"
    t.advance(6000)
    assert t.status == "CRASH"  # no automatic end
    await t.flyer.send({"type": "retry"})
    assert t.last("tower", "retry_votes")["roles"] == ["flyer"]
    await t.tower.send({"type": "retry"})
    assert t.status == "PHASE_INTRO"
    intro = t.last("flyer", "cinematic")
    assert intro["id"] == "p1_intro" and intro["params"]["retry"] is True
    assert intro["duration_ms"] == 3200
    t.until_active()
    gs = t.last("flyer", "game_state")
    assert gs["attempt"] == 2 and gs["action_id"] == "P1_A1" and gs["fuel_s"] >= 149
    assert gs["lifelines"] == {"flyer": 3, "tower": 3}
    assert first_rolls  # A1 rolled MASTER_COLOR the first time


async def test_pause_and_resume_within_60s(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.goto_action("P1_A5")
    g = t.room.game
    assert g is not None
    await t.click("OH_BTN_BLUE", "press")  # partial count
    await t.disconnect("tower")
    assert t.status == "PAUSED"
    gs = t.last("flyer", "game_state")
    assert gs["status"] == "PAUSED" and gs["paused_from"] == "PLAYING"
    assert t.last("flyer", "toast")["key"] == "toast.partner_left"
    fuel = g.fuel.value()
    t.advance(30_000)
    assert abs(g.fuel.value() - fuel) < 1e-6  # frozen
    t2 = await t.rejoin("tower")
    assert t.status == "PLAYING"
    kinds = [m["type"] for m in t2.msgs]
    for k in ("joined", "room_state", "game_state", "manual_card", "history", "channel"):
        assert k in kinds
    assert t2.last("manual_card")["card"]["action_id"] == "P1_A5"
    assert g.run is not None and g.run.pending is None  # partial counts reset
    await t.click("OH_BTN_BLUE", "press")
    await t.click("OH_BTN_BLUE", "press")
    t.advance(1300)
    assert t.flyer.last("action_result")["success"] is True


async def test_rejoin_during_cinematic_resends_original_start(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    start = t.last("flyer", "cinematic")["start_at_ms"]
    t.advance(2000)
    await t.disconnect("flyer")
    t2 = await t.rejoin("flyer")
    assert t2.of("cinematic")[0]["start_at_ms"] == start
    assert t2.last("flyer_view")["world"]["light_rig"] == "night_calm"
    # Resume completed the interrupted cinematic instantly.
    assert t.status == "PHASE_INTRO"
    assert t2.last("cinematic_skip")["id"] == "prologue"


async def test_abandon_after_60s(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    await t.disconnect("flyer")
    t.advance(59_000)
    assert t.status == "PAUSED"
    t.advance(1_500)
    assert t.status == "LOBBY"
    assert "flyer" not in t.room.players
    assert t.last("tower", "toast")["key"] == "toast.partner_gone"
    assert t.room.players["tower"].ready is False
    assert t.room.game is None


async def test_play_again_new_seed_same_roles(make_room: MakeRoom) -> None:
    t = await make_room(seed=None)
    await play_to_deck(t)
    old = t.room.game
    assert old is not None
    await t.flyer.send({"type": "play_again"})
    assert t.last("tower", "room_state")["play_again_votes"] == ["flyer"]
    await t.tower.send({"type": "play_again"})
    assert t.status == "PROLOGUE"
    assert t.room.game is not old
    assert t.room.players["flyer"].lang == "en"


async def test_deck_votes_one_current_vote_each_later_replaces(make_room: MakeRoom) -> None:
    """§B8.5: mismatched votes wait; a later vote replaces; act only when both match."""
    t = await make_room(seed=3)
    await play_to_deck(t)
    old = t.room.game
    await t.flyer.send({"type": "play_again"})
    await t.tower.send({"type": "swap_roles"})
    assert t.status == "DECK" and t.room.game is old
    assert t.last("flyer", "room_state")["play_again_votes"] == ["flyer"]
    # The Flyer changes its mind to swap_roles: its play_again vote is replaced.
    await t.flyer.send({"type": "swap_roles"})
    assert t.status == "LOBBY"
    by_role = {p["role"]: p for p in t.last("flyer", "room_state")["players"]}
    assert by_role["flyer"]["lang"] == "hi" and by_role["tower"]["lang"] == "en"
    assert t.last("flyer", "room_state")["play_again_votes"] == []


async def test_deck_vote_switch_to_play_again_clears_swap(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await play_to_deck(t)
    await t.tower.send({"type": "swap_roles"})
    assert t.last("flyer", "room_state")["play_again_votes"] == []
    await t.tower.send({"type": "play_again"})
    assert t.last("flyer", "room_state")["play_again_votes"] == ["tower"]
    await t.flyer.send({"type": "swap_roles"})
    assert t.status == "DECK"  # tower's swap vote was replaced: no swap
    assert t.last("flyer", "room_state")["play_again_votes"] == ["tower"]
    await t.flyer.send({"type": "play_again"})
    assert t.status == "PROLOGUE"
    assert t.room.players["flyer"].lang == "en"


async def test_disconnect_in_lobby_frees_slot_after_60s(harness: Harness) -> None:
    t = Table(harness, harness.make())
    await t.join("flyer", "en", ready=False)
    await t.disconnect("flyer")
    assert "flyer" in t.room.players
    harness.clock.advance(61_000)
    assert "flyer" not in t.room.players


# ------------------------------------------------------- M3: world, effects, params, radar


def world(t: Table) -> dict[str, Any]:
    return t.last("flyer", "flyer_view")["world"]  # type: ignore[no-any-return]


def fx_of(t: Table, role: str) -> list[str]:
    return [e for m in t.clients[role].of("fx") for e in m["effects"]]  # type: ignore[index]


async def test_world_table_at_phase_starts(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "LEFT"})
    w = world(t)
    assert w["light_rig"] == "night_calm" and w["pilot"] == {
        "slumped": False,
        "seat_back": False,
        "awake": True,
    }
    t.until_active()
    w = world(t)
    assert (w["light_rig"], w["alarm"], w["fog"], w["static_level"]) == (
        "night_alarm",
        True,
        0.004,
        0,
    )
    assert w["pilot"] == {"slumped": True, "seat_back": False, "awake": False}
    await t.goto_phase(2)
    w = world(t)
    assert w["light_rig"] == "fire" and w["fire"] == {"side": "left", "level": "full"}
    assert (w["fire_bell"], w["fuel_hiss"], w["ap_screen"], w["overhead_all_green"]) == (
        True,
        True,
        True,
        True,
    )
    assert w["pilot"]["seat_back"] is True and w["fog"] == 0.006 and w["static_level"] == 0.02
    objs = t.last("flyer", "flyer_view")["objects"]
    assert objs["PD_FIRE_LAMP_L"]["color"] == "red" and objs["PD_FIRE_LAMP_R"]["color"] is None
    assert objs["OH_MASTER_LAMP"] == {
        "kind": "lamp",
        "color": "green",
        "blinking": False,
        "attention": False,
    }
    await t.goto_phase(3)
    w = world(t)
    assert w["light_rig"] == "storm" and w["weather"] == "storm"
    assert w["fire"] == {"side": "left", "level": "wisp"} and w["propeller_stopped"] == "left"
    assert (w["engine_hum"], w["fog"], w["turbulence"], w["static_level"]) == (
        "one_engine",
        0.035,
        0.15,
        0.04,
    )


async def test_landing_world_and_ending_params(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "RIGHT"})
    await t.play_to_deck()
    w = world(t)
    assert w["light_rig"] == "dawn" and w["weather"] == "clear_dawn" and w["runway"] == "stopped"
    assert w["pilot"] == {"slumped": False, "seat_back": True, "awake": True}
    assert w["landing_lights"] is True and w["engine_hum"] == "off"
    assert w["propeller_stopped"] == "right"
    landing_f = next(m for m in t.flyer.of("cinematic") if m["id"] == "landing")
    landing_t = next(m for m in t.tower.of("cinematic") if m["id"] == "landing")
    assert landing_f["params"] == {"damaged_side": "right"} and landing_t["params"] == {}
    outro_f = next(m for m in t.flyer.of("cinematic") if m["id"] == "p2_outro")
    assert outro_f["params"] == {"stopped_side": "right"}
    p3 = next(m for m in t.flyer.of("cinematic") if m["id"] == "p3_intro")
    assert p3["params"] == {"retry": False, "damaged_side": "right"}
    ext = next(m for m in t.flyer.of("cinematic") if m["id"] == "p2_extinguish")
    assert ext["params"] == {"fire_side": "right"}
    assert next(m for m in t.tower.of("cinematic") if m["id"] == "p2_extinguish")["params"] == {}
    end_f = next(m for m in t.flyer.of("cinematic") if m["id"] == "ending")
    end_t = next(m for m in t.tower.of("cinematic") if m["id"] == "ending")
    assert end_f["params"] == end_t["params"]
    assert set(end_f["params"]) == {"fuel_left_s", "total_time_s"}


async def test_effects_and_fx_routing(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"MASTER_COLOR": "RED", "FIRE_SIDE": "RIGHT"})
    t.until_active()
    t.clear()
    await t.solve_current()  # P1_A1
    assert "sfx_stop:alarm_master" in fx_of(t, "flyer") and not fx_of(t, "tower")
    w = world(t)
    assert w["alarm"] is False and w["light_rig"] == "night_calm"
    lamp = [m for m in t.flyer.of("object_state") if m["object_id"] == "OH_MASTER_LAMP"][-1]
    assert lamp["state"] == {"kind": "lamp", "color": None, "blinking": False, "attention": False}
    await t.goto_action("P1_A5")
    t.clear()
    await t.solve_current()
    assert fx_of(t, "flyer") == ["both:static_dip", "both:signal_flash"]
    assert fx_of(t, "tower") == ["both:static_dip", "both:signal_flash"]
    await t.goto_action("P2_B1")
    t.clear()
    await t.solve_current()
    assert fx_of(t, "flyer") == ["sfx:clunk", "fx:lamp_flicker:PD_FIRE_LAMP_R"]
    assert not fx_of(t, "tower")
    kept = t.room.game.objects["PD_FIRE_LAMP_R"]  # type: ignore[union-attr]
    assert kept.color == "red" and not kept.blinking and not kept.attention  # type: ignore[union-attr]


async def test_deferred_effects_apply_at_cinematic_end(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "LEFT", "STILL_BURNING": "YES"})
    await t.goto_action("P2_B3")
    t.clear()
    await t.solve_current()
    assert t.room.game.cinematic is not None  # type: ignore[union-attr]
    assert "sfx_stop:fire_bell" in fx_of(t, "flyer")  # one-shots go now
    assert t.room.game.world.fire_bell is True  # type: ignore[union-attr]  # world waits
    t.advance(3400)
    w = world(t)
    assert w["fire_bell"] is False and w["fire"]["level"] == "wisp"
    assert w["light_rig"] == "night_calm"
    assert t.room.game.objects["PD_FIRE_LAMP_L"].color is None  # type: ignore[union-attr]


async def test_observe_lamps_attention_and_blink(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "RIGHT", "GREEN_LIT": "NO"})
    await t.goto_action("P1_A4")
    objs = t.last("flyer", "flyer_view")["objects"]
    assert objs["OH_GREEN_LAMP"] == {
        "kind": "lamp",
        "color": None,
        "blinking": False,
        "attention": True,
    }  # dark lamp still gets the ring
    assert world(t)["warning_beep"] is True  # on_start effect
    await t.goto_action("P2_B1")
    objs = t.last("flyer", "flyer_view")["objects"]
    assert objs["PD_FIRE_LAMP_R"] == {
        "kind": "lamp",
        "color": "red",
        "blinking": True,
        "attention": True,
    }
    assert (
        objs["PD_FIRE_LAMP_L"]["attention"] is True and objs["PD_FIRE_LAMP_L"]["blinking"] is False
    )


async def test_gear_roll_and_show_then_observe(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"GEAR_OK": "NO"})
    await t.goto_action("P3_C1")
    await t.solve_current()
    g = t.room.game
    assert g is not None and g.vars["GEAR_OK"] == "NO"
    assert g.objects["FP_GEAR_LAMP_3"].color == "red"  # type: ignore[union-attr]
    assert g.objects["FP_GEAR_LAMP_1"].blinking is False  # type: ignore[union-attr]  # steady
    t.until_active()
    assert t.action_id == "P3_C2"
    assert g.objects["FP_GEAR_LAMP_3"].attention is True  # type: ignore[union-attr]
    assert g.run is not None and g.run.value == "NO" and g.run.steps[0].object == "FP_BTN_RED"


async def test_lightning_event_then_lamp(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"WARN_COLOR": "BLUE"})
    await t.goto_action("P3_C4")
    await t.solve_current()
    t.run_until(lambda: t.room.game is not None and t.room.game.cinematic is not None
                and t.room.game.cinematic.id == "lightning_strike")  # fmt: skip
    g = t.room.game
    assert g is not None
    assert g.objects["FP_WARN_LAMP"].color is None  # type: ignore[union-attr]  # not yet
    assert t.last("flyer", "game_state")["action_active"] is False
    await t.click("FP_BTN_1", "press")  # input locked during the event: ignored
    assert not [r for r in t.flyer.of("action_result") if not r["success"]]
    t.until_active()
    assert g.objects["FP_WARN_LAMP"].color == "blue"  # type: ignore[union-attr]
    assert g.objects["FP_WARN_LAMP"].blinking is True  # type: ignore[union-attr]


def radar(t: Table) -> dict[str, Any]:
    return t.last("tower", "game_state")["radar"]  # type: ignore[no-any-return]


async def test_radar_states(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    assert radar(t)["blip"] == "green" and radar(t)["icon"] is None
    t.until_active()
    assert (radar(t)["blip"], radar(t)["icon"]) == ("red", "mayday")
    await t.solve_current()  # A1
    assert (radar(t)["blip"], radar(t)["icon"]) == ("amber", None)
    assert radar(t)["progress"] == round(1 / 7, 3)
    while t.status == "PLAYING":
        if action_active(t.room):
            await t.solve_current()
        else:
            t.advance(100)
    assert t.status == "PHASE_OUTRO" and radar(t)["blip"] == "green"
    t.until_active()
    assert (radar(t)["blip"], radar(t)["icon"]) == ("red", "fire")
    await t.goto_action("P2_B3")
    await t.solve_current()
    assert (radar(t)["blip"], radar(t)["icon"]) == ("amber", "smoke")
    await t.tower.send({"type": "dev", "cmd": "goto_phase", "args": {"phase": 3}})
    t.until_active()
    r = radar(t)
    assert (r["blip"], r["storm"], r["runway"], r["glide_path"], r["landed"]) == (
        "amber",
        True,
        True,
        True,
        False,
    )
    await t.play_to_deck()
    r = radar(t)
    assert (r["blip"], r["storm"], r["runway"], r["glide_path"], r["landed"]) == (
        "green",
        False,
        True,
        False,
        True,
    )


async def test_p2_outro_radar_storm(make_room: MakeRoom) -> None:
    t = await make_room(seed=1)
    await t.goto_phase(2)
    while t.status == "PLAYING":
        if action_active(t.room):
            await t.solve_current()
        else:
            t.advance(100)
    r = radar(t)
    assert t.status == "PHASE_OUTRO" and (r["blip"], r["icon"], r["storm"]) == (
        "amber",
        None,
        True,
    )


async def test_template_effects_and_option_world(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "RIGHT", "FIRE_BACK": "YES"})
    await t.goto_action("P2_B4")
    t.clear()
    await t.solve_current()
    assert "fx:yaw:right" in fx_of(t, "flyer") and not fx_of(t, "tower")
    w = world(t)
    assert w["propeller_stopped"] == "right" and w["engine_hum"] == "one_engine"
    await t.goto_action("P3_C6")
    assert world(t)["fire"]["level"] == "flicker"  # YES brings the flame back
    await t.solve_current()
    assert "fx:burst:snuff" in fx_of(t, "flyer")
    assert world(t)["fire"]["level"] == "wisp"


# ------------------------------------------------------------------ HTTP + WS endpoints


def test_http_endpoints_and_ws_handshake() -> None:
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import make_settings

    app = create_app(make_settings())
    with TestClient(app) as client:
        h = client.get("/health").json()
        assert h == {
            "ok": True,
            "mock_speech": True,
            "dev_mode": True,
            "demo_mode": False,
            "rooms": 0,
            "version": "0.1.0",
        }
        code = client.post("/api/rooms", json={"demo": True, "seed": 9}).json()["code"]
        assert len(code) == 4 and not set(code) & set("IO0123456789")
        room = app.state.registry.get(code)
        assert room.demo is True and room.seed_override == 9
        assert client.get(f"/api/rooms/{code}").json() == {
            "exists": True,
            "status": "LOBBY",
            "roles_taken": [],
            "demo": True,
        }
        missing = client.get("/api/rooms/ZZZZ")
        assert missing.status_code == 404 and missing.json() == {"exists": False}
        assert client.post("/api/rooms", json={"bogus": 1}).status_code == 422
        room.clips["c_deadbeef"] = b"RIFFxxxx"
        clip = client.get("/clips/c_deadbeef.wav")
        assert clip.status_code == 200 and clip.headers["content-type"] == "audio/wav"
        assert clip.headers["cache-control"] == "private, max-age=3600"
        assert client.get("/clips/c_nope.wav").status_code == 404
        with client.websocket_connect(f"/ws/{code}") as ws:
            assert ws.receive_json()["type"] == "welcome"
            assert ws.receive_json()["type"] == "room_state"
            ws.send_json({"type": "ping", "client_ms": 5})
            assert ws.receive_json()["type"] == "pong"
            ws.send_text("not json")
            assert ws.receive_json()["code"] == "bad_message"
            ws.send_json(
                {"type": "join", "name": " <b>Sam</b> ", "role": "flyer", "lang": "en",
                 "gender": "male"}
            )  # fmt: skip
            joined = ws.receive_json()
            assert joined["type"] == "joined" and joined["name"] == "Sam"
        with client.websocket_connect("/ws/TEST") as ws:  # Dev Mode: ad-hoc code
            assert ws.receive_json()["room_code"] == "TEST"


def test_overrides_ignored_without_dev_or_demo() -> None:
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import make_settings

    app = create_app(make_settings(dev_mode=False))
    with TestClient(app) as client:
        code = client.post("/api/rooms", json={"demo": True, "seed": 9, "mock": False}).json()
        room = app.state.registry.get(code["code"])
        assert room.demo is False and room.seed_override is None and room.mock_speech is True
        with client.websocket_connect("/ws/QQQQ") as ws:
            assert ws.receive_json()["code"] == "room_not_found"
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(
                f"/ws/{code['code']}", headers={"origin": "https://evil.example"}
            ),
        ):
            pass
        assert exc_info.value.code == 4403
