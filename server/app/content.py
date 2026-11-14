"""Content loading into typed models, indexes and template expansion (§B6.1, §B5.3)."""

from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.protocol import (
    ConceptId,
    LampColor,
    Lang,
    ObjectState,
    PartType,
    StationId,
    Verb,
)


class _C(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Bilingual(_C):
    en: str
    hi: str

    def get(self, lang: Lang) -> str:
        """The text in one language."""
        return self.en if lang == "en" else self.hi


# ------------------------------------------------------------------------- lexicon (§B4)


class EnForms(_C):
    display: str
    variants: list[str]
    crossover: list[str]


class HiVariant(_C):
    deva: str
    roman: str


class HiForms(_C):
    display_roman: str
    display_deva: str
    variants: list[HiVariant]
    roman_variants: list[str]
    crossover: list[str]


class Concept(_C):
    id: ConceptId
    introduced_in: int
    en: EnForms
    hi: HiForms


class SpecialEntry(_C):
    variant: str
    concepts: list[ConceptId]


class SharedWord(_C):
    en: str
    deva: list[str]


class Lexicon(_C):
    version: int
    concepts: list[Concept]
    special: dict[str, SpecialEntry]
    on_off_guard_next: list[str]
    shared_words: list[SharedWord]
    romanize_overrides: dict[str, str]


# ------------------------------------------------------------------------ stations (§B5.1)


class Grid(_C):
    cols: int
    rows: int


class Control(_C):
    id: str
    type: PartType
    size: Literal["big"] | None = None
    style: str | None = None
    label: str | None
    color: str
    row: int
    col: int
    span: int = 1
    rowspan: int = 1
    default: ObjectState
    manual_name: Bilingual


class Part(_C):
    id: str
    members: list[str]
    name: Bilingual


class Station(_C):
    id: StationId
    phase: int
    name: Bilingual
    grid: Grid
    controls: list[Control]
    parts: list[Part]


class Stations(_C):
    version: int
    palette: dict[str, str]
    stations: list[Station]


# -------------------------------------------------------------------- manual terms (§B5.2)


class CountWords(_C):
    hi: dict[str, str]
    en: dict[str, str]

    def get(self, lang: Lang) -> dict[str, str]:
        """Count words for one language."""
        return self.en if lang == "en" else self.hi


class ManualTerms(_C):
    verbs: dict[str, Bilingual]
    count_words: CountWords
    times_template: Bilingual
    rule_template: Bilingual
    properties: dict[str, Bilingual]
    value_prefix_branch_on: dict[str, Bilingual]
    known_from: Bilingual
    own_words: Bilingual
    own_words_say: Bilingual


# ---------------------------------------------------------------------- cinematics (§A10)

CinematicKind = Literal["state", "in_phase", "event"]


class CinematicDef(_C):
    kind: CinematicKind
    duration_ms: int
    demo_duration_ms: int | None = None
    retry_duration_ms: int | None = None
    skippable: bool


class Cinematics(_C):
    lead_ms: int
    cinematics: dict[str, CinematicDef]


# ---------------------------------------------------------------------------- demo (§A17)


class Phase3Preset(_C):
    objects: dict[str, ObjectState]


class Demo(_C):
    fuel_s: int
    route: dict[str, list[str]]
    auto_phases: list[int]
    force: dict[str, str]
    phase3_preset: Phase3Preset
    presenter_keys: dict[str, Literal["next_action", "next_phase"]]


# ------------------------------------------------------------------- phase content (§B5.3)

WorldValue = str | float | bool | None


class Option(_C):
    value: str
    weight: int
    lamp: LampColor | None = None
    lamps: dict[str, LampColor | None] = Field(default_factory=dict)
    world: dict[str, WorldValue] = Field(default_factory=dict)

    @property
    def has_lamp(self) -> bool:
        """True when the `lamp` shorthand was given (even as null)."""
        return "lamp" in self.model_fields_set


class PhaseVar(_C):
    var: str
    roll_at: Literal["phase_start", "effect"]
    options: list[Option]


class Line(_C):
    hi: str
    hi_roman: str
    en: str


class Step(_C):
    object: str
    verb: Verb
    value: Literal["on", "off"] | None = None
    count: int = 1


class Branch(_C):
    when: str
    say: Line
    expect: list[Step]


class Observe(_C):
    var: str
    object: str | None = None
    part: str
    property: str
    options: list[Option] | None = None
    attention: list[str] | None = None


class FlyerExamples(_C):
    en: list[str]
    hi: list[str]
    hi_roman: list[str]


class Action(_C):
    id: str
    title: Bilingual
    observe: Observe | None = None
    branch_on: str | None = None
    ask: Line | None = None
    say: Line | None = None
    branches: list[Branch] | None = None
    expect: list[Step] | None = None
    unordered: bool = False
    keep_lamp: bool = False
    flyer_examples: FlyerExamples
    hint: Bilingual
    sticky: Bilingual
    on_start: list[str]
    on_success: list[str]

    @property
    def var(self) -> str | None:
        """The variable this action branches on (observe or branch_on)."""
        if self.observe is not None:
            return self.observe.var
        return self.branch_on


class PhaseContent(_C):
    phase: int
    id: str
    name: Bilingual
    station: StationId
    fuel_s: int
    signal: Literal["strong", "weak", "lost"]
    phase_vars: list[PhaseVar]
    actions: list[Action]


# ---------------------------------------------------------------------- the content bundle

PHASE_FILES: dict[int, str] = {
    1: "phase1_pilot_down.json",
    2: "phase2_engine_fire.json",
    3: "phase3_storm_landing.json",
}


@dataclass(slots=True)
class PlacedControl:
    """A control together with the station it sits on."""

    control: Control
    station: StationId


@dataclass(slots=True)
class Content:
    """Every content file plus the §B6.1 indexes."""

    dir: Path
    lexicon: Lexicon
    stations: Stations
    manual_terms: ManualTerms
    cinematics: Cinematics
    demo: Demo
    phases: dict[int, PhaseContent]
    objects_by_id: dict[str, PlacedControl] = field(default_factory=dict)
    parts_by_id: dict[tuple[StationId, str], Part] = field(default_factory=dict)
    actions_by_id: dict[str, Action] = field(default_factory=dict)
    action_phase: dict[str, int] = field(default_factory=dict)
    station_by_id: dict[StationId, Station] = field(default_factory=dict)
    concepts_by_id: dict[str, Concept] = field(default_factory=dict)
    phase_var_by_name: dict[str, PhaseVar] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for st in self.stations.stations:
            self.station_by_id[st.id] = st
            for c in st.controls:
                self.objects_by_id[c.id] = PlacedControl(c, st.id)
            for p in st.parts:
                self.parts_by_id[(st.id, p.id)] = p
        for n, ph in self.phases.items():
            for a in ph.actions:
                self.actions_by_id[a.id] = a
                self.action_phase[a.id] = n
            for pv in ph.phase_vars:
                self.phase_var_by_name[pv.var] = pv
        for concept in self.lexicon.concepts:
            self.concepts_by_id[concept.id] = concept

    def phase_by_no(self, n: int) -> PhaseContent:
        """Phase content by phase number."""
        return self.phases[n]

    def station_for_phase(self, n: int) -> Station:
        """The station played in phase n."""
        return self.station_by_id[self.phases[n].station]

    def full_route(self) -> dict[int, list[str]]:
        """Every action of every phase, in content order."""
        return {n: [a.id for a in ph.actions] for n, ph in self.phases.items()}

    def demo_route(self) -> dict[int, list[str]]:
        """The §A17 demo route."""
        return {int(k): list(v) for k, v in self.demo.route.items()}


def load_content(content_dir: Path) -> Content:
    """Parse every content JSON into models; unknown keys are errors (§B6.1)."""
    d = Path(content_dir)

    def read(name: str) -> bytes:
        return (d / name).read_bytes()

    phases = {n: PhaseContent.model_validate_json(read(f)) for n, f in PHASE_FILES.items()}
    return Content(
        dir=d,
        lexicon=Lexicon.model_validate_json(read("lexicon.json")),
        stations=Stations.model_validate_json(read("stations.json")),
        manual_terms=ManualTerms.model_validate_json(read("manual_terms.json")),
        cinematics=Cinematics.model_validate_json(read("cinematics.json")),
        demo=Demo.model_validate_json(read("demo.json")),
        phases=phases,
    )


def load_validator(content_dir: Path) -> ModuleType:
    """Import `content/validate_content.py` from the content directory (§B6.2)."""
    path = Path(content_dir) / "validate_content.py"
    spec = importlib.util.spec_from_file_location("validate_content", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load validator from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ------------------------------------------------------------------ templates (§B6.1, §A12)

_TEMPLATE = re.compile(r"\{([A-Z_]+)\.(lower|LR)\}")


class TemplateError(KeyError):
    """An unknown template variable at runtime (a content or server bug)."""


def expand(s: str, variables: dict[str, str]) -> str:
    """Replace `{VAR.lower}` / `{VAR.LR}` tokens; unknown variables raise (§B6.1)."""

    def sub(m: re.Match[str]) -> str:
        name, form = m.group(1), m.group(2)
        if name not in variables:
            raise TemplateError(f"unknown template variable {name!r} in {s!r}")
        value = variables[name]
        if form == "lower":
            return value.lower()
        if value == "LEFT":
            return "L"
        if value == "RIGHT":
            return "R"
        raise TemplateError(f"{name}={value!r} has no .LR form")

    return _TEMPLATE.sub(sub, s)


def has_template(s: str) -> bool:
    """True when the string contains a template token."""
    return _TEMPLATE.search(s) is not None


# ------------------------------------------------------------------ effect grammar (§A12)

EffectKind = Literal[
    "world", "lamp", "roll", "show", "cin", "event", "sfx", "sfx_stop", "fx", "both", "tower"
]
SFX_STOP_LOOPS: frozenset[str] = frozenset(
    {"alarm_master", "fire_bell", "warning_beep", "fuel_hiss"}
)
_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_OBJ_RE = re.compile(r"^[A-Z][A-Z0-9_{}.]*$")
_NUM_RE = re.compile(r"^\d+(\.\d+)?$")


@dataclass(frozen=True, slots=True)
class Effect:
    """One parsed effect string (§A12)."""

    raw: str
    kind: EffectKind
    name: str
    value: str | None = None

    @property
    def flyer_one_shot(self) -> bool:
        """Forwarded to the Flyer in `fx` (`sfx:`, `sfx_stop:`, `fx:`, `both:`)."""
        return self.kind in ("sfx", "sfx_stop", "fx", "both")

    @property
    def tower_one_shot(self) -> bool:
        """Forwarded to the Tower in `fx` (`tower:`, `both:`)."""
        return self.kind in ("tower", "both")


def _parse_fx(raw: str, rest: str) -> Effect:
    parts = rest.split(":")
    head = parts[0]
    ok = False
    if head == "shake":
        ok = len(parts) == 3 and all(_NUM_RE.match(p) for p in parts[1:])
    elif head == "yaw":
        ok = len(parts) == 2 and (parts[1] in ("left", "right") or "{" in parts[1])
    elif head in ("pitch_dip", "flicker_stop"):
        ok = len(parts) == 1
    elif head == "lamp_flicker":
        ok = len(parts) == 2 and bool(_OBJ_RE.match(parts[1]))
    elif head == "burst":
        ok = len(parts) == 2 and parts[1] in ("snuff", "foam")
    if not ok:
        raise ValueError(f"bad fx effect {raw!r}")
    return Effect(raw, "fx", rest, parts[1] if len(parts) > 1 else None)


def parse_effect(raw: str) -> Effect:
    """Parse one effect string with the §A12 grammar; raises ValueError."""
    kind, sep, rest = raw.partition(":")
    if not sep or not rest:
        raise ValueError(f"bad effect {raw!r}")
    match kind:
        case "world" | "lamp":
            key, eq, value = rest.partition("=")
            if not eq or not key or not value:
                raise ValueError(f"bad {kind} effect {raw!r}")
            if kind == "lamp" and not _OBJ_RE.match(key):
                raise ValueError(f"bad lamp object in {raw!r}")
            return Effect(raw, kind, key, value)
        case "roll" | "show":
            if not _VAR_RE.match(rest):
                raise ValueError(f"bad variable in {raw!r}")
            return Effect(raw, kind, rest)
        case "cin" | "event" | "sfx" | "tower":
            if not _NAME_RE.match(rest):
                raise ValueError(f"bad name in {raw!r}")
            return Effect(raw, kind, rest)
        case "sfx_stop":
            if rest not in SFX_STOP_LOOPS:
                raise ValueError(f"unknown loop in {raw!r}")
            return Effect(raw, "sfx_stop", rest)
        case "both":
            if rest not in ("static_dip", "signal_flash"):
                raise ValueError(f"unknown both: effect {raw!r}")
            return Effect(raw, "both", rest)
        case "fx":
            return _parse_fx(raw, rest)
    raise ValueError(f"unknown effect kind in {raw!r}")
