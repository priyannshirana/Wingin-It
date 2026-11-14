"""Translators: the authored-line index used by the mock translator (§B14.1)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from app.content import Content
from app.language.normalize import norm_line


@dataclass(frozen=True, slots=True)
class LinePair:
    """An authored line's English and Devanagari Hindi forms."""

    en: str
    hi: str


def authored_lines(content: Content) -> Iterator[tuple[str, str, str]]:
    """Every authored (hi, hi_roman, en) triple: ask, say, branch say, flyer_examples."""
    for ph in content.phases.values():
        for a in ph.actions:
            for line in (a.ask, a.say):
                if line is not None:
                    yield line.hi, line.hi_roman, line.en
            for b in a.branches or []:
                yield b.say.hi, b.say.hi_roman, b.say.en
            ex = a.flyer_examples
            yield from zip(ex.hi, ex.hi_roman, ex.en, strict=False)


def build_line_index(content: Content) -> tuple[dict[str, LinePair], list[str]]:
    """Index every authored line form by `norm_line`; also return key conflicts (§B14.1)."""
    index: dict[str, LinePair] = {}
    conflicts: list[str] = []
    for hi, roman, en in authored_lines(content):
        pair = LinePair(en=en, hi=hi)
        for form in (hi, roman, en):
            key = norm_line(form)
            if not key:
                continue
            old = index.get(key)
            if old is None:
                index[key] = pair
            elif norm_line(old.en) != norm_line(en) or norm_line(old.hi) != norm_line(hi):
                conflicts.append(f"{key!r}: {old.en!r}/{old.hi!r} vs {en!r}/{hi!r}")
    return index, conflicts
