"""Manual card builder, everything in the Tower's language (§B12, §B5.2)."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Literal

from app.actions import ActionRun, target_state
from app.content import Action, Content, Option, Step, expand
from app.language.lexicon import Lexicon
from app.language.normalize import gaps, tokenize
from app.protocol import (
    ControlDrawing,
    FindOut,
    FindOutValue,
    Highlight,
    KnownFrom,
    LampColor,
    Lang,
    LastWrong,
    ManualCard,
    QuickLine,
    QuickSay,
    QuickSayBranch,
    RuleRow,
    RuleWhen,
    Segment,
    Side,
    Swatch,
    SwatchColor,
    SwatchSide,
    SwatchYesNo,
)

_SPACES = re.compile(r"\s+")


def text_segments(text: str, lang: Lang, lexicon: Lexicon) -> list[Segment]:
    """Run the matcher over a manual label: keyword segments without glosses (§B12)."""
    toks = tokenize(text)
    gs = gaps(text, toks)
    starts = {m.start: m for m in lexicon.match(toks, lang)}
    out: list[Segment] = []
    buf = gs[0]
    i = 0
    while i < len(toks):
        m = starts.get(i)
        if m is not None:
            if buf:
                out.append(Segment(text=buf, kind="plain"))
                buf = ""
            word = toks[m.start].raw + "".join(
                gs[j + 1] + toks[j + 1].raw for j in range(m.start, m.end - 1)
            )
            if len(m.concepts) > 1:
                out.append(
                    Segment(text=word, kind="keyword", concept=m.concepts[0], concepts=m.concepts)
                )
            else:
                out.append(Segment(text=word, kind="keyword", concept=m.concepts[0]))
            i = m.end
        else:
            buf += toks[i].raw
            i += 1
        buf += gs[i]
    if buf:
        out.append(Segment(text=buf, kind="plain"))
    return out


_COLOR: dict[str, LampColor] = {"RED": "red", "GREEN": "green", "BLUE": "blue", "YELLOW": "yellow"}
_SIDE: dict[str, Side] = {"LEFT": "left", "RIGHT": "right"}
_YESNO: dict[str, Literal["yes", "no"]] = {"YES": "yes", "NO": "no"}
_PHASE: dict[int, Literal[1, 2, 3]] = {1: 1, 2: 2, 3: 3}
Order = Literal["single", "ordered", "unordered"]
Progress = Literal["done", "current", "upcoming"]


def swatch_for(value: str) -> Swatch:
    """Swatch for an observed value (§A8)."""
    if value in _COLOR:
        return SwatchColor(kind="color", color=_COLOR[value])
    if value in _SIDE:
        return SwatchSide(kind="side", side=_SIDE[value])
    if value in _YESNO:
        return SwatchYesNo(kind="yesno", value=_YESNO[value])
    raise ValueError(f"no swatch for {value!r}")


def value_display(content: Content, value: str, lang: Lang) -> str:
    """A concept value in the manual's language (Hindi: Devanagari)."""
    c = content.concepts_by_id.get(value)
    if c is None:
        return value
    return c.en.display if lang == "en" else c.hi.display_deva


def _verb_key(step: Step) -> str:
    if step.verb == "toggle":
        return "toggle_on" if step.value == "on" else "toggle_off"
    return step.verb


def _action_counts(action: Action) -> set[int]:
    steps = list(action.expect or []) + [s for b in action.branches or [] for s in b.expect]
    return {s.count for s in steps}


def rule_label(
    content: Content, action: Action, steps: Sequence[Step], lang: Lang, variables: dict[str, str]
) -> str:
    """Generated rule label for a list of steps (§B12)."""
    terms = content.manual_terms
    counts = _action_counts(action)
    parts: list[str] = []
    for s in steps:
        obj_id = expand(s.object, variables)
        obj = content.objects_by_id[obj_id].control.manual_name.get(lang)
        verb = terms.verbs[_verb_key(s)].get(lang)
        count = ""
        if s.count > 1 or counts - {s.count}:
            word = terms.count_words.get(lang).get(str(s.count), str(s.count))
            count = terms.times_template.get(lang).format(n=word)
        label = terms.rule_template.get(lang).format(object=obj, count=count, verb=verb)
        parts.append(_SPACES.sub(" ", label).strip())
    joiner = " + " if action.unordered else (", फिर " if lang == "hi" else ", then ")
    return joiner.join(parts)


def object_label(content: Content, lexicon: Lexicon, object_id: str, lang: Lang) -> list[Segment]:
    """A control's manual name as segments (`used.label`, `last_wrong.label`)."""
    name = content.objects_by_id[object_id].control.manual_name.get(lang)
    return text_segments(name, lang, lexicon)


def _controls(
    content: Content, steps: Sequence[Step], variables: dict[str, str]
) -> list[ControlDrawing]:
    out = []
    for s in steps:
        obj_id = expand(s.object, variables)
        c = content.objects_by_id[obj_id].control
        out.append(
            ControlDrawing(
                object_id=obj_id,
                type=c.type,
                label=c.label,
                color=c.color,
                target=target_state(s, c.type),
                count=s.count,
            )
        )
    return out


