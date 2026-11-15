"""§B11.2 keyword matching."""

from __future__ import annotations

from app.language.lexicon import Lexicon, Match, taken_indices
from app.language.normalize import tokenize
from app.protocol import Lang


def m(lexicon: Lexicon, text: str, lang: Lang) -> list[Match]:
    return lexicon.match(tokenize(text), lang)


def concepts(lexicon: Lexicon, text: str, lang: Lang) -> list[list[str]]:
    return [list(x.concepts) for x in m(lexicon, text, lang)]


def test_haan_both_spellings(lexicon: Lexicon) -> None:
    assert concepts(lexicon, "हाँ", "hi") == [["YES"]]
    assert concepts(lexicon, "हां", "hi") == [["YES"]]


def test_three_digit_forms(lexicon: Lexicon) -> None:
    assert concepts(lexicon, "3", "hi") == [["THREE"]]
    assert concepts(lexicon, "३", "hi") == [["THREE"]]
    assert concepts(lexicon, "3", "en") == [["THREE"]]


def test_which_multiword_both_scripts(lexicon: Lexicon) -> None:
    for text in ("kaun si light", "कौन सी लाइट", "Kaun sa"):
        ms = m(lexicon, text, "hi")
        assert len(ms) == 1
        assert ms[0].concepts == ["WHICH"]
        assert (ms[0].start, ms[0].end) == (0, 2)
    assert m(lexicon, "कौन सी", "hi")[0].roman == "kaun si"


def test_twice_is_one_match_two_concepts(lexicon: Lexicon) -> None:
    ms = m(lexicon, "press it twice", "en")
    assert [x.concepts for x in ms] == [["PRESS"], ["TWO", "TIMES"]]
    twice = ms[1]
    assert twice.end - twice.start == 1


def test_on_the_left_is_left_not_on(lexicon: Lexicon) -> None:
    assert concepts(lexicon, "on the left", "en") == [["LEFT"]]
    assert concepts(lexicon, "it's on my left", "en") == [["LEFT"]]


def test_switch_two_on_matches_on(lexicon: Lexicon) -> None:
    assert concepts(lexicon, "switch two on.", "en") == [["TWO"], ["ON"]]
    assert concepts(lexicon, "turn it on", "en") == [["ON"]]


def test_kheecho_and_fuzzy_pull(lexicon: Lexicon) -> None:
    exact = m(lexicon, "kheecho", "hi")
    assert exact[0].concepts == ["PULL"]
    fuzzy = m(lexicon, "kheenchoo", "hi")
    assert fuzzy[0].concepts == ["PULL"] and fuzzy[0].fuzzy is True


def test_do_never_fuzzy(lexicon: Lexicon) -> None:
    assert m(lexicon, "do", "en") == []
    assert m(lexicon, "doo", "hi") == []  # 3 letters: too short for fuzzy
    assert concepts(lexicon, "do", "hi") == [["TWO"]]  # exact only


def test_devanagari_never_fuzzy(lexicon: Lexicon) -> None:
    # One letter away from खींचो (PULL) but Devanagari: no fuzzy match.
    assert m(lexicon, "खींचा", "hi") == []
    assert m(lexicon, "दबाओं", "hi") == []


def test_shared_words_never_match(lexicon: Lexicon) -> None:
    for text, lang in (("light", "en"), ("लाइट", "hi"), ("button", "en"), ("बटन", "hi")):
        assert m(lexicon, text, lang) == []  # type: ignore[arg-type]
    assert concepts(lexicon, "teen number button dabao", "hi") == [["THREE"], ["PRESS"]]


def test_baayen_fuzzy_left_not_right(lexicon: Lexicon) -> None:
    ms = m(lexicon, "baayen", "hi")
    assert len(ms) == 1
    assert ms[0].concepts == ["LEFT"]
    assert ms[0].fuzzy is True


def test_fuzzy_tie_means_no_match(lexicon: Lexicon) -> None:
    # "aayan" is equally close to baayan (LEFT) and daayan (RIGHT): a tie is no match.
    assert m(lexicon, "aayan", "hi") == []


def test_devanagari_variant_keeps_roman(lexicon: Lexicon) -> None:
    ms = m(lexicon, "हरी लाइट", "hi")
    assert ms[0].concepts == ["GREEN"] and ms[0].roman == "hari"


def test_listener_side_crossover_and_hinglish(lexicon: Lexicon) -> None:
    toks = tokenize("Aag wala engine left hai? Toh left लेफ्ट laal handle kheencho!")
    speaker = lexicon.match(toks, "hi")
    listener = lexicon.match_listener_side(toks, "en", taken_indices(speaker))
    assert [x.concepts for x in speaker] == [["FIRE"], ["RED"], ["PULL"]]
    assert [x.concepts for x in listener] == [["LEFT"], ["LEFT"], ["LEFT"]]
    assert all(x.side == "listener" for x in listener)
    assert listener[2].roman == "left"  # Devanagari loan spelling displays in English


def test_english_speaker_says_hindi_word(lexicon: Lexicon) -> None:
    toks = tokenize("Laal!")
    assert lexicon.match(toks, "en") == []
    listener = lexicon.match_listener_side(toks, "hi", set())
    assert [x.concepts for x in listener] == [["RED"]]


def test_listener_side_never_fuzzy(lexicon: Lexicon) -> None:
    toks = tokenize("laaal")
    assert lexicon.match_listener_side(toks, "hi", set()) == []


def test_dont_matches_no(lexicon: Lexicon) -> None:
    assert concepts(lexicon, "don't touch four", "en") == [["NO"], ["FOUR"]]
