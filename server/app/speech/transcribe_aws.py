"""Amazon Transcribe streaming session (§B13.3)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from typing import Any

from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.exceptions import SDKError
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent, TranscriptResultStream
from awscrt.exceptions import AwsCrtError

from app.config import Settings
from app.constants import SAMPLE_RATE
from app.logging_setup import log_event
from app.protocol import Lang
from app.speech.base import (
    PartialCallback,
    SessionFactory,
    SpeechError,
    SpeechSession,
    TranscriptResult,
    WordItem,
)

log = logging.getLogger("wingin.transcribe")
START_TIMEOUT_S = 5.0
FEED_TIMEOUT_S = 2.0
END_TIMEOUT_S = 2.0
LANG_CODE: dict[Lang, str] = {"hi": "hi-IN", "en": "en-US"}
# Everything the SDK and its CRT transport raise for a failed stream.
STREAM_ERRORS: tuple[type[BaseException], ...] = (
    SDKError,
    AwsCrtError,
    OSError,
    TimeoutError,
    RuntimeError,
    ValueError,
)


def stream_kwargs(settings: Settings, lang: Lang) -> dict[str, Any]:
    """Arguments for `start_stream_transcription` (§B13.3).

    SPEC-ASSUMPTION: amazon-transcribe 0.6.x requires `language_code` as a keyword (pass
    None for multi-language identification) and takes `language_options` and
    `vocabulary_names` as lists, not comma-joined strings (checked with inspect.signature).
    """
    # Any: mixed str/int/bool/list keyword arguments for the SDK call.
    kwargs: dict[str, Any] = {"media_sample_rate_hz": SAMPLE_RATE, "media_encoding": "pcm"}
    if settings.transcribe_multi_lang:
        kwargs.update(
            language_code=None,
            identify_multiple_languages=True,
            language_options=["hi-IN", "en-US"],
            preferred_language=LANG_CODE[lang],
        )
        vocabs = [v for v in (settings.transcribe_vocab_hi, settings.transcribe_vocab_en) if v]
        if vocabs:
            kwargs["vocabulary_names"] = vocabs
    else:
        kwargs["language_code"] = LANG_CODE[lang]
        vocab = settings.transcribe_vocab_hi if lang == "hi" else settings.transcribe_vocab_en
        if vocab:
            kwargs["vocabulary_name"] = vocab
    return kwargs


@dataclass(slots=True)
class Final:
    """One final result: transcript + items."""

    transcript: str
    items: list[WordItem]


class Handler(TranscriptResultStreamHandler):
    """Partials go to the speaker; finals are kept for the utterance."""

    def __init__(self, stream: TranscriptResultStream, on_partial: PartialCallback) -> None:
        super().__init__(stream)
        self.on_partial = on_partial
        self.finals: list[Final] = []

    async def handle_transcript_event(self, transcript_event: TranscriptEvent) -> None:
        for r in transcript_event.transcript.results:
            if not r.alternatives:
                continue
            alt = r.alternatives[0]
            if r.is_partial:
                await self.on_partial(alt.transcript or "")
                continue
            items = [
                WordItem(
                    token=i.content or "",
                    start_s=i.start_time,
                    end_s=i.end_time,
                    confidence=getattr(i, "confidence", None),
                    kind="punctuation" if i.item_type == "punctuation" else "pronunciation",
                )
                for i in alt.items or []
            ]
            self.finals.append(Final(alt.transcript or "", items))

    async def run(self) -> None:
        """Read the result stream until it ends."""
        await self.handle_events()  # type: ignore[no-untyped-call]


class AwsSession:
    """One Transcribe stream per utterance; any exception → `ok=False`."""

    def __init__(self, settings: Settings, lang: Lang, on_partial: PartialCallback) -> None:
        self.settings = settings
        self.lang = lang
        self.on_partial = on_partial
        # Any: the SDK's event stream object (no public type for its input side).
        self.stream: Any = None
        self.handler: Handler | None = None
        self.reader: asyncio.Task[None] | None = None
        self.error: str | None = None

    async def start(self) -> None:
        client = TranscribeStreamingClient(region=self.settings.aws_region)
        kwargs = stream_kwargs(self.settings, self.lang)
        self.stream = await asyncio.wait_for(
            client.start_stream_transcription(**kwargs), START_TIMEOUT_S
        )
        self.handler = Handler(self.stream.output_stream, self.on_partial)
        self.reader = asyncio.create_task(self.handler.run())

    async def feed(self, pcm: bytes) -> None:
        if self.stream is None or self.error:
            return
        try:
            await asyncio.wait_for(
                self.stream.input_stream.send_audio_event(audio_chunk=pcm), FEED_TIMEOUT_S
            )
        except STREAM_ERRORS as exc:
            self.error = repr(exc)

    async def finish(self, timeout_s: float) -> TranscriptResult:
        if self.stream is None or self.handler is None or self.reader is None:
            return TranscriptResult(transcript="", items=[], ok=False, error="not started")
        try:
            # Use a single deadline for the entire finish sequence.
            deadline = asyncio.get_running_loop().time() + timeout_s
            remaining = max(0.0, deadline - asyncio.get_running_loop().time())
            await asyncio.wait_for(self.stream.input_stream.end_stream(), remaining)
            remaining = max(0.0, deadline - asyncio.get_running_loop().time())
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(asyncio.shield(self.reader), remaining)
            if self.reader.done() and not self.reader.cancelled():
                failure = self.reader.exception()
                if failure is not None:
                    raise SpeechError(repr(failure)) from failure
        except STREAM_ERRORS as exc:  # any SDK failure (SpeechError is a RuntimeError)
            log_event(log, "transcribe_fail", level=logging.WARNING, err=repr(exc))
            # On timeout/error, return whatever finals we've collected so far.
            if self.handler.finals:
                return self._build_from_finals()
            return TranscriptResult(transcript="", items=[], ok=False, error=repr(exc))
        finally:
            if not self.reader.done():
                self.reader.cancel()
        return self._build_from_finals()

    def _build_from_finals(self) -> TranscriptResult:
        """Build a TranscriptResult from whatever finals the handler has collected."""
        finals = self.handler.finals if self.handler else []
        return TranscriptResult(
            transcript=" ".join(f.transcript for f in finals if f.transcript),
            items=[i for f in finals for i in f.items],
            ok=self.error is None and bool(finals),
            error=self.error,
        )

    async def abort(self) -> None:
        if self.stream is not None:
            with contextlib.suppress(*STREAM_ERRORS):
                await asyncio.wait_for(self.stream.input_stream.end_stream(), END_TIMEOUT_S)
        if self.reader is not None and not self.reader.done():
            self.reader.cancel()


def aws_session_factory(settings: Settings) -> SessionFactory:
    """`open_session(lang, on_partial)` backed by Amazon Transcribe (§B13.1)."""

    async def open_session(lang: Lang, on_partial: PartialCallback) -> SpeechSession:
        session = AwsSession(settings, lang, on_partial)
        try:
            await session.start()
        except STREAM_ERRORS as exc:
            log_event(log, "transcribe_fail", level=logging.WARNING, err=repr(exc))
            raise SpeechError(repr(exc)) from exc
        return session

    return open_session
