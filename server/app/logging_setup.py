"""JSON-lines logging (§B17)."""

from __future__ import annotations

import logging
import sys
from datetime import UTC, datetime

import orjson

_RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    """One JSON object per line: ts, level, logger, msg plus any `extra` fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return orjson.dumps(payload, default=str).decode()


def setup_logging(level: str = "INFO") -> None:
    """Install the JSON formatter on the root logger (§B17)."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


def log_event(
    logger: logging.Logger, evt: str, level: int = logging.INFO, **fields: object
) -> None:
    """Log one structured event `{"evt": evt, ...fields}` (§B17)."""
    logger.log(level, evt, extra={"evt": evt, **fields})
