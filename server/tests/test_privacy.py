"""§A2 rule 2 role privacy, over complete games on every path."""

from __future__ import annotations

import itertools
import re

import pytest

from app.content import Content
from app.language.normalize import norm_line
from app.protocol import Lang
from tests.conftest import MakeRoom, Table

P1 = list(itertools.product(["RED", "BLUE"], ["YES", "NO"], ["GREEN", "RED"]))
P2 = list(itertools.product(["LEFT", "RIGHT"], ["YES", "NO"]))
P3 = list(itertools.product(["YES", "NO"], ["BLUE", "RED"], ["YES", "NO"]))
HIDDEN_PARAMS = {"fire_side", "stopped_side", "damaged_side"}
SIDE_WORDS = re.compile(r"\b(left|right|LEFT|RIGHT)\b|_L\b|_R\b", re.IGNORECASE)
ROLLED = re.compile(r"\b(RED|BLUE|GREEN|YELLOW|YES|NO|LEFT|RIGHT)\b", re.IGNORECASE)
# Types allowed to carry secrets: speech (what Tower said out loud) + dev_state (debug only).
EXEMPT_TYPES = {
    "utterance",
    "utterance_echo",
    "history",
    "translation",
    "caption_partial",
    "dev_state",
}


def forces(k: int) -> dict[str, str]:
    a1, a4, a6 = P1[k % len(P1)]
    side, burning = P2[k % len(P2)]
    gear, warn, back = P3[k % len(P3)]
    return {
        "MASTER_COLOR": a1,
        "GREEN_LIT": a4,
        "AP_COLOR": a6,
        "FIRE_SIDE": side,
        "STILL_BURNING": burning,
        "GEAR_OK": gear,
        "WARN_COLOR": warn,
        "FIRE_BACK": back,
    }


def branch_lines(content: Content) -> set[str]:
    out: set[str] = set()
    for a in content.actions_by_id.values():
        for b in a.branches or []:
            for line in (norm_line(b.say.hi), norm_line(b.say.hi_roman), norm_line(b.say.en)):
                if line:
                    out.add(line)
    return out


def _all_strings(obj: object) -> list[str]:
    """Extract every string value from a nested dict/list structure."""
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_all_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_all_strings(v))
    return out


def assert_private(t: Table, content: Content) -> None:
    lines = branch_lines(content)
    for m in t.tower.msgs:
        assert m["type"] not in ("flyer_view", "object_state"), m["type"]
        if m["type"] == "cinematic":
            assert not HIDDEN_PARAMS & set(m["params"]), m
        if m["type"] in ("game_state", "fx", "toast"):
            payload = {k: v for k, v in m.items() if k != "radar"}
            assert not ROLLED.search(str(payload)), m
            assert not SIDE_WORDS.search(str(payload)), m
        if m["type"] == "action_result" and not m["success"]:
            assert "used" in m
    for m in t.flyer.msgs:
        assert m["type"] != "manual_card"
        assert "row_index" not in m and "used" not in m
        if m["type"] in EXEMPT_TYPES:
            continue  # speech (what the Tower said out loud) or dev_state (debug only)
        for text in _all_strings(m):
            normed = norm_line(text)
            if not normed:
                continue
            for branch in lines:
                assert branch not in normed, (
                    f"Flyer message {m['type']!r} leaks branch line: {text!r}"
                )


@pytest.mark.parametrize("langs", [("en", "hi"), ("hi", "en")], ids=["flyer_en", "flyer_hi"])
@pytest.mark.parametrize("driver", ["natural", "bots"])
@pytest.mark.parametrize("seed", [1, 2])
@pytest.mark.parametrize("k", range(8))
async def test_complete_games_every_path_are_private(
    make_room: MakeRoom,
    content: Content,
    seed: int,
    k: int,
    driver: str,
    langs: tuple[Lang, Lang],
) -> None:
    t = await make_room(seed=seed, langs=langs)
    g = t.room.game
    assert g is not None
    f = forces(k)
    g.rng.forced.update(f)
    if driver == "bots":
        await t.dev("bots", flyer=True, tower=True)
        while t.status != "DECK":
            t.advance(100)
            assert t.clock.t < 1000 + 7200
        played = [r["action_id"] for r in t.flyer.of("action_result") if r["success"]]
    else:
        played = await play_forced(t, f)
    assert len(played) == 21
    assert all(g.vars[v] == value for v, value in f.items())
    assert_private(t, content)


async def play_forced(t: Table, f: dict[str, str]) -> list[str]:
    from app.game import action_active

    played: list[str] = []
    phase_seen = 0
    while t.status != "DECK":
        g = t.room.game
        assert g is not None
        if t.status == "PHASE_INTRO" and g.phase != phase_seen:
            phase_seen = g.phase
        if action_active(t.room):
            played.append(t.action_id or "")
            await t.play_naturally()
            g.rng.forced.update({k: v for k, v in f.items() if k not in g.vars})
            continue
        t.advance(100)
        assert t.clock.t < 1000 + 7200
    return played


async def test_dev_state_never_sent_without_dev_mode(make_room: MakeRoom) -> None:
    t = await make_room(seed=4, dev_mode=False)
    await t.play_to_deck(naturally=True)
    for c in (t.flyer, t.tower):
        assert not c.of("dev_state")
    await t.tower.send({"type": "dev", "cmd": "complete_action"})
    assert t.tower.last("error")["code"] == "dev_disabled"


async def test_dev_state_sent_in_dev_mode(make_room: MakeRoom) -> None:
    t = await make_room(seed=4)
    t.until_active()
    ds = t.tower.last("dev_state")
    assert ds["room"] == "TEST" and ds["seed"] == 4
    assert ds["expected"] and "MASTER_COLOR" in ds["vars"]
    assert set(ds["exposure"]) == {p.id for p in t.room.players.values()}


async def test_tower_cinematic_params_filtered(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, force={"FIRE_SIDE": "RIGHT"})
    await t.goto_phase(2)
    f = [m for m in t.flyer.of("cinematic") if m["id"] == "p2_intro"][-1]
    w = [m for m in t.tower.of("cinematic") if m["id"] == "p2_intro"][-1]
    assert f["params"] == {"retry": False, "fire_side": "right"}
    assert w["params"] == {"retry": False}
    assert f["start_at_ms"] == w["start_at_ms"] and f["duration_ms"] == w["duration_ms"]
