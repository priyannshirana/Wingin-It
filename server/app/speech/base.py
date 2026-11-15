"""Speech interfaces and the utterance record (§B13.1, §B11.4)."""

from __future__ import annotations

import asyncio
import contextlib
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
SESSION_OPEN_TIMEOUT_S = 5.0


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


class SpeechError(RuntimeError):
    """A speech session that could not be opened or used."""


@dataclass(slots=True, eq=False)
class Transmission:
    """One push-to-talk transmission holding the radio channel (§B13.2)."""

    role: Role
    player_id: str
    lang: Lang
    token: int
    started_at: float
    buffer: bytearray = field(default_factory=bytearray)
    frames: asyncio.Queue[bytes | None] = field(default_factory=asyncio.Queue)
    feeder: asyncio.Task[None] | None = None
    session: SpeechSession | None = None
    failed: str | None = None
    last_partial_ms: float = -1e12


async def run_feeder(
    tx: Transmission, factory: SessionFactory, on_partial: PartialCallback
) -> None:
    """Open the session, then feed queued frames in order until the sentinel."""
    try:
        tx.session = await asyncio.wait_for(factory(tx.lang, on_partial), SESSION_OPEN_TIMEOUT_S)
    except (SpeechError, TimeoutError, OSError) as exc:
        tx.failed = repr(exc)
        return
    while True:
        frame = await tx.frames.get()
        if frame is None:
            return
        await tx.session.feed(frame)


async def finish_transmission(tx: Transmission, timeout_s: float) -> TranscriptResult:
    """Wait for the feeder, then the final transcript — one shared deadline (≤ timeout)."""
    tx.frames.put_nowait(None)
    try:
        deadline = asyncio.get_running_loop().time() + timeout_s
        if tx.feeder is not None:
            remaining = max(0.0, deadline - asyncio.get_running_loop().time())
            await asyncio.wait_for(tx.feeder, remaining)
        if tx.session is None:
            return TranscriptResult(transcript="", items=[], ok=False, error=tx.failed)
        remaining = max(0.0, deadline - asyncio.get_running_loop().time())
        return await asyncio.wait_for(tx.session.finish(remaining), remaining + 0.5)
    except (SpeechError, TimeoutError, OSError) as exc:
        return TranscriptResult(transcript="", items=[], ok=False, error=repr(exc))


async def abort_transmission(tx: Transmission) -> None:
    """Drop a transmission: stop feeding and abort its session."""
    tx.frames.put_nowait(None)
    if tx.feeder is not None and not tx.feeder.done():
        tx.feeder.cancel()
    if tx.session is not None:
        with contextlib.suppress(SpeechError, TimeoutError, OSError):
            await asyncio.wait_for(tx.session.abort(), SESSION_OPEN_TIMEOUT_S)
