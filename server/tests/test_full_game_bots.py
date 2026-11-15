"""§B16.1 bots play every branch path to the deck (§B18)."""

from __future__ import annotations

import re

import pytest

from app.protocol import Lang, Role
from tests.conftest import Harness, MakeRoom, Table
from tests.test_privacy import P1, P2, P3, forces


def run_to_deck(t: Table, max_s: float = 3600) -> None:
    start = t.clock.t
    while t.status != "DECK":
        t.advance(100)
        assert t.clock.t - start < max_s, f"stuck in {t.status} at {t.action_id}"


def successes(t: Table) -> list[str]:
    return [r["action_id"] for r in t.flyer.of("action_result") if r["success"]]


PAIRINGS: list[tuple[Lang, Lang]] = [("en", "hi"), ("hi", "en")]
DEVA = re.compile(r"[\u0900-\u097F]")
REPORT_START = {"en": "Flyer and Tower landed with ", "hi": "Flyer और Tower ने "}


def assert_language_paths(t: Table, langs: tuple[Lang, Lang]) -> None:
    """§A2 rule 9 / §B18: Latin segments, listener-language glosses, Tower-language manual."""
    lexicon = t.room.svc.lexicon
    for client, lang in ((t.flyer, langs[0]), (t.tower, langs[1])):
        utts = client.of("utterance")
        assert utts, "no subtitles reached this listener"
        glossed = 0
        for u in utts:
            for seg in u["segments"]:
                assert not DEVA.search(seg["text"]), seg
                gloss = seg.get("gloss")
                if gloss is None:
                    continue
                assert not DEVA.search(gloss), seg
                ids = seg.get("concepts") or [seg["concept"]]
                assert gloss == " ".join(lexicon.display(c, lang) for c in ids), seg
                glossed += 1
        assert glossed > 0
    cards = [m["card"] for m in t.tower.of("manual_card") if m["card"] is not None]
    assert cards and all(c["lang"] == langs[1] for c in cards)
    titles = "".join(c["title"] + c["sticky"] for c in cards)
    assert bool(DEVA.search(titles)) == (langs[1] == "hi")
    for reply in (r for m in t.flyer.of("flyer_view") for r in m["quick_replies"] or []):
        assert not DEVA.search(reply["text"])
        assert ("alt_text" in reply) == (langs[0] == "hi")


@pytest.mark.parametrize("langs", PAIRINGS, ids=["flyer_en", "flyer_hi"])
@pytest.mark.parametrize("k", range(max(len(P1), len(P2), len(P3))))
async def test_bots_finish_every_path(
    make_room: MakeRoom, k: int, langs: tuple[Lang, Lang]
) -> None:
    t = await make_room(seed=10 + k, langs=langs)
    g = t.room.game
    assert g is not None
    f = forces(k)
    g.rng.forced.update(f)
    await t.dev("bots", flyer=True, tower=True)
    run_to_deck(t)
    for var, value in f.items():
        assert g.vars[var] == value, var
    assert len(successes(t)) == 21
    assert not [r for r in t.flyer.of("action_result") if not r["success"]]
    deck = t.last("flyer", "deck")
    assert len(deck["words"]) == 20 and deck["report_pending"] is False
    assert deck["report"].startswith(REPORT_START[langs[0]])
    assert t.last("tower", "deck")["report"].startswith(REPORT_START[langs[1]])
    for client, own, partner in ((t.flyer, langs[0], langs[1]), (t.tower, langs[1], langs[0])):
        d = client.last("deck")
        assert d["partner_lang"] == partner
        assert {w["meaning_script"] for w in d["words"]} == {"deva" if own == "hi" else "latin"}
        assert not any(DEVA.search(w["word"]) for w in d["words"])
    # Bot speech produced real subtitles and exposure for both humans.
    assert sum(t.room.players["flyer"].stats.heard.values()) > 20
    assert sum(t.room.players["tower"].stats.heard.values()) > 0
    assert t.last("flyer", "deck")["learned_count"] > 0
    assert_language_paths(t, langs)


