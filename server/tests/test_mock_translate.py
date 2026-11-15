"""§B14.1 mock translator."""

from __future__ import annotations

from app.content import Content
from app.language.lexicon import Lexicon
from app.language.normalize import norm_line
from app.speech.translate import MockTranslator, authored_lines, build_line_index


def test_index_has_no_conflicts(content: Content) -> None:
    index, conflicts = build_line_index(content)
    assert conflicts == []
    assert len(index) > 150


def test_every_authored_line_translates_both_ways(content: Content, lexicon: Lexicon) -> None:
    tr = MockTranslator(content, lexicon)
    for hi, roman, en in authored_lines(content):
        assert norm_line(tr.translate_sync(hi, "hi", "en")) == norm_line(en)
        assert norm_line(tr.translate_sync(roman, "hi", "en")) == norm_line(en)
        assert norm_line(tr.translate_sync(en, "en", "hi")) == norm_line(hi)


def test_lookup_ignores_case_punctuation_and_spacing(content: Content, lexicon: Lexicon) -> None:
    tr = MockTranslator(content, lexicon)
    assert tr.translate_sync("ek NUMBER button dabao   teen nahi", "hi", "en") == (
        "Press button one — not three!"
    )


def test_keyword_substitution_fallback(content: Content, lexicon: Lexicon) -> None:
    tr = MockTranslator(content, lexicon)
    assert tr.translate_sync("Teen baar jaldi dabao!", "hi", "en") == "three times jaldi press!"
    assert tr.translate_sync("Pull the left one twice", "en", "hi") == ("खींचो the बायाँ एक दो बार")


async def test_async_interface(content: Content, lexicon: Lexicon) -> None:
    tr = MockTranslator(content, lexicon)
    assert await tr.translate("Neeli!", "hi", "en") == "Blue!"
    assert await tr.translate("same", "en", "en") == "same"
