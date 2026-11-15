"""Per-IP sliding-window limits and UTC-day AWS spend caps (§B22). In memory, one process."""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field

from app.logging_setup import log_event

log = logging.getLogger("wingin.limits")
MS_PER_DAY = 86_400_000


@dataclass(slots=True)
class SlidingWindow:
    """At most `limit` hits per `window_s` per key."""

    limit: int
    window_s: float
    hits: dict[str, deque[float]] = field(default_factory=dict)

    def allow(self, key: str, now: float) -> bool:
        """Record a hit and report whether it is within the limit."""
        q = self.hits.setdefault(key, deque())
        while q and now - q[0] >= self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def prune(self, now: float) -> None:
        """Drop keys with no live hits."""
        for key in list(self.hits):
            q = self.hits[key]
            while q and now - q[0] >= self.window_s:
                q.popleft()
            if not q:
                del self.hits[key]


@dataclass(slots=True)
class DailyCap:
    """A counter that resets at the UTC day boundary and warns once per day when hit."""

    name: str
    limit: float
    used: float = 0.0
    day: int = -1
    warned: bool = False

    def _roll(self, now_ms: int) -> None:
        day = now_ms // MS_PER_DAY
        if day != self.day:
            self.day, self.used, self.warned = day, 0.0, False

    def exhausted(self, now_ms: int) -> bool:
        self._roll(now_ms)
        if self.used >= self.limit:
            self._warn()
            return True
        return False

    def add(self, amount: float, now_ms: int) -> None:
        self._roll(now_ms)
        self.used += amount

    def take(self, now_ms: int) -> bool:
        """Spend one unit; False (and a one-time warning) once the cap is reached."""
        if self.exhausted(now_ms):
            return False
        self.used += 1
        return True

    def _warn(self) -> None:
        if not self.warned:
            self.warned = True
            log_event(log, "daily_cap_hit", level=logging.WARNING, cap=self.name, limit=self.limit)


class Limits:
    """Every abuse/cost limiter of the process (§B22)."""

    def __init__(
        self,
        *,
        rooms_per_ip: int,
        rooms_window_s: int,
        ws_per_ip: int,
        gets_per_min: int,
        transcribe_daily_min: int,
        transcribe_room_min: int,
        translate_daily: int,
        bedrock_daily: int,
    ) -> None:
        self.create = SlidingWindow(rooms_per_ip, rooms_window_s)
        self.gets = SlidingWindow(gets_per_min, 60)
        self.ws_per_ip = ws_per_ip
        self.ws_open: dict[str, int] = {}
        self.transcribe = DailyCap("transcribe_seconds", transcribe_daily_min * 60)
        self.transcribe_room_s = transcribe_room_min * 60
        self.translate = DailyCap("translate_calls", translate_daily)
        self.bedrock = DailyCap("bedrock_reports", bedrock_daily)

    def ws_acquire(self, ip: str) -> bool:
        """Reserve a WebSocket slot for `ip`."""
        n = self.ws_open.get(ip, 0)
        if n >= self.ws_per_ip:
            return False
        self.ws_open[ip] = n + 1
        return True

    def ws_release(self, ip: str) -> None:
        n = self.ws_open.get(ip, 0) - 1
        if n > 0:
            self.ws_open[ip] = n
        else:
            self.ws_open.pop(ip, None)

    def transcribe_allowed(self, room_used_s: float, now_ms: int) -> bool:
        """Daily and per-room Transcribe minutes both below their caps."""
        if room_used_s >= self.transcribe_room_s:
            return False
        return not self.transcribe.exhausted(now_ms)

    def prune(self, now: float) -> None:
        self.create.prune(now)
        self.gets.prune(now)
