"""§B11.1 normalization and tokenization."""

from __future__ import annotations

import unicodedata

from app.language.normalize import (
    display_gap,
    gaps,
    norm_line,
    norm_token,
    tokenize,
)


def test_nfc_applied_to_decomposed_input() -> None:
    # न + nukta composes to ऩ (U+0929) under NFC; "e" + acute composes to é.
    for decomposed in ("ऩ", "café"):
        composed = unicodedata.normalize("NFC", decomposed)
        assert decomposed != composed
        toks = tokenize(decomposed)
        assert len(toks) == 1
        assert toks[0].raw == composed


def test_candrabindu_folds_to_anusvara() -> None:
    assert norm_token("हाँ") == norm_token("हां") == "हां"


def test_nukta_dropped_for_matching_only() -> None:
    assert norm_token("फ़ायर") == norm_token("फायर")
    tok = tokenize("फ़ायर")[0]
    assert "़" in unicodedata.normalize("NFD", tok.raw)  # raw keeps the nukta


def test_devanagari_and_latin_punctuation_stripped() -> None:
    text = "तीन नंबर बटन दबाओ। हाँ॥ “red” — ‘blue’ (one), two! three? four… a-b /c\\"
    norms = [t.norm for t in tokenize(text)]
    assert norms == [
        "तीन", "नंबर", "बटन", "दबाओ", "हां", "red", "blue", "one", "two", "three",
        "four", "a", "b", "c",
    ]  # fmt: skip
    for t in tokenize(text):
        assert not set(t.raw) & set("।॥“”‘’—–-…()/\\!?,")


def test_offsets_preserved() -> None:
    text = "Teen  number, button dabao!"
    toks = tokenize(text)
    for t in toks:
        assert text[t.start : t.end] == t.raw
    g = gaps(text, toks)
    rebuilt = g[0] + "".join(t.raw + g[i + 1] for i, t in enumerate(toks))
    assert rebuilt == text


def test_apostrophe_removed_inside_latin_words() -> None:
    toks = tokenize("Don't press it’s 'quoted'")
    assert [t.raw for t in toks] == ["Don't", "press", "it’s", "quoted"]
    assert toks[0].norm == "dont"
    assert toks[2].norm == "its"


def test_digits_ascii_and_devanagari() -> None:
    assert norm_token("३") == "3"
    assert norm_token("१२") == "12"


def test_scripts() -> None:
    toks = tokenize("laal लाल")
    assert [t.script for t in toks] == ["latin", "deva"]


def test_danda_displays_as_period() -> None:
    assert display_gap("। ") == ". "
    assert display_gap("॥") == "."


def test_norm_line_collapses_spaces_and_punctuation() -> None:
    assert (
        norm_line("  Teen   number button dabao — ek nahi! ") == "teen number button dabao ek nahi"
    )