async def test_human_flyer_with_virtual_auto_tower(harness: Harness) -> None:
    t = Table(harness, harness.make())
    await t.join("flyer", "en", ready=False)
    await t.flyer.send({"type": "dev", "cmd": "bots", "args": {"tower": True}})
    tower = t.room.players["tower"]
    assert tower.is_bot and tower.name == "Auto Tower" and tower.lang == "hi"
    assert tower.gender == "male"
    rs = t.flyer.last("room_state")
    assert {p["role"]: p["is_bot"] for p in rs["players"]} == {"flyer": False, "tower": True}
    await t.flyer.send({"type": "dev", "cmd": "bots", "args": {"flyer": True}})
    await t.flyer.send({"type": "ready"})
    assert t.status == "PROLOGUE"
    # A skip needs only the human: the bot's role counts as voted.
    await t.flyer.send({"type": "skip_cinematic"})
    assert t.status == "PHASE_INTRO"
    run_to_deck(t)
    assert len(successes(t)) == 21
    utts = t.flyer.of("utterance")
    assert utts and all(u["speaker_name"] == "Auto Tower" for u in utts)
    assert t.flyer.last("deck")["partner_name"] == "Auto Tower"


async def test_virtual_bots_pick_different_languages(harness: Harness) -> None:
    t = Table(harness, harness.make())
    c = await t.connect("flyer")
    await t.join("tower", "hi", ready=False)
    await t.tower.send({"type": "dev", "cmd": "bots", "args": {"flyer": True}})
    assert t.room.players["flyer"].lang == "en" and t.room.players["flyer"].is_bot
    del c


@pytest.mark.parametrize(
    ("human_role", "human_lang", "bot_role", "bot_lang"),
    [("tower", "en", "flyer", "hi"), ("flyer", "hi", "tower", "en")],
)
async def test_virtual_bot_language_follows_human_not_role(
    harness: Harness, human_role: Role, human_lang: Lang, bot_role: Role, bot_lang: Lang
) -> None:
    """§A2 rule 9: the bot takes the opposite of the human's language, never its role's."""
    t = Table(harness, harness.make())
    await t.join(human_role, human_lang, ready=False)
    human = t.flyer if human_role == "flyer" else t.tower
    await human.send({"type": "dev", "cmd": "bots", "args": {bot_role: True}})
    bot = t.room.players[bot_role]
    assert bot.is_bot and bot.lang == bot_lang
    await human.send({"type": "dev", "cmd": "bots", "args": {human_role: True}})
    await human.send({"type": "ready"})
    assert t.status == "PROLOGUE"
    run_to_deck(t)
    assert len([r for r in human.of("action_result") if r["success"]]) == 21
    assert human.last("deck")["partner_lang"] == bot_lang


async def test_bots_stop_on_pause_and_resume(make_room: MakeRoom) -> None:
    t = await make_room(seed=21)
    await t.dev("bots", flyer=True, tower=True)
    t.until_active()
    await t.disconnect("tower")
    before = len(t.flyer.of("utterance"))
    t.advance(10_000)
    assert len(t.flyer.of("utterance")) == before  # bots silent while PAUSED
    await t.rejoin("tower")
    run_to_deck(t)
    assert len(successes(t)) == 21


async def test_bots_vote_retry_after_crash(make_room: MakeRoom) -> None:
    t = await make_room(seed=22)
    await t.dev("bots", flyer=True, tower=True)
    t.until_active()
    g = t.room.game
    assert g is not None
    g.fuel.add(-1000)
    t.advance(200)
    assert t.status == "CRASH"
    t.advance(5500)  # crash cinematic over: both roles are bots → automatic retry
    assert t.status in ("PHASE_INTRO", "PLAYING")
    assert g.attempts[1] == 2


# ---------------------------------------------------------------- §A17 demo run-of-show


def chips(msg: dict[str, object]) -> list[tuple[str, object]]:
    segs = msg["segments"]
    assert isinstance(segs, list)
    return [(s["text"], s.get("gloss")) for s in segs if s["kind"] == "keyword"]


def text_of(msg: dict[str, object]) -> str:
    segs = msg["segments"]
    assert isinstance(segs, list)
    return "".join(s["text"] for s in segs)


