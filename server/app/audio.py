"""PCM buffer helpers, WAV encoder and clip cutting (§B15.2)."""

from __future__ import annotations

import secrets
import struct
from collections.abc import Iterable

from app.constants import BYTES_PER_SECOND, SAMPLE_RATE
from app.speech.base import Utterance, WordItem

PAD_BEFORE_S = 0.08
PAD_AFTER_S = 0.12


def wav_bytes(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    """44-byte RIFF header (PCM16, mono) + data (§B15.2)."""
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(pcm))
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
        + b"data"
        + struct.pack("<I", len(pcm))
        + pcm
    )


def cut(pcm: bytes, start_s: float, end_s: float) -> bytes:
    """Slice [start − 0.08 s, end + 0.12 s] as byte offsets, clamped and even-aligned."""
    a = int((start_s - PAD_BEFORE_S) * BYTES_PER_SECOND)
    b = int((end_s + PAD_AFTER_S) * BYTES_PER_SECOND)
    a = max(0, min(a, len(pcm)))
    b = max(a, min(b, len(pcm)))
    a -= a % 2
    b -= b % 2
    return pcm[a:b]


def pronunciation_items(items: Iterable[WordItem]) -> list[WordItem]:
    """Token i of a real utterance maps 1:1 to pronunciation item i (§B11.4)."""
    return [i for i in items if i.kind == "pronunciation"]


def best_span(
    utterances: Iterable[Utterance], concept: str
) -> tuple[Utterance, float, float] | None:
    """The best timed speaker-side match of `concept`: highest minimum confidence."""
    best: tuple[float, Utterance, float, float] | None = None
    for u in utterances:
        if not u.pcm or not u.items:
            continue
        pron = pronunciation_items(u.items)
        for m in u.matches:
            if concept not in m.concepts or m.end > len(pron):
                continue
            span = pron[m.start : m.end]
            start, end = span[0].start_s, span[-1].end_s
            if start is None or end is None or end <= start:
                continue
            score = min((i.confidence if i.confidence is not None else 0.0) for i in span)
            if best is None or score > best[0]:
                best = (score, u, start, end)
    return None if best is None else (best[1], best[2], best[3])


def make_clip(clips: dict[str, bytes], utterances: Iterable[Utterance], concept: str) -> str | None:
    """Cut the partner's best clip of `concept` into `clips`; returns its URL or None."""
    found = best_span(utterances, concept)
    if found is None:
        return None
    utt, start, end = found
    assert utt.pcm is not None
    pcm = cut(utt.pcm, start, end)
    if not pcm:
        return None
    clip_id = "c_" + secrets.token_hex(4)
    clips[clip_id] = wav_bytes(pcm)
    return f"/clips/{clip_id}.wav"
