"""Subtitle segments for the listener (§B11.5)."""

from __future__ import annotations

from app.language.exposure import PlayerStats
from app.language.lexicon import Lexicon
from app.language.normalize import Token, display_gap, norm_token, script_of
from app.protocol import Lang, Segment
from app.speech.base import Utterance, WordItem


def tokens_from_items(items: list[WordItem]) -> tuple[list[Token], list[str], str]:
    """One token per pronunciation item; punctuation items attach to the gap (§B11.4)."""
    text = ""
    tokens: list[Token] = []
    for it in items:
        if it.kind == "punctuation":
            text += it.token
            continue
        if text:
            text += " "
        start = len(text)
        text += it.token
        raw = it.token
        tokens.append(Token(raw, start, len(text), norm_token(raw), script_of(raw)))
    gs: list[str] = []
    prev = 0
    for t in tokens:
        gs.append(text[prev : t.start])
        prev = t.end
    gs.append(text[prev:])
    return tokens, gs, text


def display_text(utt: Utterance, lexicon: Lexicon) -> str:
    """The transcript for display (plain, M1)."""
    del lexicon
    out = display_gap(utt.gaps[0]) if utt.gaps else ""
    for i, t in enumerate(utt.tokens):
        out += t.raw + display_gap(utt.gaps[i + 1])
    return out.strip()


def build_segments(
    utt: Utterance,
    listener_lang: Lang,
    stats: PlayerStats,
    level: int,
    lexicon: Lexicon,
    threshold: int,
) -> list[Segment]:
    """Plain segments covering the whole utterance (M1)."""
    del listener_lang, stats, level, threshold
    return [Segment(text=display_text(utt, lexicon), kind="plain")]
