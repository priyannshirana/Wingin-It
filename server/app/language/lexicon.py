"""Lexicon index and the deterministic keyword matcher (§B11.2)."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Literal

from rapidfuzz import fuzz

from app.content import Concept
from app.content import Lexicon as LexiconContent
from app.language.normalize import Token, norm_token, tokenize
from app.protocol import ConceptId, Lang

FUZZY_MIN_LEN = 4
FUZZY_MIN_SCORE = 85.0
MULTI_MAX = 3

Side = Literal["speaker", "listener"]


@dataclass(frozen=True, slots=True)
class Match:
    """One keyword match over tokens [start, end) (§B11.2)."""

    start: int
    end: int
    concepts: list[ConceptId]
    side: Side
    variant: str
    roman: str | None
    fuzzy: bool


@dataclass(frozen=True, slots=True)
class _Entry:
    concepts: tuple[ConceptId, ...]
    roman: str | None


@dataclass(slots=True)
class _Index:
    single: dict[str, _Entry] = field(default_factory=dict)
    multi: dict[int, dict[str, _Entry]] = field(default_factory=dict)
    fuzzy: list[tuple[str, tuple[ConceptId, ...]]] = field(default_factory=list)
    on_off_guard: bool = False

    def add(self, variant: str, concepts: tuple[ConceptId, ...], roman: str | None) -> None:
        key = " ".join(norm_token(p) for p in variant.split())
        n = len(key.split(" "))
        entry = _Entry(concepts, roman)
        if n == 1:
            self.single.setdefault(key, entry)
        else:
            self.multi.setdefault(n, {}).setdefault(key, entry)

    def add_fuzzy(self, variant: str, concepts: tuple[ConceptId, ...]) -> None:
        key = norm_token(variant)
        if len(key) >= FUZZY_MIN_LEN and key.isascii() and key.isalpha():
            self.fuzzy.append((key, concepts))


def _is_fuzzy_candidate(tok: Token) -> bool:
    return (
        tok.script == "latin"
        and len(tok.norm) >= FUZZY_MIN_LEN
        and tok.norm.isascii()
        and tok.norm.isalpha()
    )


class Lexicon:
    """Per-language indexes built from `content/lexicon.json` (§B11.2)."""

    def __init__(self, content: LexiconContent) -> None:
        self.content = content
        self.concepts: dict[str, Concept] = {c.id: c for c in content.concepts}
        self.order: list[ConceptId] = [c.id for c in content.concepts]
        self.guard_next: frozenset[str] = frozenset(
            norm_token(w) for w in content.on_off_guard_next
        )
        self.shared: dict[str, str] = {}
        for sw in content.shared_words:
            self.shared[norm_token(sw.en)] = sw.en
            for d in sw.deva:
                self.shared[norm_token(d)] = sw.en
        self.overrides: dict[str, str] = {
            norm_token(k): v for k, v in content.romanize_overrides.items()
        }
        self.speaker: dict[Lang, _Index] = {"en": _Index(on_off_guard=True), "hi": _Index()}
        self.listener: dict[Lang, _Index] = {"en": _Index(on_off_guard=True), "hi": _Index()}
        self._build()

    # ------------------------------------------------------------------ index building

    def _build(self) -> None:
        sp_en, sp_hi = self.speaker["en"], self.speaker["hi"]
        ls_en, ls_hi = self.listener["en"], self.listener["hi"]
        for c in self.content.concepts:
            one: tuple[ConceptId, ...] = (c.id,)
            for v in c.en.variants:
                sp_en.add(v, one, None)
                sp_en.add_fuzzy(v, one)
                ls_en.add(v, one, None)
            for v in c.en.crossover:
                # Devanagari loan spellings of the English word, displayed in English.
                ls_en.add(v, one, c.en.display)
            for hv in c.hi.variants:
                sp_hi.add(hv.deva, one, hv.roman)
            for v in c.hi.roman_variants:
                sp_hi.add(v, one, None)
                sp_hi.add_fuzzy(v, one)
                ls_hi.add(v, one, None)
            for v in c.hi.crossover:
                ls_hi.add(v, one, None)
        twice = self.content.special.get("en_twice")
        if twice is not None:
            pair = tuple(twice.concepts)
            sp_en.add(twice.variant, pair, None)
            sp_en.add_fuzzy(twice.variant, pair)
            ls_en.add(twice.variant, pair, None)

    # ------------------------------------------------------------------------ lookups

    def concept(self, cid: str) -> Concept:
        """Concept by id."""
        return self.concepts[cid]

    def display(self, cid: str, lang: Lang) -> str:
        """Latin display form: `en.display` or `hi.display_roman` (§B11.5)."""
        c = self.concepts[cid]
        return c.en.display if lang == "en" else c.hi.display_roman

    def gloss_display(self, cid: str, lang: Lang) -> str:
        """Gloss form in the listener's script: Devanagari for hi, English for en (§B11.5)."""
        c = self.concepts[cid]
        return c.en.display if lang == "en" else unicodedata.normalize("NFC", c.hi.display_deva)

    def shared_english(self, norm: str) -> str | None:
        """English spelling of a shared word (लाइट → light), or None."""
        return self.shared.get(norm)

    def is_shared(self, tok: Token) -> bool:
        """Shared words are never keywords."""
        return tok.norm in self.shared

    # ----------------------------------------------------------------------- matching

    def _exact_and_multi(
        self, tokens: Sequence[Token], index: _Index, side: Side, taken: set[int]
    ) -> list[Match]:
        out: list[Match] = []
        for n in range(MULTI_MAX, 1, -1):
            table = index.multi.get(n)
            if not table:
                continue
            i = 0
            while i + n <= len(tokens):
                span = range(i, i + n)
                if any(j in taken for j in span):
                    i += 1
                    continue
                key = " ".join(tokens[j].norm for j in span)
                entry = table.get(key)
                if entry is None:
                    i += 1
                    continue
                out.append(Match(i, i + n, list(entry.concepts), side, key, entry.roman, False))
                taken.update(span)
                i += n
        for i, tok in enumerate(tokens):
            if i in taken:
                continue
            entry = index.single.get(tok.norm)
            if entry is not None:
                out.append(
                    Match(i, i + 1, list(entry.concepts), side, tok.norm, entry.roman, False)
                )
                taken.add(i)
        return out

    def _fuzzy(self, tokens: Sequence[Token], index: _Index, taken: set[int]) -> list[Match]:
        out: list[Match] = []
        for i, tok in enumerate(tokens):
            if i in taken or not _is_fuzzy_candidate(tok):
                continue
            best: dict[tuple[ConceptId, ...], tuple[float, str]] = {}
            for variant, concepts in index.fuzzy:
                score = fuzz.ratio(tok.norm, variant)
                if concepts not in best or score > best[concepts][0]:
                    best[concepts] = (score, variant)
            if not best:
                continue
            ranked = sorted(best.items(), key=lambda kv: kv[1][0], reverse=True)
            top_concepts, (top_score, top_variant) = ranked[0]
            runner_up = ranked[1][1][0] if len(ranked) > 1 else -1.0
            if top_score >= FUZZY_MIN_SCORE and top_score > runner_up:
                out.append(Match(i, i + 1, list(top_concepts), "speaker", top_variant, None, True))
                taken.add(i)
        return out

    def _guard(self, tokens: Sequence[Token], matches: list[Match], taken: set[int]) -> list[Match]:
        kept: list[Match] = []
        for m in matches:
            guarded = m.concepts in (["ON"], ["OFF"]) and m.end < len(tokens)
            if guarded and tokens[m.end].norm in self.guard_next:
                taken.difference_update(range(m.start, m.end))
                continue
            kept.append(m)
        return kept

    def match(self, tokens: Sequence[Token], lang: Lang, *, side: Side = "speaker") -> list[Match]:
        """Speaker-language matching: shared, multi, exact, fuzzy, ON/OFF guard (§B11.2)."""
        index = self.speaker[lang] if side == "speaker" else self.listener[lang]
        taken = {i for i, t in enumerate(tokens) if self.is_shared(t)}
        matches = self._exact_and_multi(tokens, index, side, taken)
        if side == "speaker":
            matches += self._fuzzy(tokens, index, taken)
        if index.on_off_guard:
            matches = self._guard(tokens, matches, taken)
        return sorted(matches, key=lambda m: m.start)

    def match_listener_side(
        self, tokens: Sequence[Token], listener_lang: Lang, taken: Iterable[int]
    ) -> list[Match]:
        """Listener-language words (Hinglish / crossover): exact + multi only (§B11.2)."""
        index = self.listener[listener_lang]
        used = set(taken) | {i for i, t in enumerate(tokens) if self.is_shared(t)}
        matches = self._exact_and_multi(tokens, index, "listener", used)
        if index.on_off_guard:
            matches = self._guard(tokens, matches, used)
        return sorted(matches, key=lambda m: m.start)

    def concepts_in(self, text: str, lang: Lang) -> list[ConceptId]:
        """Every concept occurrence in a line, speaker side (validator, bots)."""
        out: list[ConceptId] = []
        for m in self.match(tokenize(text), lang):
            out.extend(m.concepts)
        return out


def taken_indices(matches: Iterable[Match]) -> set[int]:
    """Token indices covered by matches."""
    return {i for m in matches for i in range(m.start, m.end)}
