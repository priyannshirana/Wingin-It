"""NFC normalization, punctuation, Devanagari folding, digits, tokenization (§B11.1)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

DEVA = re.compile(r"[ऀ-ॿ]")
PUNCT = "।॥.,!?;:\"“”‘’'()[]{}—–-…/\\"
_PUNCT_SET = frozenset(PUNCT)
_APOSTROPHES = frozenset("'’")
DEVA_DIGITS_TO_ASCII = str.maketrans("०१२३४५६७८९", "0123456789")
CANDRABINDU = "ँ"
ANUSVARA = "ं"
NUKTA = "़"

Script = Literal["deva", "latin"]


@dataclass(frozen=True, slots=True)
class Token:
    """One token with its (start, end) offsets in the original NFC string."""

    raw: str
    start: int
    end: int
    norm: str
    script: Script


def nfc(text: str) -> str:
    """Unicode NFC (applied at every text entry point)."""
    return unicodedata.normalize("NFC", text)


def norm_token(raw: str) -> str:
    """Matching form of one token: lowercase, no apostrophes, ँ→ं, no nukta, ASCII digits."""
    s = nfc(raw).lower()
    s = s.replace("'", "").replace("’", "")
    s = s.replace(CANDRABINDU, ANUSVARA)
    s = s.replace(NUKTA, "")
    return s.translate(DEVA_DIGITS_TO_ASCII)


def script_of(raw: str) -> Script:
    """`deva` when the token contains any Devanagari character."""
    return "deva" if DEVA.search(raw) else "latin"


def _is_token_char(text: str, i: int) -> bool:
    ch = text[i]
    if ch.isspace():
        return False
    if ch in _APOSTROPHES:
        # Apostrophes inside a Latin word stay in the token (don't -> dont for matching).
        before = i > 0 and text[i - 1].isalpha() and not DEVA.match(text[i - 1])
        after = i + 1 < len(text) and text[i + 1].isalpha() and not DEVA.match(text[i + 1])
        return before and after
    return ch not in _PUNCT_SET


def tokenize(text: str) -> list[Token]:
    """Split NFC text on whitespace and punctuation, keeping offsets (§B11.1)."""
    s = nfc(text)
    tokens: list[Token] = []
    i, n = 0, len(s)
    while i < n:
        if not _is_token_char(s, i):
            i += 1
            continue
        j = i
        while j < n and _is_token_char(s, j):
            j += 1
        raw = s[i:j]
        tokens.append(Token(raw=raw, start=i, end=j, norm=norm_token(raw), script=script_of(raw)))
        i = j
    return tokens


def gaps(text: str, tokens: list[Token]) -> list[str]:
    """The n+1 gaps around n tokens: leading, between each pair, trailing."""
    s = nfc(text)
    out: list[str] = []
    prev = 0
    for t in tokens:
        out.append(s[prev : t.start])
        prev = t.end
    out.append(s[prev:])
    return out


def display_gap(gap: str) -> str:
    """Gap text for display: `।` and `॥` show as `.`; no Devanagari survives."""
    g = gap.replace("॥", ".").replace("।", ".")
    return DEVA.sub("", g)


def norm_line(text: str) -> str:
    """Line key: NFC, lowercase, punctuation stripped, spaces collapsed (§B14.1)."""
    return " ".join(t.norm for t in tokenize(text))