async def run_of_show(t: Table) -> dict[str, object]:
    """One §A17 run, line by line. Returns the observable outputs for comparison."""
    room = t.room
    out: dict[str, object] = {}
    assert t.last("flyer", "cinematic")["id"] == "prologue"
    assert t.last("flyer", "cinematic")["duration_ms"] == 6000
    t.until_active()
    g = room.game
    assert g is not None and t.action_id == "P1_A1"
    gs = t.last("tower", "game_state")
    assert gs["fuel_s"] == 300 and gs["total_actions"] == 3
    assert g.objects["OH_MASTER_LAMP"].color == "red"  # type: ignore[union-attr]
    # 0:08 P1_A1
    await t.say("tower", "Kaun si light jal rahi hai — laal ya neeli?")
    m = t.last("flyer", "utterance")
    assert text_of(m) == "Kaun si light jal rahi hai — laal ya neeli?"
    assert chips(m) == [("Kaun si", "which"), ("laal", "red"), ("neeli", "blue")]
    await t.say("flyer", "Red! The red one!")
    m = t.last("tower", "utterance")
    assert chips(m)[:2] == [("Red", "laal"), ("red", "laal")]
    await t.say("tower", "Ek number button dabao — teen nahi!")
    await t.click("OH_BTN_1", "press")
    t.advance(1300)
    assert t.last("flyer", "action_result")["success"] is True
    assert g.world.alarm is False
    # 0:30 P1_A3
    t.until_active()
    assert t.action_id == "P1_A3"
    await t.say("tower", "Teen number lever kheencho — chaar nahi!")
    await t.click("OH_HANDLE_3", "pull")
    assert t.last("flyer", "cinematic")["id"] == "p1_seat"
    # 0:42 P1_A7
    t.until_active()
    assert t.action_id == "P1_A7"
    await t.say("tower", "Chaar number switch band karo, phir ek number lever kheencho.")
    await t.click("OH_SW_4", "toggle")
    await t.click("OH_HANDLE_1", "pull")
    assert t.last("flyer", "action_result")["success"] is True
    t.run_until(lambda: t.status == "PHASE_OUTRO")  # after the 1.5 s gap
    assert t.last("flyer", "cinematic")["id"] == "p1_outro"
    # 0:55 p2_intro: right engine; bots play B1 and B3.
    t.run_until(lambda: t.status == "PHASE_INTRO" and g.phase == 2)
    intro = t.last("flyer", "cinematic")
    assert intro["id"] == "p2_intro" and intro["params"]["fire_side"] == "right"
    assert "fire_side" not in t.last("tower", "cinematic")["params"]
    t.run_until(lambda: t.status == "PHASE_OUTRO" and g.phase == 2, max_ms=90_000)
    assert room.bots == {"flyer": False, "tower": False}  # back off at p2_outro
    b1 = next(
        u for u in t.flyer.of("utterance") if text_of(u).startswith("Daayan laal lever kheencho")
    )
    out["b1"] = chips(b1)
    assert chips(b1) == [
        ("Daayan", "right"),
        ("laal", "red"),
        ("kheencho", None),  # glossed twice in phase 1: lost its brackets
        ("baayan", "left"),
        ("nahi", None),
    ]
    assert [r["action_id"] for r in t.flyer.of("action_result") if r["success"]][-2:] == [
        "P2_B1",
        "P2_B3",
    ]
    # 1:35 p3_intro: preset, three lifelines.
    t.run_until(lambda: t.status == "PLAYING" and g.phase == 3)
    t.until_active()
    assert t.action_id == "P3_C4"
    gs = t.last("tower", "game_state")
    assert gs["lifelines"] == {"flyer": 3, "tower": 3} and gs["lifelines_enabled"] is True
    for oid, kind_value in (("FP_LEVER_4", "down"), ("FP_FLAP_L", 2), ("FP_FLAP_R", 1)):
        assert g.objects[oid].value == kind_value  # type: ignore[union-attr]
    assert all(g.objects[f"FP_GEAR_LAMP_{i}"].color == "green" for i in (1, 2, 3))  # type: ignore[union-attr]
    # 1:45 P3_C4
    await t.say("tower", "Peela switch chalu karo.")
    await t.say("flyer", "Yellow switch… on!")
    await t.click("FP_LAND_SW", "toggle")
    assert t.last("flyer", "cinematic")["id"] == "p3_runway_reveal"
    # 2:00 P3_C5: lightning, red warning lamp, crossover, lifeline.
    t.run_until(lambda: g.cinematic is not None and g.cinematic.id == "lightning_strike")
    t.until_active()
    assert g.objects["FP_WARN_LAMP"].color == "red"  # type: ignore[union-attr]
    await t.say("tower", "Kaun si light jal rahi hai — neeli ya laal?")
    fuel_before = g.fuel.value()
    await t.say("flyer", "Laal!")
    toast = t.last("tower", "toast")
    assert toast["key"] == "toast.crossover" and toast["params"] == {"word": "laal"}
    assert g.fuel.value() > fuel_before + 4
    await t.say("tower", "Teen number button dabao — ek nahi!")
    await t.settle()
    utt = t.last("flyer", "utterance")
    assert all(s.get("gloss") is None for s in utt["segments"])  # signal lost
    await t.flyer.send({"type": "lifeline", "utterance_id": utt["id"]})
    await t.settle()
    tr = t.last("flyer", "translation")
    assert tr["text"] == "Press button three — not one!" and tr["lifelines_left"] == 2
    await t.click("FP_BTN_3", "press")
    t.advance(1300)
    # 2:20 P3_C7
    t.until_active()
    assert t.action_id == "P3_C7"
    await t.say("tower", "Ek number aur do number lever neeche karo.")
    await t.click("FP_LEVER_1", "move_down")
    await t.click("FP_LEVER_2", "move_down")
    assert t.last("flyer", "cinematic")["id"] == "p3_touchdown"
    # 2:35 P3_C8
    t.until_active()
    assert t.action_id == "P3_C8"
    await t.say("tower", "Laal lever kheencho! Phir engine band karo!")
    await t.click("FP_BRAKE", "pull")
    await t.click("FP_ENGINE_SW", "toggle")
    t.run_until(lambda: t.status == "PHASE_OUTRO")
    assert t.last("flyer", "cinematic")["id"] == "landing"
    # 2:45 ending → deck
    t.run_until(lambda: t.status == "ENDING")
    assert t.last("flyer", "cinematic")["duration_ms"] == 4000
    t.run_until(lambda: t.status == "DECK")
    deck = t.last("flyer", "deck")
    red = next(w for w in deck["words"] if w["concept"] == "RED")
    assert red["learned"] and red["word"] == "laal"
    out["learned"] = deck["learned_count"]
    assert not [r for r in t.flyer.of("action_result") if not r["success"]]
    assert {k: g.vars[k] for k in ("MASTER_COLOR", "FIRE_SIDE", "STILL_BURNING", "WARN_COLOR")} == {
        "MASTER_COLOR": "RED",
        "FIRE_SIDE": "RIGHT",
        "STILL_BURNING": "YES",
        "WARN_COLOR": "RED",
    }
    return out