def _order(action: Action, steps: Sequence[Step]) -> Order:
    if len(steps) == 1:
        return "single"
    return "unordered" if action.unordered else "ordered"


def var_options(content: Content, action: Action) -> list[Option]:
    """Options of the action's variable (observe options or the phase variable's)."""
    if action.observe is not None and action.observe.options is not None:
        return action.observe.options
    var = action.var
    pv = content.phase_var_by_name.get(var) if var else None
    return pv.options if pv else []


def quick_line(line_hi: str, line_roman: str, line_en: str, lang: Lang) -> QuickLine:
    """A Mock/Dev quick line in the speaker's language (text = roman/en, alt = Devanagari)."""
    if lang == "hi":
        return QuickLine(label=line_roman, text=line_roman, alt_text=line_hi)
    return QuickLine(label=line_en, text=line_en)


def build_card(
    content: Content,
    lexicon: Lexicon,
    run: ActionRun,
    *,
    phase: int,
    route: list[str],
    lang: Lang,
    variables: dict[str, str],
    last_wrong: tuple[str, int] | None,
    quick_say: bool,
) -> ManualCard:
    """The Tower's manual page for the current action (§B12). Never says which row is right."""
    action = run.action
    ph = content.phases[phase]
    station = content.station_by_id[ph.station]
    terms = content.manual_terms

    def seg(text: str) -> list[Segment]:
        return text_segments(text, lang, lexicon)

    find_out: FindOut | None = None
    question: list[str] = []
    if action.observe is not None:
        ob = action.observe
        part = content.parts_by_id[(station.id, ob.part)]
        question = list(part.members)
        find_out = FindOut(
            station_label=station.name.get(lang),
            part_label=seg(part.name.get(lang)),
            property_label=terms.properties[ob.property].get(lang),
            values=[
                FindOutValue(
                    value=o.value,
                    label=seg(value_display(content, o.value, lang)),
                    swatch=swatch_for(o.value),
                )
                for o in var_options(content, action)
            ],
        )

    known_from: KnownFrom | None = None
    if action.branch_on is not None:
        observer = next(
            (
                i
                for i, aid in enumerate(route)
                if (a := content.actions_by_id[aid]).observe is not None
                and a.observe.var == action.branch_on
            ),
            None,
        )
        if observer is not None:
            known_from = KnownFrom(
                index=observer + 1, text=terms.known_from.get(lang).format(n=observer + 1)
            )

    rows: list[RuleRow] = []
    circled: list[str] = []
    prefix_terms = terms.value_prefix_branch_on.get(action.branch_on or "")
    if action.branches is not None:
        for b in action.branches:
            label = value_display(content, b.when, lang)
            if action.branch_on is not None and prefix_terms is not None:
                label = f"{prefix_terms.get(lang)} {label}"
            controls = _controls(content, b.expect, variables)
            circled += [c.object_id for c in controls]
            rows.append(
                RuleRow(
                    when=RuleWhen(value=b.when, label=seg(label), swatch=swatch_for(b.when)),
                    do=seg(rule_label(content, action, b.expect, lang, variables)),
                    controls=controls,
                    order=_order(action, b.expect),
                )
            )
    else:
        steps = action.expect or []
        controls = _controls(content, steps, variables)
        circled += [c.object_id for c in controls]
        rows.append(
            RuleRow(
                when=None,
                do=seg(rule_label(content, action, steps, lang, variables)),
                controls=controls,
                order=_order(action, steps),
            )
        )

    lw: LastWrong | None = None
    if last_wrong is not None:
        obj_id, count = last_wrong
        lw = LastWrong(label=object_label(content, lexicon, obj_id, lang), count=count)

    qs: QuickSay | None = None
    if quick_say:
        qs = QuickSay(
            ask=quick_line(action.ask.hi, action.ask.hi_roman, action.ask.en, lang)
            if action.ask
            else None,
            say=quick_line(action.say.hi, action.say.hi_roman, action.say.en, lang)
            if action.say
            else None,
            branches=[
                QuickSayBranch(
                    value=b.when, line=quick_line(b.say.hi, b.say.hi_roman, b.say.en, lang)
                )
                for b in action.branches or []
            ],
        )

    progress: list[Progress] = [
        "done" if i < run.index else "current" if i == run.index else "upcoming"
        for i in range(len(route))
    ]
    return ManualCard(
        action_id=action.id,
        index=run.index,
        total=len(route),
        phase=_PHASE[phase],
        station=station.id,
        lang=lang,
        phase_name=ph.name.get(lang),
        title=action.title.get(lang),
        find_out=find_out,
        known_from=known_from,
        rows=rows,
        hint=action.hint.get(lang),
        sticky=action.sticky.get(lang),
        own_words_note=(terms.own_words if action.observe else terms.own_words_say).get(lang),
        progress=progress,
        last_wrong=lw,
        stamp="emergency" if phase == 2 else None,
        smudges=phase == 3,
        highlight=Highlight(circled=list(dict.fromkeys(circled)), question=question),
        quick_say=qs,
    )
