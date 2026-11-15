"""Mock speech session (§B13.1): no network; scripted results for tests and dev."""

from __future__ import annotations

from app.speech.base import PartialCallback, TranscriptResult, WordItem


class MockSession:
    """Collects audio and returns a scripted transcript.

    In Mock Mode it never gets audio (`say_text` skips sessions entirely); tests use it to
    drive the real push-to-talk flow without AWS.
    """

    def __init__(
        self,
        on_partial: PartialCallback | None = None,
        *,
        transcript: str = "",
        items: list[WordItem] | None = None,
        ok: bool = True,
        partials: list[str] | None = None,
    ) -> None:
        self.on_partial = on_partial
        self.transcript = transcript
        self.items = items or []
        self.ok = ok
        self.partials = list(partials or [])
        self.fed: list[bytes] = []
        self.aborted = False
        self.finished = False

    async def feed(self, pcm: bytes) -> None:
        self.fed.append(pcm)
        if self.partials and self.on_partial is not None:
            await self.on_partial(self.partials.pop(0))

    async def finish(self, timeout_s: float) -> TranscriptResult:
        del timeout_s
        self.finished = True
        if not self.ok:
            return TranscriptResult(transcript="", items=[], ok=False, error="mock failure")
        return TranscriptResult(transcript=self.transcript, items=self.items, ok=True)

    async def abort(self) -> None:
        self.aborted = True