async def test_demo_run_of_show_three_times_in_a_row(make_room: MakeRoom) -> None:
    t = await make_room(seed=None, demo=True, mock=True, dev_mode=False)
    assert t.room.demo and t.flyer.msgs[0]["demo"] is True
    results = []
    for run in range(3):
        if run:
            t.clear()
            await t.flyer.send({"type": "play_again"})
            await t.tower.send({"type": "play_again"})
            assert t.status == "PROLOGUE"
        results.append(await run_of_show(t))
    assert results[0] == results[1] == results[2]
    assert not t.flyer.of("dev_state")


async def test_presenter_keys(make_room: MakeRoom) -> None:
    t = await make_room(seed=None, demo=True, mock=False, dev_mode=False)
    t.until_active()
    assert t.action_id == "P1_A1"
    await t.tower.send({"type": "presenter", "cmd": "next_action"})  # N
    r = t.last("tower", "action_result")
    assert r["success"] is True and r["reason"] == "dev" and r["row_index"] == 0
    t.until_active()
    assert t.action_id == "P1_A3"
    await t.flyer.send({"type": "presenter", "cmd": "next_phase"})  # P
    assert t.status == "PHASE_OUTRO" and t.last("flyer", "cinematic")["id"] == "p1_outro"
    t.run_until(lambda: t.status == "PLAYING")
    assert t.room.game is not None and t.room.game.phase == 2
    plain = await make_room(seed=1)
    await plain.tower.send({"type": "presenter", "cmd": "next_action"})
    assert plain.last("tower", "error")["code"] == "demo_only"


async def test_demo_say_text_safety_net_in_real_mode(make_room: MakeRoom) -> None:
    t = await make_room(seed=None, demo=True, mock=False, dev_mode=False)
    t.until_active()
    await t.say("tower", "Ek number button dabao — teen nahi!")
    assert t.last("flyer", "utterance")["segments"]
    assert t.last("tower", "manual_card")["card"]["quick_say"] is None  # not mock, not dev
