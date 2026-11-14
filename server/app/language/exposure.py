"""Exposure, credits and crossover (§B11.7)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.protocol import Segment


@dataclass(slots=True)
class PlayerStats:
    """Per-player, per-concept counters; reset per game (§B11.7)."""

    heard: Counter[str] = field(default_factory=Counter)
    glossed: Counter[str] = field(default_factory=Counter)
    understood: Counter[str] = field(default_factory=Counter)
    spoken: Counter[str] = field(default_factory=Counter)
    shown: set[str] = field(default_factory=set)


@dataclass(frozen=True, slots=True)
class CreditEvent:
    """One keyword segment shown to a listener (§B11.7)."""

    utterance_id: str
    listener_id: str
    concept: str
    glossed: bool


def record_shown(stats: PlayerStats, segments: Sequence[Segment]) -> list[tuple[str, bool]]:
    """After building segments: heard on every keyword, glossed when shown with a gloss."""
    shown: list[tuple[str, bool]] = []
    for seg in segments:
        if seg.kind != "keyword" or seg.concept is None:
            continue
        concepts = seg.concepts or [seg.concept]
        glossed = seg.gloss is not None
        for c in concepts:
            stats.heard[c] += 1
            if glossed:
                stats.glossed[c] += 1
            stats.shown.add(c)
            shown.append((c, glossed))
    return shown


def understood_concepts(
    log: Sequence[CreditEvent], listener_id: str, lifelined: set[str]
) -> set[str]:
    """Concepts this listener got without a gloss and without a lifeline (§B11.7)."""
    return {
        e.concept
        for e in log
        if e.listener_id == listener_id and not e.glossed and e.utterance_id not in lifelined
    }
