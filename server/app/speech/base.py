"""Speech interfaces and the utterance record (§B13.1, §B11.4)."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict

from app.language.lexicon import Match
from app.language.normalize import Token
from app.protocol import Lang, Role, Segment


class WordItem(BaseModel):
    """One Transcribe item (or a typed token without timings)."""

    model_config = ConfigDict(extra="forbid")
    token: str
    start_s: float | None
    end_s: float | None
    confidence: float | None
    kind: Literal["pronunciation", "punctuation"] = "pronunciation"


class TranscriptResult(BaseModel):
    """A finished transcription."""

    model_config = ConfigDict(extra="forbid")
    transcript: str
    items: list[WordItem]
    ok: bool
    error: str | None = None


class SpeechSession(Protocol):
    """One streaming transcription per utterance (§B13.1)."""

    async def feed(self, pcm: bytes) -> None: ...

    async def finish(self, timeout_s: float) -> TranscriptResult: ...

    async def abort(self) -> None: ...


PartialCallback = Callable[[str], Awaitable[None]]
SessionFactory = Callable[[Lang, PartialCallback], Awaitable[SpeechSession]]


@dataclass(slots=True, eq=False)
class Utterance:
    """One radio transmission (§B11.4)."""

    id: str
    room: str
    speaker_id: str
    speaker_role: Role
    speaker_name: str
    lang: Lang
    phase: int
    level: int
    action_id: str | None
    transcript: str
    tokens: list[Token]
    gaps: list[str]
    items: list[WordItem] = field(default_factory=list)
    matches: list[Match] = field(default_factory=list)
    listener_matches: list[Match] = field(default_factory=list)
    listener_id: str | None = None
    listener_lang: Lang | None = None
    segments_for_listener: list[Segment] = field(default_factory=list)
    # Any: the exact `utterance` JSON object sent to the listener (replayed in `history`).
    listener_payload: dict[str, Any] | None = None
    glossed_concepts: set[str] = field(default_factory=set)
    unglossed_concepts: set[str] = field(default_factory=set)
    pcm: bytes | None = None
    translation: str | None = None
    translation_status: Literal["pending", "ready", "failed"] = "pending"
    translation_event: asyncio.Event = field(default_factory=asyncio.Event)
    lifelined_by: set[str] = field(default_factory=set)
    created_at: float = 0.0
    created_at_ms: int = 0
    released_at: float | None = None
    latency_ms: int | None = None
