"""Subtitle segments for the listener and the gloss rule (§B11.5, §B11.6)."""

from __future__ import annotations

from app.content import Concept
from app.language.exposure import PlayerStats
from app.language.lexicon import Lexicon
from app.language.normalize import Token, norm_token, script_of
from app.language.romanize import display_line, render
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


def should_gloss(level: int, concept: Concept, stats: PlayerStats, threshold: int) -> bool:
    """The gloss rule, per listener (§B11.6). Level 0 glosses like level 1."""
    if level in (0, 1):
        return True
    if level == 2:
        return concept.introduced_in == 2 or stats.glossed[concept.id] < threshold
    return False


def display_text(utt: Utterance, lexicon: Lexicon) -> str:
    """`utterance_echo.transcript_display`: every token in Latin, no chips (§B11.6)."""
    return display_line(
        utt.tokens, utt.gaps, utt.lang, [*utt.matches, *utt.listener_matches], lexicon
    )


def build_segments(
    utt: Utterance,
    listener_lang: Lang,
    stats: PlayerStats,
    level: int,
    lexicon: Lexicon,
    threshold: int,
) -> list[Segment]:
    """Ordered segments covering the whole utterance, Latin only (§B11.5)."""
    words, gaps = render(
        utt.tokens, utt.gaps, utt.lang, [*utt.matches, *utt.listener_matches], lexicon
    )
    # SPEC-ASSUMPTION: when the speaker used the listener's own language (dev typing with
    # `lang`), every word is the listener's own: all plain, like a listener-side match.
    keywords = {m.start: m for m in utt.matches} if utt.lang != listener_lang else {}
    out: list[Segment] = []
    buf = gaps[0] if gaps else ""
    i, n = 0, len(utt.tokens)
    while i < n:
        m = keywords.get(i)
        if m is not None:
            if buf:
                out.append(Segment(text=buf, kind="plain"))
                buf = ""
            text = words[m.start] + "".join(
                gaps[j + 1] + words[j + 1] for j in range(m.start, m.end - 1)
            )
            gloss: str | None = None
            if any(should_gloss(level, lexicon.concept(c), stats, threshold) for c in m.concepts):
                gloss = " ".join(lexicon.gloss_display(c, listener_lang) for c in m.concepts)
            if len(m.concepts) > 1:
                seg = Segment(
                    text=text,
                    kind="keyword",
                    concept=m.concepts[0],
                    concepts=m.concepts,
                    gloss=gloss,
                )
            else:
                seg = Segment(text=text, kind="keyword", concept=m.concepts[0], gloss=gloss)
            out.append(seg)
            i = m.end
        else:
            buf += words[i]
            i += 1
        buf += gaps[i]
    if buf:
        out.append(Segment(text=buf, kind="plain"))
    return out
