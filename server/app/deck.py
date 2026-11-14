"""Word deck payload, stats and the mission report (§B15.1, §B15.3)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from app.protocol import (
    DeckMsg,
    DeckWord,
    LifelinesUsed,
    PhaseStatsOut,
    Stats,
)
from app.rooms import Player, Room, send

if TYPE_CHECKING:
    from app.game import Game

PHASE_NO: dict[int, Literal[1, 2, 3]] = {1: 1, 2: 2, 3: 3}

TEMPLATES = {
    "en": "{flyer} and {tower} landed with {fuel}s of fuel to spare. "
    "You learned {n} words, including {w1} and {w2}.",
    "hi": "{flyer} और {tower} ने {fuel} सेकंड ईंधन बचाकर विमान उतार लिया। "
    "आपने {n} शब्द सीखे, जैसे {w1} और {w2}।",
}
TEMPLATES_SHORT = {
    "en": "{flyer} and {tower} landed with {fuel}s of fuel to spare. You learned {n} words.",
    "hi": "{flyer} और {tower} ने {fuel} सेकंड ईंधन बचाकर विमान उतार लिया। आपने {n} शब्द सीखे।",
}


def _game(room: Room) -> Game:
    g = room.game
    if g is None:
        raise RuntimeError("no game")
    return g


def build_words(room: Room, p: Player, q: Player) -> list[DeckWord]:
    """20 concepts, learned first by understood+spoken, then lexicon order (§B15.1)."""
    lexicon = room.svc.lexicon
    words: list[tuple[int, int, DeckWord]] = []
    for order, cid in enumerate(lexicon.order):
        c = lexicon.concept(cid)
        understood = p.stats.understood[cid]
        spoken = p.stats.spoken[cid]
        learned = understood >= 1 or spoken >= 1
        dw = DeckWord(
            concept=cid,
            word=c.hi.display_roman if q.lang == "hi" else c.en.display,
            meaning=c.hi.display_deva if p.lang == "hi" else c.en.display,
            meaning_script="deva" if p.lang == "hi" else "latin",
            understood=understood,
            spoken=spoken,
            learned=learned,
            clip_url=None,
        )
        score = understood + spoken if learned else -1
        words.append((-score, order, dw))
    words.sort(key=lambda t: (t[0], t[1]))
    return [w for _, _, w in words]


def build_stats(room: Room, p: Player, q: Player) -> Stats:
    """Per-phase and total stats for one player (§B15.1)."""
    g = _game(room)
    phases = []
    for n in sorted(g.phase_stats):
        ps = g.phase_stats[n]
        phases.append(
            PhaseStatsOut(
                phase=PHASE_NO[n],
                fuel_left_s=round(ps.fuel_left_s, 1),
                wrong_actions=ps.wrong,
                lifelines_used=ps.lifelines_used[p.id],
                attempts=g.attempts.get(n, 1),
                time_s=round(ps.time_s, 1),
            )
        )
    final = g.phase_stats[3].fuel_left_s if 3 in g.phase_stats else 0.0
    return Stats(
        phases=phases,
        wrong_actions_total=sum(ps.wrong for ps in g.phase_stats.values()),
        lifelines_used=LifelinesUsed(
            mine=sum(ps.lifelines_used[p.id] for ps in g.phase_stats.values()),
            partner=sum(ps.lifelines_used[q.id] for ps in g.phase_stats.values()),
        ),
        total_time_s=g.total_time_s,
        fuel_left_final_s=round(final, 1),
    )


def template_report(room: Room, p: Player, words: list[DeckWord]) -> str:
    """Fallback mission report in the player's language (§B15.3)."""
    g = _game(room)
    flyer = room.players.get("flyer")
    tower = room.players.get("tower")
    learned = [w.word for w in words if w.learned]
    fuel = g.phase_stats[3].fuel_left_s if 3 in g.phase_stats else 0.0
    fields = {
        "flyer": flyer.name if flyer else "",
        "tower": tower.name if tower else "",
        "fuel": round(fuel),
        "n": len(learned),
    }
    if len(learned) >= 2:
        return TEMPLATES[p.lang].format(**fields, w1=learned[0], w2=learned[1])
    return TEMPLATES_SHORT[p.lang].format(**fields)


def prepare(room: Room) -> None:
    """Build every player's deck at ENDING start (§B15.1)."""
    g = _game(room)
    for p in room.players.values():
        q = room.partner(p)
        if p.is_bot or q is None:
            continue
        words = build_words(room, p, q)
        g.reports[p.id] = template_report(room, p, words)
        g.decks[p.id] = DeckMsg(
            type="deck",
            partner_name=q.name,
            partner_lang=q.lang,
            partner_gender=q.gender,
            learned_count=sum(1 for w in words if w.learned),
            words=words,
            report=g.reports[p.id],
            report_pending=False,
            stats=build_stats(room, p, q),
        )


def send_deck(room: Room, p: Player) -> None:
    """One player's deck (entering DECK, or rejoin)."""
    g = room.game
    if g is None:
        return
    msg = g.decks.get(p.id)
    if msg is not None:
        send(p, msg)


def send_decks(room: Room) -> None:
    """Each player's own deck."""
    for p in room.players.values():
        send_deck(room, p)
