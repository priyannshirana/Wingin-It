"""§B11.5 subtitle segments."""

from __future__ import annotations

import itertools
import re
from typing import Any

import pytest

from app.content import Content
from app.language.exposure import PlayerStats
from app.language.lexicon import Lexicon, taken_indices
from app.language.normalize import gaps, tokenize
from app.language.subtitles import build_segments, display_text
from app.protocol import Lang, Segment
from app.speech.base import Utterance
from app.speech.translate import authored_lines

DEVA = re.compile(r"[ऀ-ॿ]")


def make_utt(lexicon: Lexicon, text: str, lang: Lang, listener_lang: Lang) -> Utterance:
    toks = tokenize(text)
    matches = lexicon.match(toks, lang)
    listener = (
        lexicon.match_listener_side(toks, listener_lang, taken_indices(matches))
        if listener_lang != lang
        else []
    )
    return Utterance(
        id="u_test",
        room="TEST",
        speaker_id="p_s",
        speaker_role="tower" if lang == "hi" else "flyer",
        speaker_name="S",
        lang=lang,
        phase=1,
        level=1,
        action_id=None,
        transcript=text,
        tokens=toks,
        gaps=gaps(text, toks),
        matches=matches,
        listener_matches=listener,
        listener_lang=listener_lang,
    )


def segs(
    lexicon: Lexicon, text: str, lang: Lang, listener: Lang, level: int = 1
) -> list[dict[str, Any]]:
    utt = make_utt(lexicon, text, lang, listener)
    out = build_segments(utt, listener, PlayerStats(), level, lexicon, 2)
    return [s.model_dump(exclude_unset=True) for s in out]


def chips(segments: list[dict[str, Any]]) -> list[tuple[str, str | None]]:
    return [(s["text"], s.get("gloss")) for s in segments if s["kind"] == "keyword"]


def test_build_spec_6_2_example(lexicon: Lexicon) -> None:
    assert segs(lexicon, "तीन नंबर बटन दबाओ", "hi", "en") == [
        {"text": "Teen", "kind": "keyword", "concept": "THREE", "gloss": "three"},
        {"text": " number button ", "kind": "plain"},
        {"text": "dabao", "kind": "keyword", "concept": "PRESS", "gloss": "press"},
    ]


def test_hinglish_example_6_7(lexicon: Lexicon) -> None:
    out = segs(lexicon, "Aag wala engine left hai? Toh left laal handle kheencho!", "hi", "en")
    assert "".join(s["text"] for s in out) == (
        "Aag wala engine left hai? Toh left laal handle kheencho!"
    )
    assert chips(out) == [("Aag", "fire"), ("laal", "red"), ("kheencho", "pull")]
    plain = "".join(s["text"] for s in out if s["kind"] == "plain")
    assert "left" in plain and "handle" in plain  # listener-language + shared words: plain


def test_devanagari_crossover_shown_in_english_plain(lexicon: Lexicon) -> None:
    out = segs(lexicon, "आग लेफ्ट इंजन में है", "hi", "en")
    assert "".join(s["text"] for s in out) == "Aag left engine mein hai"
    assert chips(out) == [("Aag", "fire")]


def test_hindi_listener_glosses_in_latin(lexicon: Lexicon) -> None:
    out = segs(lexicon, "Red! The red one!", "en", "hi")
    assert chips(out) == [("Red", "laal"), ("red", "laal"), ("one", "ek")]


def test_twice_one_chip_two_concepts(lexicon: Lexicon) -> None:
    out = segs(lexicon, "press it twice", "en", "hi")
    twice = next(s for s in out if s["text"] == "twice")
    assert twice["concept"] == "TWO" and twice["concepts"] == ["TWO", "TIMES"]
    assert twice["gloss"] == "do baar"


def test_segments_cover_the_whole_utterance_in_order(lexicon: Lexicon) -> None:
    for text, lang, listener in (
        ("कौन सी लाइट जल रही है — लाल या नीली?", "hi", "en"),
        ("Which light is on — red or blue?", "en", "hi"),
        ("  Teen   number,  button dabao!  ", "hi", "en"),
    ):
        utt = make_utt(lexicon, text, lang, listener)  # type: ignore[arg-type]
        out = build_segments(utt, listener, PlayerStats(), 1, lexicon, 2)  # type: ignore[arg-type]
        assert "".join(s.text for s in out) == display_text(utt, lexicon)
        kinds = [s.kind for s in out]
        assert all(not (a == b == "plain") for a, b in itertools.pairwise(kinds))


def _all_hindi_lines(content: Content) -> list[str]:
    return [hi for hi, _, _ in authored_lines(content)] + [r for _, r, _ in authored_lines(content)]


@pytest.mark.parametrize("level", [0, 1, 2, 3])
def test_no_devanagari_in_any_segment_for_every_authored_line(
    content: Content, lexicon: Lexicon, level: int
) -> None:
    lines = _all_hindi_lines(content)
    assert len(lines) > 80
    for text in lines:
        utt = make_utt(lexicon, text, "hi", "en")
        out: list[Segment] = build_segments(utt, "en", PlayerStats(), level, lexicon, 2)
        for s in out:
            assert not DEVA.search(s.text), (text, s)
            assert s.gloss is None or not DEVA.search(s.gloss), (text, s)
        assert not DEVA.search(display_text(utt, lexicon))


def test_no_devanagari_for_hindi_listener_glosses(content: Content, lexicon: Lexicon) -> None:
    for _, _, en in authored_lines(content):
        utt = make_utt(lexicon, en, "en", "hi")
        for s in build_segments(utt, "hi", PlayerStats(), 1, lexicon, 2):
            assert not DEVA.search(s.text) and not DEVA.search(s.gloss or "")


def test_same_language_speech_is_all_plain(lexicon: Lexicon) -> None:
    out = segs(lexicon, "Press button one", "en", "en")
    assert [s["kind"] for s in out] == ["plain"]
