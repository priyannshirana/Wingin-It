"""§B10 fuel."""

from __future__ import annotations

import pytest

from app.fuel import FuelClock
from tests.conftest import FakeClock, MakeRoom, Table


def fuel(t: Table) -> float:
    g = t.room.game
    assert g is not None
    return g.fuel.value()


def test_fuel_clock_pause_resume_idempotent() -> None:
    clock = FakeClock()
    f = FuelClock(clock.monotonic, 0)
    f.reset(100)
    f.start()
    clock.advance(10_000)
    assert f.value() == pytest.approx(90)
    f.pause()
    f.pause()
    clock.advance(5_000)
    assert f.value() == pytest.approx(90)
    f.resume()
    f.resume()  # a second resume must not lose drained time
    clock.advance(1_000)
    f.resume()
    assert f.value() == pytest.approx(89)
    f.add(1000)
    assert f.value() == pytest.approx(130)  # capped at max + 30
    f.add(-1000)
    assert f.value() == 0


async def test_drains_only_in_playing_without_cinematic(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    assert t.status == "PROLOGUE"
    t.advance(5000)
    assert t.last("flyer", "game_state")["fuel_draining"] is False
    t.until_active()
    start = fuel(t)
    assert start == pytest.approx(150, abs=0.2)
    t.advance(2000)
    assert fuel(t) == pytest.approx(start - 2, abs=0.01)
    await t.goto_action("P1_A3")
    await t.click("OH_HANDLE_3", "pull")  # -> p1_seat (in-phase cinematic)
    frozen = fuel(t)
    gs = t.last("flyer", "game_state")
    assert gs["fuel_draining"] is False and gs["input_locked"] is True
    t.advance(2500)
    assert fuel(t) == pytest.approx(frozen, abs=0.01)
    t.advance(800)  # cinematic over (3000 + 300 lead): the 500 ms gap drains
    t.advance(400)
    assert fuel(t) < frozen


async def test_drains_in_the_gap_between_actions(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.goto_action("P1_A2")
    await t.click("OH_SW_2", "toggle")
    before = fuel(t)
    t.advance(1000)
    assert t.action_id == "P1_A2"  # still in the 1.5 s gap
    assert fuel(t) == pytest.approx(before - 1, abs=0.01)


async def test_heartbeat_game_state_every_second(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    t.clear()
    t.advance(3050)
    beats = [m for m in t.flyer.of("game_state") if m["fuel_draining"]]
    assert len(beats) == 3


async def test_frozen_during_paused(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    await t.disconnect("flyer")
    f0 = fuel(t)
    t.advance(20_000)
    assert fuel(t) == pytest.approx(f0)


async def test_minus_ten_per_wrong_and_crash_at_zero(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.goto_action("P1_A2")
    f0 = fuel(t)
    await t.click("OH_SW_1", "toggle")
    assert fuel(t) == pytest.approx(f0 - 10, abs=0.01)
    g = t.room.game
    assert g is not None
    g.fuel.add(-(fuel(t) - 5))
    await t.click("OH_SW_1", "toggle")  # -10 with 5 left: crash immediately
    assert t.status == "CRASH"
    assert t.last("flyer", "crash")["phase"] == 1
    gs = t.last("flyer", "game_state")
    assert gs["fuel_s"] == 0 and gs["status"] == "CRASH"


async def test_crash_when_fuel_runs_out_by_time(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    t.advance(151_000)
    assert t.status == "CRASH"


async def test_retry_restores_full_fuel_and_lifelines(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    await t.goto_phase(3)
    g = t.room.game
    assert g is not None
    t.room.players["flyer"].lifelines = 1
    g.fuel.add(-1000)
    t.advance(200)
    assert t.status == "CRASH"
    await t.flyer.send({"type": "retry"})
    await t.tower.send({"type": "retry"})
    t.until_active()
    assert fuel(t) == pytest.approx(180, abs=0.5)
    gs = t.last("flyer", "game_state")
    assert gs["lifelines"] == {"flyer": 3, "tower": 3} and gs["lifelines_enabled"] is True
    assert gs["action_id"] == "P3_C1" and gs["attempt"] == 2


async def test_dev_add_fuel(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    f0 = fuel(t)
    await t.dev("add_fuel", seconds=20)
    assert fuel(t) == pytest.approx(f0 + 20, abs=0.01)


async def test_exposure_kept_after_retry(make_room: MakeRoom) -> None:
    t = await make_room(seed=3)
    t.until_active()
    await t.say("tower", "Teen number button dabao")
    flyer = t.room.players["flyer"]
    heard = flyer.stats.heard["THREE"]
    assert heard == 1
    g = t.room.game
    assert g is not None
    g.fuel.add(-1000)
    t.advance(200)
    await t.flyer.send({"type": "retry"})
    await t.tower.send({"type": "retry"})
    t.until_active()
    assert flyer.stats.heard["THREE"] == heard
    assert flyer.stats.glossed["THREE"] == 1
