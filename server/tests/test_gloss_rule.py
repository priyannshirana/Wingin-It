"""§B11.6 the gloss rule and exposure counters."""

from __future__ import annotations

import itertools

import pytest

from app.language.exposure import PlayerStats, record_shown
from app.language.lexicon import Lexicon
from app.language.subtitles import build_segments, should_gloss
from tests.test_subtitles import make_utt

THRESHOLD = 2


@pytest.mark.parametrize(
    ("level", "introduced", "glossed"),
    list(itertools.product([1, 2, 3], [1, 2], [0, 1, 2, 3])),
)
def test_every_combination(lexicon: Lexicon, level: int, introduced: int, glossed: int) -> None:
    concept = lexicon.concept("RED" if introduced == 1 else "LEFT")
    assert concept.introduced_in == introduced
    stats = PlayerStats()
    stats.glossed[concept.id] = glossed
    got = should_gloss(level, concept, stats, THRESHOLD)
    if level == 1:
        want = True
    elif level == 2:
        want = introduced == 2 or glossed < THRESHOLD
    else:
        want = False
    assert got is want


def test_level_zero_glosses_like_level_one(lexicon: Lexicon) -> None:
    stats = PlayerStats()
    stats.glossed["RED"] = 10
    assert should_gloss(0, lexicon.concept("RED"), stats, THRESHOLD) is True


def test_counters_heard_every_keyword_glossed_only_when_glossed(lexicon: Lexicon) -> None:
    stats = PlayerStats()
    text = "Laal button do baar dabao."
    for level, expect_glossed in ((1, 1), (1, 2), (2, 2), (3, 2)):
        utt = make_utt(lexicon, text, "hi", "en")
        segs = build_segments(utt, "en", stats, level, lexicon, THRESHOLD)
        record_shown(stats, segs)
        assert stats.glossed["RED"] == expect_glossed
    assert stats.heard["RED"] == 4 and stats.heard["TIMES"] == 4
    assert stats.shown >= {"RED", "TWO", "TIMES", "PRESS"}


def test_phase2_rule_is_per_listener(lexicon: Lexicon) -> None:
    seen_twice, seen_once = PlayerStats(), PlayerStats()
    seen_twice.glossed["PULL"] = 2
    seen_once.glossed["PULL"] = 1
    utt = make_utt(lexicon, "Daayan laal lever kheencho baayan nahi!", "hi", "en")
    a = build_segments(utt, "en", seen_twice, 2, lexicon, THRESHOLD)
    b = build_segments(utt, "en", seen_once, 2, lexicon, THRESHOLD)
    gloss_a = {s.concept: s.gloss for s in a if s.kind == "keyword"}
    gloss_b = {s.concept: s.gloss for s in b if s.kind == "keyword"}
    assert gloss_a["PULL"] is None and gloss_b["PULL"] == "pull"
    assert gloss_a["RIGHT"] == "right" and gloss_a["LEFT"] == "left"  # phase-2 words keep it
