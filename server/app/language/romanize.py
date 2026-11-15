"""Devanagari → readable Latin, and per-token subtitle display (§B11.3)."""

from __future__ import annotations

from collections.abc import Sequence

from app.language.lexicon import Lexicon, Match
from app.language.normalize import DEVA, NUKTA, Token, display_gap, nfc, norm_token
from app.protocol import ConceptId, Lang

CONSONANTS: dict[str, str] = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h",
}  # fmt: skip
NUKTA_FORMS: dict[str, str] = {
    "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f",
}  # fmt: skip
# Precomposed nukta letters (NFC decomposes them, but accept them anyway).
PRECOMPOSED: dict[str, str] = {
    "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z",
    "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
}  # fmt: skip
VOWELS: dict[str, str] = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o",
}  # fmt: skip
MATRAS: dict[str, str] = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e",
    "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॉ": "o", "ॅ": "e",
}  # fmt: skip
VIRAMA = "्"
ANUSVARA = "ं"
CANDRABINDU = "ँ"
VISARGA = "ः"
LABIALS = frozenset("पफबभम")
DEVA_DIGITS = {d: str(i) for i, d in enumerate("०१२३४५६७८९")}
DIGIT_CONCEPT: dict[str, ConceptId] = {"1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR"}

# SPEC-ASSUMPTION: §B11.3 allows extending the override list when tests show odd output, but
# content JSON is byte-for-byte; test-driven extras live here instead of in lexicon.json.
EXTRA_OVERRIDES: dict[str, str] = {"खिड़की": "khidki"}


def romanize(word: str) -> str:
    """Fallback romanizer: readable Hinglish, final-schwa deletion (§B11.3)."""
    s = nfc(word)
    out: list[str] = []
    aksharas = 0
    pending_a = False
    after_virama = False
    i, n = 0, len(s)
    while i < n:
        ch = s[i]
        nxt = s[i + 1] if i + 1 < n else ""
        if ch in CONSONANTS or ch in PRECOMPOSED:
            if pending_a:
                out.append("a")
            base = PRECOMPOSED.get(ch) or CONSONANTS[ch]
            if nxt == NUKTA:
                base = NUKTA_FORMS.get(ch, base)
                i += 1
            out.append(base)
            if not after_virama:
                aksharas += 1
            pending_a = True
            after_virama = False
        elif ch in MATRAS:
            out.append(MATRAS[ch])
            pending_a = False
            after_virama = False
        elif ch == VIRAMA:
            pending_a = False
            after_virama = True
        elif ch in (ANUSVARA, CANDRABINDU):
            if pending_a:
                out.append("a")
                pending_a = False
            out.append("m" if nxt in LABIALS else "n")
            after_virama = False
        elif ch == VISARGA:
            if pending_a:
                out.append("a")
                pending_a = False
            out.append("h")
        elif ch in VOWELS:
            if pending_a:
                out.append("a")
                pending_a = False
            out.append(VOWELS[ch])
            aksharas += 1
            after_virama = False
        elif ch in DEVA_DIGITS:
            out.append(DEVA_DIGITS[ch])
        elif ch.isascii():
            out.append(ch.lower())
        # any other Devanagari sign is dropped: output is always Latin
        i += 1
    if pending_a and aksharas < 2:
        out.append("a")
    return "".join(out)


def display_token(
    tok: Token, speaker_lang: Lang, match: tuple[Match, int] | None, lexicon: Lexicon
) -> str:
    """How one token appears in a subtitle, always Latin (§B11.3 rules 1–7)."""
    if tok.norm in DIGIT_CONCEPT:
        return lexicon.display(DIGIT_CONCEPT[tok.norm], speaker_lang)
    if tok.script == "latin":
        return tok.raw
    if match is not None:
        m, offset = match
        if m.roman:
            words = m.roman.split()
            if len(words) == m.end - m.start:
                return words[offset].lower()
            if offset == 0:
                return m.roman.lower()
    shared = lexicon.shared_english(tok.norm)
    if shared is not None:
        return shared.lower()
    raw = nfc(tok.raw)
    if raw in EXTRA_OVERRIDES:
        return EXTRA_OVERRIDES[raw]
    override = lexicon.overrides.get(norm_token(raw))
    if override is not None:
        return override.lower()
    return DEVA.sub("", romanize(raw)).lower()


def capitalize_first(s: str) -> str:
    """Uppercase the first letter only."""
    return s[:1].upper() + s[1:] if s else s


def render(
    tokens: Sequence[Token],
    gaps: Sequence[str],
    speaker_lang: Lang,
    matches: Sequence[Match],
    lexicon: Lexicon,
) -> tuple[list[str], list[str]]:
    """Display text per token and per gap, with sentence capitalization (§B11.3)."""
    covered: dict[int, tuple[Match, int]] = {}
    for m in matches:
        for k in range(m.start, m.end):
            covered[k] = (m, k - m.start)
    words = [display_token(t, speaker_lang, covered.get(i), lexicon) for i, t in enumerate(tokens)]
    shown_gaps = [display_gap(g) for g in gaps]
    for i in range(len(words)):
        if i == 0 or any(p in shown_gaps[i] for p in ".!?"):
            words[i] = capitalize_first(words[i])
    if shown_gaps:
        shown_gaps[0] = shown_gaps[0].lstrip()
        shown_gaps[-1] = shown_gaps[-1].rstrip()
    return words, shown_gaps


def display_line(
    tokens: Sequence[Token],
    gaps: Sequence[str],
    speaker_lang: Lang,
    matches: Sequence[Match],
    lexicon: Lexicon,
) -> str:
    """The whole line in Latin, no chips or glosses (echo, partial captions)."""
    words, shown = render(tokens, gaps, speaker_lang, matches, lexicon)
    return shown[0] + "".join(w + shown[i + 1] for i, w in enumerate(words))
