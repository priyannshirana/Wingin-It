"""Seeded roller with forcing (§B9.1)."""

from __future__ import annotations

import random
import secrets
from collections.abc import Sequence

from app.content import Option


def new_seed() -> int:
    """A fresh random 31-bit game seed (system entropy, never the global `random`)."""
    return secrets.randbits(31)


class Roller:
    """One per game. Rolls happen in a fixed order, so a seed always gives the same game."""

    def __init__(self, seed: int) -> None:
        self.seed = seed
        self.r = random.Random(seed)
        self.forced: dict[str, str] = {}

    def roll(self, var: str, options: Sequence[Option]) -> Option:
        """Pick a weighted option; a forced value for `var` wins once (§B9.1)."""
        if not options:
            raise ValueError(f"no options for {var}")
        forced = self.forced.pop(var, None)
        if forced is not None:
            for o in options:
                if o.value == forced:
                    return o
            # SPEC-ASSUMPTION: a forced value that is not an option is dropped and the variable
            # rolls normally — the simplest way to keep a game playable after a dev typo.
        total = sum(o.weight for o in options)
        x = self.r.random() * total
        for o in options:
            x -= o.weight
            if x < 0:
                return o
        return options[-1]
