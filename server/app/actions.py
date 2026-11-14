"""ActionRun and the pure action judge (§B9.2, §B9.3).

The judge only *decides*; `game.py` applies the decision (state, timers, messages).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.content import Action, Effect, Step
from app.protocol import (
    ActionReason,
    ButtonState,
    HandleState,
    LampColor,
    LeverState,
    NotchState,
    ObjectState,
    PartType,
    ToggleState,
    Verb,
)

VERBS_FOR_TYPE: dict[PartType, frozenset[Verb]] = {
    "PushButton": frozenset({"press"}),
    "ToggleSwitch": frozenset({"toggle"}),
    "PullHandle": frozenset({"pull"}),
    "UpDownLever": frozenset({"move_down", "move_up"}),
    "NotchLever": frozenset({"move_down", "move_up"}),
    "Lamp": frozenset(),
    "FuelGauge": frozenset(),
    "Screen": frozenset(),
}
MOVING_PARTS: frozenset[PartType] = frozenset(
    {"ToggleSwitch", "PullHandle", "UpDownLever", "NotchLever"}
)


def verb_valid(ptype: PartType, verb: Verb) -> bool:
    """Verb ↔ part type table (§A6)."""
    return verb in VERBS_FOR_TYPE[ptype]


def bounces(ptype: PartType) -> bool:
    """Moving parts spring back on an ignored/wrong click; buttons need no bounce."""
    return ptype in MOVING_PARTS


@dataclass(slots=True)
class Pending:
    """A press/notch count waiting for the debounce window to close."""

    step_index: int
    object_id: str
    verb: Verb
    count: int
    start_state: ObjectState
    token: int


@dataclass(slots=True)
class ActionRun:
    """The current action (§B9.2)."""

    action: Action
    index: int
    value: str | None
    branch_index: int | None
    steps: list[Step]
    unordered: bool
    observed: dict[str, LampColor | None] = field(default_factory=dict)
    attention: list[str] = field(default_factory=list)
    option_world: dict[str, str | float | bool | None] = field(default_factory=dict)
    on_start: list[Effect] = field(default_factory=list)
    on_success: list[Effect] = field(default_factory=list)
    done: list[bool] = field(default_factory=list)
    pending: Pending | None = None
    active: bool = False
    succeeded: bool = False
    wrong_count: int = 0
    tokens: int = 0

    def __post_init__(self) -> None:
        if not self.done:
            self.done = [False] * len(self.steps)

    @property
    def completed_steps(self) -> int:
        """Steps done so far."""
        return sum(self.done)

    @property
    def row_index(self) -> int:
        """The Tower's rule row: the chosen branch, 0 for say-only (§B9.4)."""
        return self.branch_index or 0

    def next_token(self) -> int:
        """A fresh debounce token (each press re-schedules a guarded finalize)."""
        self.tokens += 1
        return self.tokens


# ------------------------------------------------------------------------------ decisions


@dataclass(frozen=True, slots=True)
class Ignore:
    """No penalty; moving parts bounce back."""

    bounce: bool


@dataclass(frozen=True, slots=True)
class Wrong:
    """A wrong action (−10 s)."""

    reason: ActionReason
    object_id: str
    verb: Verb
    count: int


@dataclass(frozen=True, slots=True)
class Counted:
    """A press or notch click was counted into the pending count."""

    step_index: int
    new_state: ObjectState | None


@dataclass(frozen=True, slots=True)
class StepDone:
    """A one-shot step (toggle, pull, lever) completed."""

    step_index: int
    new_state: ObjectState


Decision = Ignore | Wrong | Counted | StepDone


def judge(
    run: ActionRun, object_id: str, ptype: PartType, verb: Verb, state: ObjectState
) -> Decision:
    """Judge one interaction on the current station (§B9.3).

    Preconditions (checked by the caller): the run is active, the object is on the current
    station, the verb suits the part type, and any pending count on a *different* object
    was finalized first.
    """
    if isinstance(state, HandleState) and state.value == "out":
        # SPEC-ASSUMPTION: an already-pulled handle is a no-op click (bounce, no penalty) even
        # when it isn't the expected object; the handle can never move again anyway.
        return Ignore(bounce=True)
    candidates = [i for i, d in enumerate(run.done) if not d]
    if not run.unordered:
        candidates = candidates[:1]
    match = next((i for i in candidates if run.steps[i].object == object_id), None)
    if match is None:
        pending_objects = {run.steps[i].object for i, d in enumerate(run.done) if not d}
        reason: ActionReason = "wrong_order" if object_id in pending_objects else "wrong_object"
        return Wrong(reason, object_id, verb, 1)
    step = run.steps[match]
    pending_count = run.pending.count if run.pending and run.pending.object_id == object_id else 0
    match ptype:
        case "PushButton":
            return Counted(match, None)
        case "NotchLever":
            assert isinstance(state, NotchState)
            if verb == "move_up":
                return Wrong("wrong_direction", object_id, verb, 1)
            if state.value >= 2:
                return Wrong("wrong_count", object_id, verb, pending_count + 1)
            new_value: int = state.value + 1
            return Counted(match, NotchState(kind="notch", value=1 if new_value == 1 else 2))
        case "ToggleSwitch":
            assert isinstance(state, ToggleState)
            new = "off" if state.value == "on" else "on"
            if step.verb == "toggle" and new == step.value:
                return StepDone(match, ToggleState(kind="toggle", value=new))
            return Wrong("wrong_direction", object_id, verb, 1)
        case "PullHandle":
            return StepDone(match, HandleState(kind="handle", value="out"))
        case "UpDownLever":
            assert isinstance(state, LeverState)
            if verb == step.verb == "move_down" and state.value == "up":
                return StepDone(match, LeverState(kind="lever", value="down"))
            if verb == step.verb == "move_up" and state.value == "down":
                return StepDone(match, LeverState(kind="lever", value="up"))
            return Wrong("wrong_direction", object_id, verb, 1)
    return Ignore(bounce=False)


def finalize_ok(run: ActionRun, pending: Pending) -> bool:
    """True when the pending count equals the step's expected count (§B9.3)."""
    return pending.count == run.steps[pending.step_index].count


def target_state(step: Step, ptype: PartType) -> ObjectState:
    """The object's state after the step (manual drawings, dev complete_action)."""
    match step.verb:
        case "press":
            return ButtonState(kind="button")
        case "toggle":
            return ToggleState(kind="toggle", value=step.value or "on")
        case "pull":
            return HandleState(kind="handle", value="out")
        case "move_down" if ptype == "NotchLever":
            return NotchState(kind="notch", value=1 if step.count <= 1 else 2)
        case "move_down":
            return LeverState(kind="lever", value="down")
        case "move_up" if ptype == "NotchLever":
            return NotchState(kind="notch", value=0)
        case _:
            return LeverState(kind="lever", value="up")
