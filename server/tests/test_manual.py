"""§B12 manual card builder."""

from __future__ import annotations

from typing import Any

from app.actions import ActionRun
from app.content import Content
from app.language.lexicon import Lexicon
from app.manual import build_card, rule_label, text_segments
from app.protocol import Lang
from tests.conftest import MakeRoom


def label(content: Content, action_id: str, branch: int | None, lang: Lang) -> str:
    a = content.actions_by_id[action_id]
    steps = a.branches[branch].expect if branch is not None and a.branches else a.expect or []
    return rule_label(content, a, steps, lang, {"FIRE_SIDE": "LEFT"})


def text(segs: list[Any]) -> str:
    return "".join(s.text if hasattr(s, "text") else s["text"] for s in segs)


def test_rule_labels_hindi(content: Content) -> None:
    assert label(content, "P1_A6", 0, "hi") == "हरा बटन तीन बार दबाओ"
    assert label(content, "P1_A2", None, "hi") == "दो नंबर स्विच चालू करो"
    assert label(content, "P2_B1", 0, "hi") == "बायाँ लाल लीवर खींचो"


def test_rule_labels_english(content: Content) -> None:
    assert label(content, "P1_A6", 0, "en") == "press green button three times"
    assert label(content, "P1_A2", None, "en") == "turn on switch two"
    assert label(content, "P2_B1", 0, "en") == "pull left red lever"


def test_count_shown_when_siblings_differ(content: Content) -> None:
    assert label(content, "P2_B3", 1, "hi") == "लाल बटन एक बार दबाओ"
    assert label(content, "P2_B3", 0, "hi") == "लाल बटन दो बार दबाओ"
    assert label(content, "P1_A1", 0, "hi") == "एक नंबर बटन दबाओ"  # siblings same count


def test_multi_step_joiners(content: Content) -> None:
    assert label(content, "P1_A7", None, "hi") == "चार नंबर स्विच बंद करो, फिर एक नंबर लीवर खींचो"
    assert label(content, "P1_A7", None, "en") == "turn off switch four, then pull lever one"
    assert (
        label(content, "P3_C3", None, "hi") == "बायाँ लीवर दो बार नीचे करो + दायाँ लीवर एक बार नीचे करो"
    )


def test_keywords_highlighted_without_glosses(lexicon: Lexicon) -> None:
    segs = text_segments("हरा बटन तीन बार दबाओ", "hi", lexicon)
    kws = [s for s in segs if s.kind == "keyword"]
    assert [s.concept for s in kws] == ["GREEN", "THREE", "TIMES", "PRESS"]
    assert all(s.gloss is None and "gloss" not in s.model_fields_set for s in kws)
    assert text(segs) == "हरा बटन तीन बार दबाओ"
    plain = [s for s in segs if s.kind == "plain"]
    assert any("बटन" in s.text for s in plain)  # shared words stay plain


def _run(content: Content, action_id: str) -> ActionRun:
    a = content.actions_by_id[action_id]
    steps = a.branches[0].expect if a.branches else list(a.expect or [])
    return ActionRun(
        action=a, index=0, value=None, branch_index=0, steps=list(steps), unordered=a.unordered
    )


def test_card_shapes(content: Content, lexicon: Lexicon) -> None:
    route = content.full_route()[2]
    card = build_card(
        content,
        lexicon,
        _run(content, "P2_B2"),
        phase=2,
        route=route,
        lang="hi",
        variables={"FIRE_SIDE": "LEFT"},
        last_wrong=("PD_FUEL_SW_R", 1),
        quick_say=False,
    )
    assert card.find_out is None
    assert card.known_from is not None and card.known_from.index == 1
    assert card.known_from.text == "यह आपने कदम 1 में पता किया"
    assert text(card.rows[0].when.label) == "आग: बायाँ"  # type: ignore[union-attr]
    assert card.rows[0].when.swatch.kind == "side"  # type: ignore[union-attr]
    assert card.stamp == "emergency" and card.smudges is False
    assert card.own_words_note == "अपने शब्दों में बोलो"
    assert card.last_wrong is not None and text(card.last_wrong.label) == "दायाँ पीला स्विच"
    assert card.quick_say is None
    assert card.highlight.circled == ["PD_FUEL_SW_L", "PD_FUEL_SW_R"]
    assert card.rows[0].controls[0].target.model_dump() == {"kind": "toggle", "value": "off"}

    obs = build_card(
        content,
        lexicon,
        _run(content, "P1_A1"),
        phase=1,
        route=content.full_route()[1],
        lang="hi",
        variables={},
        last_wrong=None,
        quick_say=True,
    )
    assert obs.find_out is not None
    assert obs.find_out.property_label == "रंग?"
    assert [v.value for v in obs.find_out.values] == ["RED", "BLUE"]
    assert text(obs.find_out.values[0].label) == "लाल"
    assert obs.highlight.question == ["OH_MASTER_LAMP"]
    assert obs.own_words_note == "अपने शब्दों में पूछो"
    assert obs.progress[:2] == ["current", "upcoming"]
    assert obs.quick_say is not None and obs.quick_say.ask is not None
    assert obs.quick_say.ask.text == "Kaun si light jal rahi hai — laal ya neeli?"
    assert obs.quick_say.ask.alt_text == "कौन सी लाइट जल रही है — लाल या नीली?"
    assert [b.value for b in obs.quick_say.branches] == ["RED", "BLUE"]


async def test_quick_say_only_in_mock_or_dev(make_room: MakeRoom) -> None:
    t = await make_room(seed=1, mock=False, dev_mode=False, demo=False)
    t.until_active()
    card = t.last("tower", "manual_card")["card"]
    assert card["quick_say"] is None
    assert t.last("flyer", "flyer_view")["quick_replies"] is None
    t2 = await make_room(seed=1, mock=True, dev_mode=False)
    t2.until_active()
    assert t2.last("tower", "manual_card")["card"]["quick_say"] is not None
    assert t2.last("flyer", "flyer_view")["quick_replies"]


async def test_card_never_reveals_the_right_row(make_room: MakeRoom) -> None:
    cards = []
    for color in ("RED", "BLUE"):
        t = await make_room(seed=1, force={"MASTER_COLOR": color})
        t.until_active()
        assert t.room.game is not None and t.room.game.vars["MASTER_COLOR"] == color
        cards.append(t.last("tower", "manual_card")["card"])
    assert cards[0] == cards[1]  # identical whatever was rolled
    assert [r["when"]["value"] for r in cards[0]["rows"]] == ["RED", "BLUE"]
