"""Exposure, credits and crossover (§B11.7)."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field


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
