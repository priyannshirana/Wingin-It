"""DynamoDB results writer and the no-op writer (§B15.4)."""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Protocol

from app.constants import DDB_TIMEOUT_S
from app.logging_setup import log_event
from app.rooms import wait_for

if TYPE_CHECKING:
    from app.rooms import Room

log = logging.getLogger("wingin.persistence")


class Persister(Protocol):
    """Stores one finished game (failures are logged and ignored)."""

    # Any: a JSON-like DynamoDB item.
    async def save(self, item: dict[str, Any]) -> None: ...


class NoopPersister:
    """`DDB_TABLE` empty: don't persist."""

    async def save(self, item: dict[str, Any]) -> None:
        del item


def to_dynamo(value: Any) -> Any:
    """Numbers go in as Decimal (§B15.4). Any: arbitrary JSON-like values."""
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [to_dynamo(v) for v in value]
    return str(value)


class DynamoPersister:
    """`put_item` in a worker thread; failures logged and ignored."""

    def __init__(self, table: str, region: str, resource: Any = None) -> None:
        self.table_name = table
        self.region = region
        # Any: a boto3 DynamoDB Table resource (created lazily off the event loop).
        self._table: Any = resource

    def _put(self, item: dict[str, Any]) -> None:
        if self._table is None:
            import boto3

            self._table = boto3.resource("dynamodb", region_name=self.region).Table(self.table_name)
        self._table.put_item(Item=to_dynamo(item))

    async def save(self, item: dict[str, Any]) -> None:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            await wait_for(asyncio.to_thread(self._put, item), DDB_TIMEOUT_S)
        except (BotoCoreError, ClientError, TimeoutError, OSError) as exc:
            log_event(log, "persist_fail", level=logging.WARNING, err=repr(exc))


def _percentile(values: list[int], q: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    k = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[k]


def _iso(dt: Any) -> str | None:
    return None if dt is None else dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def game_item(room: Room) -> dict[str, Any]:
    """The `wingin_games` item for a finished game (§B15.4)."""
    g = room.game
    if g is None:
        raise RuntimeError("no game")
    lexicon = room.svc.lexicon
    latencies = [u.latency_ms for u in room.utterances if u.latency_ms is not None]
    words: dict[str, dict[str, dict[str, int]]] = {}
    for p in room.players.values():
        per: dict[str, dict[str, int]] = {}
        for cid in lexicon.order:
            counts = {
                "heard": p.stats.heard[cid],
                "glossed": p.stats.glossed[cid],
                "understood": p.stats.understood[cid],
                "spoken": p.stats.spoken[cid],
            }
            if any(counts.values()):
                per[cid] = counts
        words[p.id] = per
    return {
        "game_id": g.id,
        "room": room.code,
        "seed": g.seed,
        "demo": room.demo,
        "started_at": _iso(g.started_wall),
        "ended_at": _iso(g.ended_wall),
        "total_time_s": g.total_time_s,
        "players": [
            {"name": p.name, "role": p.role, "lang": p.lang, "gender": p.gender}
            for p in room.players.values()
        ],
        "phases": [
            {
                "phase": n,
                "fuel_left_s": round(ps.fuel_left_s, 1),
                "wrong_actions": ps.wrong,
                "lifelines_used": sum(ps.lifelines_used.values()),
                "attempts": g.attempts.get(n, 1),
                "time_s": round(ps.time_s, 1),
            }
            for n, ps in sorted(g.phase_stats.items())
        ],
        "words": words,
        "latency_ms_p50": _percentile(latencies, 0.5),
        "latency_ms_p95": _percentile(latencies, 0.95),
    }
