"""§B11.3 romanizer and token display."""

from __future__ import annotations

import pytest

from app.language.lexicon import Lexicon
from app.language.normalize import gaps, tokenize
from app.language.romanize import display_line, romanize
from app.protocol import Lang


def line(lexicon: Lexicon, text: str, lang: Lang = "hi") -> str:
    toks = tokenize(text)
    return display_line(toks, gaps(text, toks), lang, lexicon.match(toks, lang), lexicon)


def test_keyword_variant_roman(lexicon: Lexicon) -> None:
    assert line(lexicon, "हरी") == "Hari"
    assert line(lexicon, "ओके हरी") == "Ok hari"
    assert line(lexicon, "कौन सी") == "Kaun si"


def test_loanword_table(lexicon: Lexicon) -> None:
    assert line(lexicon, "लाइट") == "Light"
    assert line(lexicon, "ओके ओवरहेड पैनल") == "Ok overhead panel"


def test_overrides(lexicon: Lexicon) -> None:
    assert line(lexicon, "ओके करो") == "Ok karo"
    assert line(lexicon, "ओके ग़लत") == "Ok galat"


@pytest.mark.parametrize(
    ("deva", "roman"),
    [
        ("नमस्ते", "namaste"),
        ("विमान", "vimaan"),
        ("उतार", "utaar"),
        ("ज़मीन", "zameen"),
        ("नमक", "namak"),
        ("फ़ोन", "fon"),
        ("दुःख", "duhkh"),
        ("संभाल", "sambhaal"),
        ("न", "na"),
    ],
)
def test_fallback_samples(deva: str, roman: str) -> None:
    assert romanize(deva) == roman


def test_fallback_via_display(lexicon: Lexicon) -> None:
    assert line(lexicon, "ओके खिड़की") == "Ok khidki"
    assert line(lexicon, "ओके विमान") == "Ok vimaan"


def test_digits_shown_as_words_in_speaker_language(lexicon: Lexicon) -> None:
    assert line(lexicon, "3 नंबर", "hi") == "Teen number"
    assert line(lexicon, "३ नंबर", "hi") == "Teen number"
    assert line(lexicon, "switch 3", "en") == "Switch three"
    assert line(lexicon, "10 सेकंड", "hi") == "10 sekand"


def test_capitalization_after_sentence_end(lexicon: Lexicon) -> None:
    assert line(lexicon, "तीन नंबर बटन दबाओ। हाँ? लाल!") == "Teen number button dabao. Haan? Laal!"


def test_output_is_always_latin(lexicon: Lexicon) -> None:
    out = line(lexicon, "अजीब॰शब्द ॐ ऋषि")
    assert all(not ("ऀ" <= ch <= "ॿ") for ch in out)
