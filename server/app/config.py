"""Environment configuration (§B3)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.constants import GLOSS_THRESHOLD_DEFAULT

SERVER_DIR = Path(__file__).resolve().parent.parent

# Regions where Transcribe streaming supports hi-IN (§B13.3). Verify against the AWS
# supported-languages table at deploy time; this list only drives a startup warning.
HI_STREAMING_REGIONS: frozenset[str] = frozenset(
    {
        "us-east-1",
        "us-east-2",
        "us-west-2",
        "ca-central-1",
        "eu-west-1",
        "eu-west-2",
        "eu-central-1",
        "ap-south-1",
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-southeast-2",
    }
)


def _flag(env: Mapping[str, str], name: str, default: bool) -> bool:
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


@dataclass(frozen=True, slots=True)
class Settings:
    """Frozen settings object read once at startup (§B3)."""

    mock_speech: bool = True
    dev_mode: bool = True
    demo_mode: bool = False
    aws_region: str = "us-east-1"
    transcribe_multi_lang: bool = False
    transcribe_vocab_hi: str = ""
    transcribe_vocab_en: str = ""
    translate_terminology: str = ""
    bedrock_model_id: str = ""
    ddb_table: str = ""
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)
    gloss_threshold: int = GLOSS_THRESHOLD_DEFAULT
    content_dir: Path = field(default_factory=lambda: SERVER_DIR.parent / "content")
    port: int = 8000
    log_level: str = "INFO"
    room_idle_ttl_s: int = 1800
    max_rooms: int = 200

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """Read every §B3 variable from the environment."""
        e = os.environ if env is None else env
        content_raw = e.get("CONTENT_DIR", "").strip()
        content_dir = Path(content_raw) if content_raw else SERVER_DIR.parent / "content"
        origins = tuple(
            o.strip() for o in e.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
        )
        return cls(
            mock_speech=_flag(e, "MOCK_SPEECH", True),
            dev_mode=_flag(e, "DEV_MODE", True),
            demo_mode=_flag(e, "DEMO_MODE", False),
            aws_region=e.get("AWS_REGION", "us-east-1").strip() or "us-east-1",
            transcribe_multi_lang=_flag(e, "TRANSCRIBE_MULTI_LANG", False),
            transcribe_vocab_hi=e.get("TRANSCRIBE_VOCAB_HI", "").strip(),
            transcribe_vocab_en=e.get("TRANSCRIBE_VOCAB_EN", "").strip(),
            translate_terminology=e.get("TRANSLATE_TERMINOLOGY", "").strip(),
            bedrock_model_id=e.get("BEDROCK_MODEL_ID", "").strip(),
            ddb_table=e.get("DDB_TABLE", "").strip(),
            allowed_origins=tuple(o for o in origins if o),
            gloss_threshold=_int(e, "GLOSS_THRESHOLD", GLOSS_THRESHOLD_DEFAULT),
            content_dir=content_dir.resolve(),
            port=_int(e, "PORT", 8000),
            log_level=e.get("LOG_LEVEL", "INFO").strip().upper() or "INFO",
            room_idle_ttl_s=_int(e, "ROOM_IDLE_TTL_S", 1800),
            max_rooms=_int(e, "MAX_ROOMS", 200),
        )

    def origin_allowed(self, origin: str | None) -> bool:
        """Origin check for CORS and the WebSocket (§B3, §B17)."""
        if origin is None:
            # Non-browser clients (curl, tests) send no Origin header.
            return True
        if origin in self.allowed_origins or "*" in self.allowed_origins:
            return True
        if self.dev_mode:
            for prefix in ("http://localhost:", "http://127.0.0.1:"):
                if origin.startswith(prefix) or origin in {prefix[:-1]}:
                    return True
        return False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings, read once (§B3)."""
    return Settings.from_env()
