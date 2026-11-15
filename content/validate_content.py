"""Content validator (§B6.2).

Run as `python content/validate_content.py`. It imports the server's real content models and
matcher (`app.content`, `app.language.lexicon`), so it tests the same matcher the game runs.
Exit code 0 = PASS, 1 = failures.
"""

from __future__ import annotations

import itertools
import sys
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

_HERE = Path(__file__).resolve().parent
for _candidate in (_HERE.parent / "server", _HERE.parent):
    if (_candidate / "app" / "__init__.py").exists():
        if str(_candidate) not in sys.path:
            sys.path.insert(0, str(_candidate))
        break

from app.content import (
    Action,
    Branch,
    Content,
    Effect,
    Line,
    Option,
    Step,
    TemplateError,
    expand,
    has_template,
    load_content,
    parse_effect,
)
from app.language.lexicon import Lexicon
from app.language.normalize import norm_token
from app.protocol import ConceptId, Lang
from app.speech.translate import build_line_index
from app.world import apply_world, lamp_value, lobby_world, parse_world_value

PREFIX = {"overhead": "OH_", "pedestal": "PD_", "front": "FP_"}
KIND_FOR_TYPE = {
    "PushButton": "button",
    "ToggleSwitch": "toggle",
    "PullHandle": "handle",
    "UpDownLever": "lever",
    "NotchLever": "notch",
    "Lamp": "lamp",
    "FuelGauge": "gauge",
    "Screen": "screen",
}
VERBS_FOR_TYPE: dict[str, set[str]] = {
    "PushButton": {"press"},
    "ToggleSwitch": {"toggle"},
    "PullHandle": {"pull"},
    "UpDownLever": {"move_down", "move_up"},
    "NotchLever": {"move_down", "move_up"},
    "Lamp": set(),
    "FuelGauge": set(),
    "Screen": set(),
}
COLOR_CONCEPT: dict[str, ConceptId] = {
    "red": "RED",
    "green": "GREEN",
    "blue": "BLUE",
    "yellow": "YELLOW",
}
DIGIT_CONCEPT: dict[str, ConceptId] = {
    "1": "ONE",
    "2": "TWO",
    "3": "THREE",
    "4": "FOUR",
}
COUNT_CONCEPT: dict[int, ConceptId] = {1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR"}
ARROW_CONCEPT: dict[str, ConceptId] = {"←": "LEFT", "→": "RIGHT"}
FORMS: tuple[tuple[str, Lang], ...] = (("hi", "hi"), ("hi_roman", "hi"), ("en", "en"))
SIDE_VALUES = ("LEFT", "RIGHT")


@dataclass
class Report:
    """Validator output: coverage tables and failures."""

    tables: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures

    def fail(self, msg: str) -> None:
        self.failures.append(msg)

    def text(self) -> str:
        out = [*self.tables]
        if self.ok:
            out.append("PASS")
        else:
            out.append(f"FAIL ({len(self.failures)} problems)")
            out.extend(f"  - {f}" for f in self.failures)
        return "\n".join(out)


# ------------------------------------------------------------------------------- lexicon


def check_lexicon(content: Content, r: Report) -> None:
    lex = content.lexicon
    ids = [c.id for c in lex.concepts]
    if len(ids) != 20:
        r.fail(f"lexicon: expected 20 concepts, found {len(ids)}")
    if len(set(ids)) != len(ids):
        r.fail("lexicon: duplicate concept ids")
    intro = Counter(c.introduced_in for c in lex.concepts)
    if set(intro) - {1, 2}:
        r.fail(f"lexicon: introduced_in must be 1 or 2, got {sorted(intro)}")
    if intro[1] != 15 or intro[2] != 5:
        r.fail(
            f"lexicon: need 15 phase-1 and 5 phase-2 concepts, got {intro[1]}/{intro[2]}"
        )
    for c in lex.concepts:
        romans = set(c.hi.roman_variants)
        for v in c.hi.variants:
            if not v.deva.strip() or not v.roman.strip():
                r.fail(f"lexicon {c.id}: Hindi variant with empty deva/roman")
            if v.roman not in romans:
                r.fail(
                    f"lexicon {c.id}: variant roman {v.roman!r} missing from roman_variants"
                )

    def unique(name: str, pairs: Sequence[tuple[str, str]]) -> None:
        seen: dict[str, str] = {}
        for raw, cid in pairs:
            key = " ".join(norm_token(p) for p in raw.split())
            if key in seen and seen[key] != cid:
                r.fail(f"lexicon: {name} {raw!r} maps to {seen[key]} and {cid}")
            seen.setdefault(key, cid)

    en_var = [(v, c.id) for c in lex.concepts for v in c.en.variants]
    hi_deva = [(v.deva, c.id) for c in lex.concepts for v in c.hi.variants]
    hi_roman = [(v, c.id) for c in lex.concepts for v in c.hi.roman_variants]
    en_cross = [(v, c.id) for c in lex.concepts for v in c.en.crossover]
    hi_cross = [(v, c.id) for c in lex.concepts for v in c.hi.crossover]
    unique("en variant", en_var)
    unique("hi deva variant", hi_deva)
    unique("hi roman variant", hi_roman)
    # Crossover spellings are checked against the side they appear on.
    unique("en crossover (Devanagari)", hi_deva + en_cross)
    unique("hi crossover (Latin)", en_var + hi_cross)
    unique("listener-en words", en_var + en_cross)
    unique("listener-hi words", hi_roman + hi_cross)
    shared = {norm_token(sw.en) for sw in lex.shared_words}
    shared |= {norm_token(d) for sw in lex.shared_words for d in sw.deva}
    for raw, cid in en_var + hi_deva + hi_roman + en_cross + hi_cross:
        if norm_token(raw) in shared:
            r.fail(f"lexicon: shared word {raw!r} is also a variant of {cid}")


# ------------------------------------------------------------------------------ stations


def check_stations(content: Content, r: Report) -> None:
    seen: set[str] = set()
    for st in content.stations.stations:
        occupied: dict[tuple[int, int], str] = {}
        ids = {c.id for c in st.controls}
        for c in st.controls:
            if c.id in seen:
                r.fail(f"stations: duplicate id {c.id}")
            seen.add(c.id)
            if not c.id.startswith(PREFIX[st.id]):
                r.fail(f"stations: {c.id} should start with {PREFIX[st.id]} on {st.id}")
            if c.default.kind != KIND_FOR_TYPE[c.type]:
                r.fail(
                    f"stations: {c.id} default kind {c.default.kind} ≠ type {c.type}"
                )
            if c.color not in content.stations.palette:
                r.fail(f"stations: {c.id} color {c.color!r} not in palette")
            for row in range(c.row, c.row + c.rowspan):
                for col in range(c.col, c.col + c.span):
                    if not (0 <= row < st.grid.rows and 0 <= col < st.grid.cols):
                        r.fail(
                            f"stations: {c.id} cell ({row},{col}) outside the {st.id} grid"
                        )
                    if (row, col) in occupied:
                        r.fail(
                            f"stations: {c.id} overlaps {occupied[(row, col)]} at ({row},{col})"
                        )
                    occupied[(row, col)] = c.id
        for p in st.parts:
            for m in p.members:
                if m not in ids:
                    r.fail(f"stations: part {p.id} member {m} not on {st.id}")


# ------------------------------------------------------------------------------- actions


def _var_values(content: Content, phase: int, a: Action) -> list[str] | None:
    var = a.var
    if var is None:
        return None
    if a.observe is not None and a.observe.options is not None:
        return [o.value for o in a.observe.options]
    pv = next((v for v in content.phases[phase].phase_vars if v.var == var), None)
    return None if pv is None else [o.value for o in pv.options]


def _var_options(content: Content, phase: int, a: Action) -> list[Option]:
    if a.observe is not None and a.observe.options is not None:
        return a.observe.options
    pv = next((v for v in content.phases[phase].phase_vars if v.var == a.var), None)
    return [] if pv is None else pv.options


def _side_variants(s: str) -> list[str]:
    """Expand side templates for every side value (validation needs both)."""
    if not has_template(s):
        return [s]
    out = []
    for side in SIDE_VALUES:
        try:
            out.append(expand(s, {"FIRE_SIDE": side, "DAMAGED_SIDE": side}))
        except TemplateError as e:
            raise ValueError(str(e)) from e
    return out


def _check_line(where: str, line: Line, r: Report) -> None:
    for form in ("hi", "hi_roman", "en"):
        if not getattr(line, form).strip():
            r.fail(f"{where}: empty {form}")


def _check_effect(content: Content, where: str, raw: str, r: Report) -> Effect | None:
    try:
        eff = parse_effect(raw)
        for expanded in _side_variants(raw):
            e = parse_effect(expanded)
            if e.kind == "world":
                apply_world(lobby_world(), e.name, parse_world_value(e.value or ""))
            elif e.kind == "lamp":
                lamp_value(e.value or "")
                obj = content.objects_by_id.get(e.name)
                if obj is None or obj.control.type != "Lamp":
                    raise ValueError(f"{e.name} is not a Lamp")
            elif e.kind == "fx" and e.name.startswith("lamp_flicker:"):
                obj = content.objects_by_id.get(e.value or "")
                if obj is None or obj.control.type != "Lamp":
                    raise ValueError(f"{e.value} is not a Lamp")
            elif e.kind in ("cin", "event"):
                cin = content.cinematics.cinematics.get(e.name)
                want = "in_phase" if e.kind == "cin" else "event"
                if cin is None or cin.kind != want:
                    raise ValueError(
                        f"{e.kind}:{e.name} must be an existing {want} cinematic"
                    )
            elif e.kind in ("roll", "show") and e.name not in content.phase_var_by_name:
                raise ValueError(f"{e.name} is not a phase variable")
        return eff
    except (ValueError, TemplateError) as exc:
        r.fail(f"{where}: effect {raw!r}: {exc}")
        return None


def _check_step(
    content: Content, where: str, station: str, step: Step, r: Report
) -> None:
    for obj_id in _side_variants(step.object):
        placed = content.objects_by_id.get(obj_id)
        if placed is None or placed.station != station:
            r.fail(f"{where}: expect object {obj_id} is not on the {station} station")
            continue
        t = placed.control.type
        if step.verb not in VERBS_FOR_TYPE[t]:
            r.fail(f"{where}: verb {step.verb} does not suit {obj_id} ({t})")
        if step.count < 1:
            r.fail(f"{where}: count must be ≥ 1")
        if step.verb == "toggle" and step.value is None:
            r.fail(f"{where}: toggle step on {obj_id} needs a value")
        if step.verb != "toggle" and step.value is not None:
            r.fail(f"{where}: value only allowed on toggle steps")
        if step.count > 1 and not (
            step.verb == "press" or (t == "NotchLever" and step.verb == "move_down")
        ):
            r.fail(f"{where}: count > 1 only on press or NotchLever move_down")


def check_actions(content: Content, r: Report) -> None:
    all_ids: set[str] = set()
    for n, ph in content.phases.items():
        station = ph.station
        st = content.station_by_id[station]
        if not 5 <= len(ph.actions) <= 8:
            r.fail(f"phase {n}: needs 5–8 actions, has {len(ph.actions)}")
        rolled: set[str] = {v.var for v in ph.phase_vars if v.roll_at == "phase_start"}
        for a in ph.actions:
            w = a.id
            if a.id in all_ids:
                r.fail(f"{w}: duplicate action id")
            all_ids.add(a.id)
            if not a.id.startswith(f"P{n}_"):
                r.fail(f"{w}: id must start with P{n}_")
            shape_observe = (
                a.observe is not None
                and a.ask is not None
                and a.branches is not None
                and a.branch_on is None
                and a.say is None
                and a.expect is None
            )
            shape_branch_on = (
                a.branch_on is not None
                and a.branches is not None
                and a.observe is None
                and a.ask is None
                and a.say is None
                and a.expect is None
            )
            shape_say = (
                a.say is not None
                and a.expect is not None
                and a.observe is None
                and a.ask is None
                and a.branches is None
                and a.branch_on is None
            )
            if [shape_observe, shape_branch_on, shape_say].count(True) != 1:
                r.fail(
                    f"{w}: must be exactly one of observe+ask+branches, "
                    "branch_on+branches, say+expect"
                )
            for line_name in ("ask", "say"):
                line = getattr(a, line_name)
                if line is not None:
                    _check_line(f"{w}.{line_name}", line, r)
            for b in a.branches or []:
                _check_line(f"{w}.branch[{b.when}].say", b.say, r)
                for s in b.expect:
                    _check_step(content, f"{w}.branch[{b.when}]", station, s, r)
            for s in a.expect or []:
                _check_step(content, w, station, s, r)
            ex = a.flyer_examples
            if not (len(ex.en) == len(ex.hi) == len(ex.hi_roman) >= 1):
                r.fail(f"{w}: flyer_examples lists must have equal length ≥ 1")
            whens = {b.when for b in a.branches or []}
            if a.observe is not None:
                ob = a.observe
                if (station, ob.part) not in content.parts_by_id:
                    r.fail(f"{w}: observe part {ob.part} not on {station}")
                if ob.property not in content.manual_terms.properties:
                    r.fail(f"{w}: property {ob.property} not in manual_terms")
                if ob.options is None and ob.var not in content.phase_var_by_name:
                    r.fail(
                        f"{w}: observe var {ob.var} has no options and is no phase variable"
                    )
                values = _var_values(content, n, a) or []
                if set(values) != whens or len(values) != len(whens):
                    r.fail(
                        f"{w}: option values {sorted(values)} ≠ branch whens {sorted(whens)}"
                    )
                for o in _var_options(content, n, a):
                    if o.weight <= 0:
                        r.fail(f"{w}: option {o.value} weight must be > 0")
                    lamp_ids = list(o.lamps)
                    if o.has_lamp:
                        if ob.object is None:
                            r.fail(
                                f"{w}: option {o.value} uses `lamp` without observe.object"
                            )
                        else:
                            lamp_ids.append(ob.object)
                    for lid in lamp_ids:
                        for oid in _side_variants(lid):
                            obj = content.objects_by_id.get(oid)
                            if obj is None or obj.control.type != "Lamp":
                                r.fail(
                                    f"{w}: option {o.value} lamp {oid} is not a Lamp"
                                )
                for oid in [*(ob.attention or []), *([ob.object] if ob.object else [])]:
                    for x in _side_variants(oid):
                        if x not in {c.id for c in st.controls}:
                            r.fail(f"{w}: observe object {x} not on {station}")
                rolled.add(ob.var)
            if a.branch_on is not None:
                if (
                    a.branch_on not in rolled
                    or a.branch_on not in content.phase_var_by_name
                ):
                    r.fail(
                        f"{w}: branch_on {a.branch_on} is not an earlier-rolled phase variable"
                    )
                values = _var_values(content, n, a) or []
                if set(values) != whens:
                    r.fail(
                        f"{w}: branch_on values {sorted(values)} ≠ whens {sorted(whens)}"
                    )
            for eff_list, label in (
                (a.on_start, "on_start"),
                (a.on_success, "on_success"),
            ):
                for raw in eff_list:
                    eff = _check_effect(content, f"{w}.{label}", raw, r)
                    if eff is not None and eff.kind == "roll":
                        rolled.add(eff.name)


# --------------------------------------------------------------------------------- paths


def _phase_vars_in_order(content: Content, n: int) -> list[tuple[str, list[str]]]:
    out: list[tuple[str, list[str]]] = []
    for a in content.phases[n].actions:
        var = a.var
        if var is None or any(v == var for v, _ in out):
            continue
        out.append((var, _var_values(content, n, a) or []))
    return out


def _branch_for(a: Action, path: dict[str, str]) -> Branch | None:
    if a.branches is None or a.var is None:
        return None
    return next((b for b in a.branches if b.when == path[a.var]), None)


def _action_lines(a: Action, path: dict[str, str]) -> list[Line]:
    lines: list[Line] = [line for line in (a.ask, a.say) if line is not None]
    b = _branch_for(a, path)
    if b is not None:
        lines.append(b.say)
    return lines


def _all_counts(a: Action) -> set[int]:
    steps = list(a.expect or []) + [s for b in a.branches or [] for s in b.expect]
    return {s.count for s in steps}


def required_concepts(
    content: Content, a: Action, path: dict[str, str]
) -> set[ConceptId]:
    """Concepts an action's lines must contain on a path (§B6.2 rule 5; WHICH exempt)."""
    need: set[ConceptId] = set()
    if a.observe is not None:
        value = path[a.observe.var]
        concept = content.concepts_by_id.get(value)
        if concept is not None:
            need.add(concept.id)
    b = _branch_for(a, path)
    steps = b.expect if b is not None else list(a.expect or [])
    counts = _all_counts(a)
    fire_side = path.get("FIRE_SIDE", "LEFT")
    for s in steps:
        obj_id = expand(s.object, {"FIRE_SIDE": fire_side, "DAMAGED_SIDE": fire_side})
        c = content.objects_by_id[obj_id].control
        if c.color in COLOR_CONCEPT:
            need.add(COLOR_CONCEPT[c.color])
        if c.label in DIGIT_CONCEPT:
            need.add(DIGIT_CONCEPT[c.label])
        if c.label in ARROW_CONCEPT:
            need.add(ARROW_CONCEPT[c.label])
        if s.verb == "press":
            need.add("PRESS")
        elif s.verb == "pull":
            need.add("PULL")
        elif s.verb == "toggle":
            need.add("ON" if s.value == "on" else "OFF")
        elif s.verb == "move_down":
            need.add("DOWN")
        if s.count > 1 or counts - {s.count}:
            need.add(COUNT_CONCEPT[s.count])
            need.add("TIMES")
    need.discard("WHICH")
    return need


def _short(v: str) -> str:
    return v if v in ("YES", "NO") else v[0]


def check_paths(content: Content, matcher: Lexicon, r: Report) -> None:
    order = matcher.order
    p1 = [c.id for c in content.lexicon.concepts if c.introduced_in == 1]
    p2 = [c.id for c in content.lexicon.concepts if c.introduced_in == 2]
    for n, ph in content.phases.items():
        dims = _phase_vars_in_order(content, n)
        names = [d[0] for d in dims]
        paths = [
            dict(zip(names, combo, strict=True))
            for combo in itertools.product(*(d[1] for d in dims))
        ]
        labels = ["/".join(_short(p[k]) for k in names) or "-" for p in paths]
        # cells[concept][path] = min over the three forms
        cells: dict[str, list[int]] = {c: [] for c in order}
        for pi, path in enumerate(paths):
            per_form: dict[str, Counter[str]] = {}
            for form, lang in FORMS:
                counts: Counter[str] = Counter()
                for a in ph.actions:
                    lines = _action_lines(a, path)
                    found: Counter[str] = Counter()
                    for line in lines:
                        found.update(matcher.concepts_in(getattr(line, form), lang))
                    counts.update(found)
                    for need in sorted(required_concepts(content, a, path)):
                        if found[need] < 1:
                            r.fail(
                                f"{a.id} path {labels[pi]} form {form}: required {need} missing"
                            )
                per_form[form] = counts
            for c in order:
                cells[c].append(min(per_form[f][c] for f, _ in FORMS))
            for form, _ in FORMS:
                counts = per_form[form]
                if n == 1:
                    for c in p2:
                        if counts[c]:
                            r.fail(
                                f"phase 1 path {labels[pi]} form {form}: phase-2 concept {c}"
                            )
                    for c in p1:
                        if counts[c] < 2:
                            r.fail(
                                f"phase 1 path {labels[pi]} form {form}: {c} ×{counts[c]} < 2"
                            )
                elif n == 2:
                    for c in p2:
                        if counts[c] < 2:
                            r.fail(
                                f"phase 2 path {labels[pi]} form {form}: {c} ×{counts[c]} < 2"
                            )
                else:
                    for c in order:
                        if counts[c] < 1:
                            r.fail(
                                f"phase 3 path {labels[pi]} form {form}: {c} missing"
                            )
        r.tables.append(_table(n, ph.name.en, labels, cells, p1, p2))


def _need(
    n: int, concept: str, p1: Sequence[str], p2: Sequence[str]
) -> tuple[str, int | None, bool]:
    """(label, threshold, is_max) for the table's need column."""
    if n == 1:
        return ("2", 2, False) if concept in p1 else ("=0", 0, True)
    if n == 2:
        return ("2", 2, False) if concept in p2 else ("-", None, False)
    return ("1", 1, False)


def _table(
    n: int,
    name: str,
    labels: list[str],
    cells: dict[str, list[int]],
    p1: Sequence[str],
    p2: Sequence[str],
) -> str:
    width = max(8, *(len(lbl) + 1 for lbl in labels))
    head = f"Phase {n} — {name} ({len(labels)} paths × 3 forms)"
    rows = [
        head,
        "concept  " + "".join(lbl.rjust(width) for lbl in labels) + "   min  need",
    ]
    for c, vals in cells.items():
        label, threshold, is_max = _need(n, c, p1, p2)
        cell_txt = []
        for v in vals:
            bad = threshold is not None and (
                (v > threshold) if is_max else (v < threshold)
            )
            cell_txt.append((f"{v}✗" if bad else str(v)).rjust(width))
        lo = min(vals) if vals else 0
        hi = max(vals) if vals else 0
        if threshold is None:
            mark = " "
        elif is_max:
            mark = "✓" if hi <= threshold else "✗"
        else:
            mark = "✓" if lo >= threshold else "✗"
        rows.append(f"{c:<9}" + "".join(cell_txt) + f"{lo:>6}{label:>6}  {mark}")
    return "\n".join(rows) + "\n"


# --------------------------------------------------------------------- cinematics + demo


def check_cinematics_and_demo(content: Content, r: Report) -> None:
    from typing import get_args

    from app.protocol import CinematicId

    want = set(get_args(CinematicId))
    have = set(content.cinematics.cinematics)
    if want != have:
        r.fail(f"cinematics: ids differ from the contract: {sorted(want ^ have)}")
    demo = content.demo
    for k, ids in demo.route.items():
        n = int(k)
        if n not in content.phases:
            r.fail(f"demo: route phase {k} does not exist")
            continue
        for aid in ids:
            if content.action_phase.get(aid) != n:
                r.fail(f"demo: route action {aid} is not in phase {n}")
    for var in demo.force:
        known = set(content.phase_var_by_name) | {
            a.observe.var
            for a in content.actions_by_id.values()
            if a.observe is not None
        }
        if var not in known:
            r.fail(f"demo: force var {var} is unknown")
    for oid, state in demo.phase3_preset.objects.items():
        placed = content.objects_by_id.get(oid)
        if placed is None or placed.station != "front":
            r.fail(f"demo: preset object {oid} is not on the front station")
        elif KIND_FOR_TYPE[placed.control.type] != state.kind:
            r.fail(f"demo: preset {oid} kind {state.kind} ≠ {placed.control.type}")


# ------------------------------------------------------------------------------ entry


def validate(content: Content, matcher: Lexicon) -> Report:
    """Run every §B6.2 check; returns tables and failures."""
    r = Report()
    check_lexicon(content, r)
    check_stations(content, r)
    check_actions(content, r)
    check_cinematics_and_demo(content, r)
    if r.ok:
        check_paths(content, matcher, r)
    _, conflicts = build_line_index(content)
    for c in conflicts:
        r.fail(f"mock translation index conflict: {c}")
    return r


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    content_dir = Path(args[0]) if args else _HERE
    content = load_content(content_dir)
    report = validate(content, Lexicon(content.lexicon))
    print(report.text())
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
