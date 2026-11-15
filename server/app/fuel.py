"""Fuel clock (§B10)."""

from __future__ import annotations

from collections.abc import Callable

from app.constants import FUEL_CAP_EXTRA_S


class FuelClock:
    """Drains in real (injected) monotonic time while running and not paused."""

    def __init__(self, monotonic: Callable[[], float], max_s: float = 0.0) -> None:
        self._now = monotonic
        self.max_s = max_s
        self.left_s = max_s
        self.running = False
        self.paused = False
        self.t0 = monotonic()

    @property
    def draining(self) -> bool:
        """True while fuel is actually going down."""
        return self.running and not self.paused

    def reset(self, max_s: float) -> None:
        """Full tank, stopped (phase start / retry)."""
        self.max_s = max_s
        self.left_s = max_s
        self.running = False
        self.paused = False
        self.t0 = self._now()

    def start(self) -> None:
        """Begin draining."""
        self.left_s = self.value()
        self.running = True
        self.paused = False
        self.t0 = self._now()

    def stop(self) -> None:
        """Stop draining for good (phase end, crash)."""
        self.left_s = self.value()
        self.running = False
        self.t0 = self._now()

    def value(self) -> float:
        """Seconds left right now."""
        if self.draining:
            return self.left_s - (self._now() - self.t0)
        return self.left_s

    def pause(self) -> None:
        """Freeze (cinematic, event, PAUSED). Idempotent."""
        if self.paused:
            return
        self.left_s = self.value()
        self.paused = True

    def resume(self) -> None:
        """Unfreeze. Idempotent: resuming a clock that is not paused changes nothing."""
        if not self.paused:
            return
        self.paused = False
        self.t0 = self._now()

    def add(self, delta: float) -> None:
        """Add or remove seconds; clamped to [0, max_s + 30] (§B10)."""
        value = self.value() + delta
        self.left_s = min(max(value, 0.0), self.max_s + FUEL_CAP_EXTRA_S)
        self.t0 = self._now()
