"""Translators: the authored-line index used by the mock translator (§B14.1)."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Protocol

from app.constants import TRANSLATE_TIMEOUT_S
from app.content import Content
from app.language.lexicon import Lexicon
from app.language.normalize import gaps, norm_line, tokenize
from app.protocol import Lang
from app.rooms import wait_for


class Translator(Protocol):
    """Full-sentence translation (§B14.1)."""

    async def translate(self, text: str, src: Lang, dst: Lang) -> str: ...


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


class TranslateError(Exception):
    """A translation that could not be produced."""


class MockTranslator:
    """Authored-line index lookup, else keyword substitution (§B14.1)."""

    def __init__(self, content: Content, lexicon: Lexicon) -> None:
        self.lexicon = lexicon
        self.index, _ = build_line_index(content)

    async def translate(self, text: str, src: Lang, dst: Lang) -> str:
        return self.translate_sync(text, src, dst)

    def translate_sync(self, text: str, src: Lang, dst: Lang) -> str:
        """The same lookup without awaiting (tests, validator)."""
        if src == dst:
            return text
        pair = self.index.get(norm_line(text))
        if pair is not None:
            return pair.en if dst == "en" else pair.hi
        return self.substitute(text, src, dst)

    def substitute(self, text: str, src: Lang, dst: Lang) -> str:
        """Replace each speaker-side keyword with its `dst` form, keep the rest."""
        toks = tokenize(text)
        gs = gaps(text, toks)
        starts = {m.start: m for m in self.lexicon.match(toks, src)}
        out = gs[0]
        i = 0
        while i < len(toks):
            m = starts.get(i)
            if m is not None:
                forms = []
                for cid in m.concepts:
                    c = self.lexicon.concept(cid)
                    forms.append(c.hi.display_deva if dst == "hi" else c.en.display)
                out += " ".join(forms)
                i = m.end
            else:
                out += toks[i].raw
                i += 1
            out += gs[i]
        return out


class AwsTranslator:
    """Amazon Translate in a worker thread with a 5 s timeout (§B14.1)."""

    def __init__(self, region: str, terminology: str = "", client: Any = None) -> None:
        self.region = region
        self.terminology = terminology
        # Any: a boto3 `translate` client (created lazily off the event loop).
        self._client: Any = client

    def _call(self, text: str, src: Lang, dst: Lang) -> str:
        if self._client is None:
            import boto3

            self._client = boto3.client("translate", region_name=self.region)
        resp = self._client.translate_text(
            Text=text,
            SourceLanguageCode=src,
            TargetLanguageCode=dst,
            TerminologyNames=[self.terminology] if self.terminology else [],
        )
        return str(resp["TranslatedText"])

    async def translate(self, text: str, src: Lang, dst: Lang) -> str:
        if src == dst:
            return text
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            return await wait_for(
                asyncio.to_thread(self._call, text, src, dst), TRANSLATE_TIMEOUT_S
            )
        except (BotoCoreError, ClientError, KeyError) as exc:
            raise TranslateError(repr(exc)) from exc
