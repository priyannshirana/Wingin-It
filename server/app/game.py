"""Game state machine, phases, world, effects, cinematic scheduling and the judge glue (§B8)."""

from __future__ import annotations

import contextlib
import logging
import math
import secrets
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from app import manual
from app.actions import (
    VERBS_FOR_TYPE,
    ActionRun,
    Counted,
    Ignore,
    Pending,
    StepDone,
    Wrong,
    bounces,
    finalize_ok,
    judge,
    target_state,
    verb_valid,
)
from app.constants import (
    BYTES_PER_SECOND,
    CROSSOVER_BONUS_S,
    FUEL_BROADCAST_MS,
    HISTORY_SIZE,
    IN_PHASE_RESUME_DELAY_MS,
    LIFELINE_WAIT_MS,
    LIFELINE_WINDOW,
    LIFELINES_PER_PLAYER,
    NEXT_ACTION_DELAY_MS,
    PRESS_DEBOUNCE_MS,
    RECONNECT_GRACE_S,
    WRONG_PENALTY_S,
)
from app.content import CinematicKind, Content, Effect, Option, Step, expand, parse_effect
from app.fuel import FuelClock
from app.language import subtitles
from app.language.exposure import CreditEvent, PlayerStats, record_shown, understood_concepts
from app.language.lexicon import taken_indices
from app.language.normalize import gaps, nfc, tokenize
from app.logging_setup import log_event
from app.protocol import (
    ALL_ROLES,
    ActionReason,
    ActionResult,
    ChannelMsg,
    CinematicId,
    CinematicMsg,
    CinematicParams,
    CinematicSkip,
    Crash,
    DeckMsg,
    ErrorCode,
    ErrorMsg,
    FlyerView,
    Fx,
    GameState,
    History,
    HistoryUtterance,
    InteractMsg,
    LampColor,
    LampState,
    Lang,
    LifelineMsg,
    Lifelines,
    ManualCard,
    ManualCardMsg,
    NotchState,
    ObjectState,
    ObjectStateMsg,
    PartType,
    QuickLine,
    Radar,
    RetryVotes,
    Role,
    SayTextMsg,
    Side,
    SkipVotes,
    Status,
    Toast,
    ToastKey,
    TranslationMsg,
    Used,
    UtteranceEcho,
    UtteranceMsg,
    Verb,
    World,
    dump,
    other_role,
)
from app.rng import Roller, new_seed
from app.rooms import (
    DeckVote,
    Player,
    Room,
    broadcast,
    broadcast_all,
    broadcast_room_state,
    joined_msg,
    send,
    send_role,
)
from app.speech.base import Utterance, WordItem, abort_transmission
from app.speech.translate import TranslateError, Translator
from app.world import (
    apply_world,
    lamp_state,
    lamp_value,
    landing_world,
    lobby_world,
    parse_world_value,
    phase_start_world,
)

log = logging.getLogger("wingin.game")

ACTIVE_STATUSES: frozenset[Status] = frozenset(
    {"PROLOGUE", "PHASE_INTRO", "PLAYING", "PHASE_OUTRO", "ENDING", "CRASH"}
)
OUTRO_CINEMATIC: dict[int, CinematicId] = {1: "p1_outro", 2: "p2_outro", 3: "landing"}
INTRO_CINEMATIC: dict[int, CinematicId] = {1: "p1_intro", 2: "p2_intro", 3: "p3_intro"}
TOWER_HIDDEN_PARAMS: frozenset[str] = frozenset({"fire_side", "stopped_side", "damaged_side"})
SIDE_OF: dict[str, Side] = {"LEFT": "left", "RIGHT": "right"}
PHASE_NO: dict[int, Literal[1, 2, 3]] = {1: 1, 2: 2, 3: 3}
LEVEL_NO: dict[int, Literal[0, 1, 2, 3]] = {0: 0, 1: 1, 2: 2, 3: 3}


# ------------------------------------------------------------------------------ the game


@dataclass(slots=True, eq=False)
class RunningCinematic:
    """The cinematic currently playing (§B8.2 `play`)."""

    id: CinematicId
    kind: CinematicKind
    start_at_ms: int
    duration_ms: int
    params: CinematicParams
    skippable: bool
    on_end: Callable[[], None] | None
    skip_votes: set[Role] = field(default_factory=set)


@dataclass(slots=True)
class PhaseStats:
    """Per-phase results for the deck and DynamoDB (§B10, §B15)."""

    fuel_left_s: float = 0.0
    wrong: int = 0
    lifelines_used: Counter[str] = field(default_factory=Counter)
    time_s: float = 0.0
    started_at: float | None = None


@dataclass(slots=True)
class LastWrongRec:
    """What the Flyer did on the last wrong action (§B9.3)."""

    action_id: str
    object_id: str
    verb: Verb
    count: int


@dataclass(slots=True, eq=False)
class Game:
    """One game, created at PROLOGUE and kept through DECK (§B8.1)."""

    id: str
    seed: int
    rng: Roller
    started_at: float
    started_wall: datetime
    route: dict[int, list[str]]
    world: World
    objects: dict[str, ObjectState]
    fuel: FuelClock
    phase: int = 0
    run: ActionRun | None = None
    action_index: int = -1
    completed: int = 0
    phase_vars: dict[str, str] = field(default_factory=dict)
    vars: dict[str, str] = field(default_factory=dict)
    damaged_side: Side | None = None
    cinematic: RunningCinematic | None = None
    retry_votes: set[Role] = field(default_factory=set)
    attempts: dict[int, int] = field(default_factory=dict)
    phase_stats: dict[int, PhaseStats] = field(default_factory=dict)
    action_log: list[CreditEvent] = field(default_factory=list)
    last_wrong: LastWrongRec | None = None
    crossover_paid: dict[str, set[str]] = field(default_factory=dict)
    gap_pending: bool = False
    done_ids: set[str] = field(default_factory=set)
    last_fuel_broadcast: float = -math.inf
    total_time_s: float = 0.0
    ended_wall: datetime | None = None
    # Player id -> deck payload / report (filled at ENDING, §B15).
    decks: dict[str, DeckMsg] = field(default_factory=dict)
    auto_bots_prev: dict[Role, bool] | None = None
    reports: dict[str, str | None] = field(default_factory=dict)


def default_objects(content: Content) -> dict[str, ObjectState]:
    """Every object on all three stations at its default."""
    return {oid: placed.control.default for oid, placed in content.objects_by_id.items()}


def effective_status(room: Room) -> Status:
    """The status that is paused, or the status itself."""
    if room.status == "PAUSED" and room.paused_from is not None:
        return room.paused_from
    return room.status


def template_vars(g: Game) -> dict[str, str]:
    """Template variables for `{VAR.lower}` / `{VAR.LR}` (§B6.1)."""
    out: dict[str, str] = {}
    if "FIRE_SIDE" in g.phase_vars:
        out["FIRE_SIDE"] = g.phase_vars["FIRE_SIDE"]
    if g.damaged_side is not None:
        out["DAMAGED_SIDE"] = g.damaged_side.upper()
    return out


def role_lang(room: Room, role: Role) -> Lang:
    """The language of the player holding `role`; never derived from the role (§A2 rule 9)."""
    p = room.players.get(role)
    if p is not None:
        return p.lang
    partner = room.players.get(other_role(role))
    # SPEC-ASSUMPTION: an empty slot takes the opposite of the partner's language (else "en")
    # — nobody receives role-filtered output for an empty slot, so any fixed choice is safe.
    if partner is not None:
        return "hi" if partner.lang == "en" else "en"
    return "en"


def tower_lang(room: Room) -> Lang:
    """The Tower's language (manual labels)."""
    return role_lang(room, "tower")


def flyer_lang(room: Room) -> Lang:
    """The Flyer's language (quick replies)."""
    return role_lang(room, "flyer")


# ------------------------------------------------------------------------ messages (§B8.3)


def radar_for(room: Room) -> Radar:
    """Radar end-state for the current situation (§B8.3)."""
    g = room.game
    st = effective_status(room)
    phase = g.phase if g else 0
    total = len(g.route.get(phase, [])) if g and phase else 0
    progress = round(g.completed / total, 3) if g and total else 0.0

    def r(
        blip: Literal["green", "amber", "red"],
        icon: Literal["mayday", "fire", "smoke"] | None = None,
        *,
        storm: bool = False,
        runway: bool = False,
        glide: bool = False,
        landed: bool = False,
    ) -> Radar:
        return Radar(
            blip=blip,
            icon=icon,
            storm=storm,
            runway=runway,
            glide_path=glide,
            progress=progress,
            landed=landed,
        )

    if g is None or st in ("LOBBY", "PROLOGUE") or phase == 0:
        return r("green")
    if st in ("ENDING", "DECK") or (phase == 3 and st == "PHASE_OUTRO"):
        return r("green", runway=True, landed=True)
    if phase == 1:
        if st == "PHASE_OUTRO":
            return r("green")
        return r("amber") if "P1_A1" in g.done_ids else r("red", "mayday")
    if phase == 2:
        if st == "PHASE_OUTRO":
            return r("amber", storm=True)
        return r("amber", "smoke") if "P2_B3" in g.done_ids else r("red", "fire")
    return r("amber", storm=True, runway=True, glide=True)


def action_active(room: Room) -> bool:
    """True while the Flyer may act (§A2 rule 6)."""
    g = room.game
    return (
        room.status == "PLAYING"
        and g is not None
        and g.cinematic is None
        and g.run is not None
        and g.run.active
    )


def game_state_msg(room: Room) -> GameState:
    """The `game_state` payload, identical for both roles (no secrets)."""
    g = room.game
    st = effective_status(room)
    f, t = room.players.get("flyer"), room.players.get("tower")
    lifelines = Lifelines(flyer=f.lifelines if f else 0, tower=t.lifelines if t else 0)
    if g is None:
        return GameState(
            type="game_state",
            status=room.status,
            paused_from=room.paused_from,
            phase=0,
            signal_level=0,
            action_index=-1,
            completed=0,
            total_actions=0,
            action_id=None,
            action_active=False,
            input_locked=False,
            fuel_s=0.0,
            fuel_max_s=0.0,
            fuel_draining=False,
            lifelines=lifelines,
            lifelines_enabled=False,
            attempt=1,
            radar=radar_for(room),
            demo=room.demo,
            server_ms=room.now_ms(),
        )
    run = g.run
    has_action = run is not None and st in ("PLAYING", "CRASH")
    return GameState(
        type="game_state",
        status=room.status,
        paused_from=room.paused_from,
        phase=LEVEL_NO[g.phase],
        signal_level=LEVEL_NO[g.phase],
        action_index=g.action_index if has_action else -1,
        completed=g.completed,
        total_actions=len(g.route.get(g.phase, [])) if g.phase else 0,
        action_id=run.action.id if has_action and run is not None else None,
        action_active=action_active(room),
        input_locked=g.cinematic is not None,
        fuel_s=round(max(0.0, g.fuel.value()), 1),
        fuel_max_s=float(g.fuel.max_s),
        fuel_draining=g.fuel.draining and room.status == "PLAYING",
        lifelines=lifelines,
        lifelines_enabled=g.phase == 3 and room.status == "PLAYING",
        attempt=g.attempts.get(g.phase, 1) if g.phase else 1,
        radar=radar_for(room),
        demo=room.demo,
        server_ms=room.now_ms(),
    )


def broadcast_game_state(room: Room) -> None:
    """`game_state` to both roles."""
    broadcast_all(room, game_state_msg(room))


def interactive_ids(room: Room) -> list[str]:
    """Clickable ids right now: the current station's controls while an action is active."""
    g = room.game
    if g is None or not action_active(room):
        return []
    station = room.svc.content.station_for_phase(g.phase)
    return [c.id for c in station.controls if VERBS_FOR_TYPE[c.type]]


def answer_line(room: Room, run: ActionRun, lang: Lang) -> QuickLine | None:
    """The generated correct answer for an observed value: "Red!" / "Laal!" (§B16.2)."""
    if run.action.observe is None or run.value is None:
        return None
    c = room.svc.content.concepts_by_id.get(run.value)
    if c is None:
        return None
    if lang == "hi":
        word = c.hi.display_roman.capitalize() + "!"
        return QuickLine(label=word, text=word, alt_text=c.hi.display_deva + "!")
    word = c.en.display.capitalize() + "!"
    return QuickLine(label=word, text=word)


def quick_replies(room: Room) -> list[QuickLine] | None:
    """Flyer quick replies, Mock/Dev only (§B16.2)."""
    if not room.quick_lines_enabled:
        return None
    g = room.game
    run = g.run if g else None
    if run is None or room.status not in ("PLAYING", "PAUSED"):
        return []
    lang = flyer_lang(room)
    out: list[QuickLine] = []
    answer = answer_line(room, run, lang)
    if answer is not None:
        out.append(answer)
    ex = run.action.flyer_examples
    for hi, roman, en in zip(ex.hi, ex.hi_roman, ex.en, strict=False):
        out.append(manual.quick_line(hi, roman, en, lang))
    return out


def flyer_view_msg(room: Room) -> FlyerView:
    """The Flyer's full scene snapshot (§A8)."""
    g = room.game
    content = room.svc.content
    st = effective_status(room)
    if g is None:
        return FlyerView(
            type="flyer_view",
            station=None,
            interactive=[],
            objects=default_objects(content),
            world=lobby_world(),
            quick_replies=quick_replies(room),
        )
    station = None
    if g.phase >= 1 and st in ("PHASE_INTRO", "PLAYING", "PHASE_OUTRO", "CRASH"):
        station = content.phases[g.phase].station
    return FlyerView(
        type="flyer_view",
        station=station,
        interactive=interactive_ids(room),
        objects=dict(g.objects),
        world=g.world,
        quick_replies=quick_replies(room),
    )


def send_flyer_view(room: Room) -> None:
    send_role(room, "flyer", flyer_view_msg(room))


def send_object_state(room: Room, object_id: str, *, bounce: bool) -> None:
    """One object's state to the Flyer only."""
    g = room.game
    if g is None:
        return
    msg = ObjectStateMsg(
        type="object_state", object_id=object_id, state=g.objects[object_id], bounce=bounce
    )
    send_role(room, "flyer", msg)


def current_card(room: Room) -> ManualCard | None:
    """The Tower's manual card, or None (cover page) outside PLAYING (§B12)."""
    g = room.game
    if g is None or effective_status(room) != "PLAYING" or g.run is None:
        return None
    run = g.run
    lw = None
    if g.last_wrong is not None and g.last_wrong.action_id == run.action.id:
        lw = (g.last_wrong.object_id, g.last_wrong.count)
    return manual.build_card(
        room.svc.content,
        room.svc.lexicon,
        run,
        phase=g.phase,
        route=g.route[g.phase],
        lang=tower_lang(room),
        variables=template_vars(g),
        last_wrong=lw,
        quick_say=room.quick_lines_enabled,
    )


def send_manual(room: Room) -> None:
    send_role(room, "tower", ManualCardMsg(type="manual_card", card=current_card(room)))


def toast(
    room: Room,
    roles: set[Role],
    kind: Literal["crossover", "info", "warning", "error"],
    key: ToastKey,
    params: dict[str, str | int | float] | None = None,
    text: str | None = None,
) -> None:
    """A toast to one or both roles."""
    msg = Toast(type="toast", kind=kind, key=key, params=params or {})
    if text is not None:
        msg = Toast(type="toast", kind=kind, key=key, params=params or {}, text=text)
    broadcast(room, lambda r: msg if r in roles else None)


def send_fx(room: Room, effects: list[Effect]) -> None:
    """Forward one-shot effects, role-filtered (§A9, §A12)."""
    flyer = [e.raw for e in effects if e.flyer_one_shot]
    tower = [e.raw for e in effects if e.tower_one_shot]

    def for_role(r: Role) -> Fx | None:
        lst = flyer if r == "flyer" else tower
        return Fx(type="fx", effects=lst) if lst else None

    broadcast(room, for_role)


# ----------------------------------------------------------------------- transitions


def set_status(room: Room, status: Status) -> None:
    """Every state change bumps the timer generation (§B1)."""
    room.status = status
    room.paused_from = None
    room.bump()
    log_event(
        log,
        "state",
        room=room.code,
        game=room.game.id if room.game else None,
        status=status,
        phase=room.game.phase if room.game else 0,
    )


def start_game(room: Room) -> None:
    """Both ready, languages differ: create the Game and play the prologue (§B8.2)."""
    content = room.svc.content
    clock = room.clock
    seed = room.seed_override if room.seed_override is not None else new_seed()
    g = Game(
        id="g_" + uuid.uuid4().hex,
        seed=seed,
        rng=Roller(seed),
        started_at=clock.monotonic(),
        started_wall=datetime.now(UTC),
        route=content.demo_route() if room.demo else content.full_route(),
        world=lobby_world(),
        objects=default_objects(content),
        fuel=FuelClock(clock.monotonic, 0.0),
    )
    g.rng.forced.update(room.pending_force)
    room.pending_force = {}
    room.game = g
    for p in room.players.values():
        p.stats = PlayerStats()
        p.lifelines = LIFELINES_PER_PLAYER
        g.crossover_paid[p.id] = set()
    room.utterances.clear()
    room.last_utterance = None
    room.clips.clear()
    room.deck_votes.clear()
    room.ticker = lambda: fuel_tick(room)
    log_event(log, "start", room=room.code, game=g.id, seed=seed, demo=room.demo)
    set_status(room, "PROLOGUE")
    broadcast_room_state(room)
    send_flyer_view(room)
    send_manual(room)
    play(room, "prologue", {}, lambda: enter_phase_intro(room, 1))


def enter_phase_intro(room: Room, n: int, *, retry: bool = False) -> None:
    """PHASE_INTRO(n): roll phase-start variables, play pN_intro (§B8.2)."""
    g = _game(room)
    content = room.svc.content
    set_status(room, "PHASE_INTRO")
    g.phase = n
    g.run = None
    g.action_index = -1
    g.completed = 0
    g.gap_pending = False
    g.done_ids = set()
    g.retry_votes.clear()
    g.cinematic = None
    g.last_wrong = None
    g.attempts.setdefault(n, 1)
    g.fuel.stop()
    if room.demo:
        g.rng.forced.update(content.demo.force)
    phase = content.phases[n]
    for pv in phase.phase_vars:
        g.phase_vars.pop(pv.var, None)
        g.vars.pop(pv.var, None)
    # SPEC-ASSUMPTION: phase-start variables are rolled at PHASE_INTRO (not PLAYING) because
    # p2_intro already needs `fire_side`; the roll order stays fixed for a seed.
    for pv in phase.phase_vars:
        if pv.roll_at == "phase_start":
            opt = g.rng.roll(pv.var, pv.options)
            g.phase_vars[pv.var] = opt.value
            g.vars[pv.var] = opt.value
    if n == 3:
        side = g.phase_vars.get("FIRE_SIDE")
        if side is None:
            pv2 = content.phase_var_by_name["FIRE_SIDE"]
            side = g.rng.roll("FIRE_SIDE", pv2.options).value
        g.damaged_side = SIDE_OF[side]
        g.vars["DAMAGED_SIDE"] = side
    send_manual(room)
    send_flyer_view(room)  # cinematic end / new station (§A9)
    params: CinematicParams = {"retry": retry}
    if n == 2:
        params["fire_side"] = SIDE_OF[g.phase_vars["FIRE_SIDE"]]
    if n == 3 and g.damaged_side is not None:
        params["damaged_side"] = g.damaged_side
    play(room, INTRO_CINEMATIC[n], params, lambda: enter_playing(room, n))


def _option(options: list[Option], value: str) -> Option | None:
    return next((o for o in options if o.value == value), None)


def enter_playing(room: Room, n: int) -> None:
    """PLAYING(n): start world, station reset, fuel, lifelines, first action (§B8.2)."""
    g = _game(room)
    content = room.svc.content
    set_status(room, "PLAYING")
    fire = g.phase_vars.get("FIRE_SIDE")
    g.world = phase_start_world(n, SIDE_OF[fire] if fire else None, g.damaged_side)
    station = content.station_for_phase(n)
    for c in station.controls:
        g.objects[c.id] = c.default
    if room.demo and n == 3:
        for oid, st in content.demo.phase3_preset.objects.items():
            g.objects[oid] = st
    for pv in content.phases[n].phase_vars:
        value = g.phase_vars.get(pv.var)
        opt = _option(pv.options, value) if value is not None else None
        if pv.roll_at == "phase_start" and opt is not None:
            _apply_option(room, opt, observe_object=None)
    ph = content.phases[n]
    g.fuel.reset(float(content.demo.fuel_s if room.demo else ph.fuel_s))
    g.fuel.start()
    g.last_fuel_broadcast = room.clock.monotonic()
    for p in room.players.values():
        p.lifelines = LIFELINES_PER_PLAYER
    g.action_index = -1
    g.completed = 0
    g.action_log.clear()
    stats = g.phase_stats.setdefault(n, PhaseStats())
    stats.started_at = room.clock.monotonic()
    from app import bots

    bots.on_phase_start(room, n)
    send_flyer_view(room)
    broadcast_game_state(room)
    activate_next_action(room)


def _apply_option(room: Room, opt: Option, *, observe_object: str | None) -> list[str]:
    """Apply an option's lamps (steady) and world; returns the changed lamp ids."""
    g = _game(room)
    tv = template_vars(g)
    lamps: dict[str, LampColor | None] = {expand(k, tv): v for k, v in opt.lamps.items()}
    if opt.has_lamp and observe_object is not None:
        lamps[observe_object] = opt.lamp
    for oid, color in lamps.items():
        g.objects[oid] = lamp_state(color)
    for key, value in opt.world.items():
        g.world = apply_world(g.world, key, value)
    return list(lamps)


def build_run(room: Room, index: int, action_id: str) -> ActionRun:
    """Roll the observe variable (now, §B9.1), pick the branch, expand templates."""
    g = _game(room)
    content = room.svc.content
    action = content.actions_by_id[action_id]
    tv = template_vars(g)
    value: str | None = None
    option: Option | None = None
    if action.observe is not None:
        ob = action.observe
        if ob.options is not None:
            option = g.rng.roll(ob.var, ob.options)
            value = option.value
        else:
            pv = content.phase_var_by_name[ob.var]
            value = g.phase_vars.get(ob.var)
            if value is None:
                value = g.rng.roll(ob.var, pv.options).value
                g.phase_vars[ob.var] = value
            option = _option(pv.options, value)
        g.vars[ob.var] = value
    elif action.branch_on is not None:
        value = g.phase_vars.get(action.branch_on)
        if value is None:
            pv = content.phase_var_by_name[action.branch_on]
            value = g.rng.roll(action.branch_on, pv.options).value
            g.phase_vars[action.branch_on] = value
            g.vars[action.branch_on] = value
        tv = template_vars(g)
    branch_index: int | None = None
    steps: list[Step]
    if action.branches is not None:
        branch_index = next(i for i, b in enumerate(action.branches) if b.when == value)
        steps = list(action.branches[branch_index].expect)
    else:
        steps = list(action.expect or [])
    steps = [s.model_copy(update={"object": expand(s.object, tv)}) for s in steps]
    observed: dict[str, LampColor | None] = {}
    attention: list[str] = []
    option_world: dict[str, str | float | bool | None] = {}
    if action.observe is not None and option is not None:
        ob = action.observe
        obj = expand(ob.object, tv) if ob.object else None
        observed = {expand(k, tv): v for k, v in option.lamps.items()}
        if option.has_lamp and obj is not None:
            observed[obj] = option.lamp
        if ob.attention:
            attention = [expand(a, tv) for a in ob.attention]
        else:
            attention = list(observed) or ([obj] if obj else [])
        option_world = dict(option.world)
    return ActionRun(
        action=action,
        index=index,
        value=value,
        branch_index=branch_index,
        steps=steps,
        unordered=action.unordered,
        observed=observed,
        attention=attention,
        option_world=option_world,
        on_start=[parse_effect(expand(e, tv)) for e in action.on_start],
        on_success=[parse_effect(expand(e, tv)) for e in action.on_success],
    )


def activate_next_action(room: Room) -> None:
    """Next action, or PHASE_OUTRO after the last one (§B8.2)."""
    g = _game(room)
    if room.status != "PLAYING":
        return
    g.gap_pending = False
    g.action_index += 1
    route = g.route[g.phase]
    if g.action_index >= len(route):
        enter_phase_outro(room, g.phase)
        return
    run = build_run(room, g.action_index, route[g.action_index])
    g.run = run
    g.action_log.clear()
    g.last_wrong = None
    event = next((e for e in run.on_start if e.kind == "event"), None)
    immediate = [e for e in run.on_start if e.kind not in ("event", "cin")]
    apply_effects(room, immediate)
    if event is None:
        _apply_observe(room, run)
        run.active = True
    send_flyer_view(room)
    send_manual(room)
    broadcast_game_state(room)
    if event is not None:
        play(room, event.name, {}, lambda: _event_done(room, run))  # type: ignore[arg-type]
    else:
        _on_active(room)


def _event_done(room: Room, run: ActionRun) -> None:
    g = _game(room)
    if g.run is not run or room.status != "PLAYING":
        return
    _apply_observe(room, run)
    run.active = True
    send_flyer_view(room)
    broadcast_game_state(room)
    _on_active(room)


def _on_active(room: Room) -> None:
    from app import bots

    bots.on_action_active(room)


def _apply_observe(room: Room, run: ActionRun) -> None:
    """Observed lamps: rolled colors, attention rings, lit ones blink (§B5 notes)."""
    g = _game(room)
    changed: list[str] = []
    for oid, color in run.observed.items():
        g.objects[oid] = lamp_state(color)
        changed.append(oid)
    for oid in run.attention:
        cur = g.objects[oid]
        color = cur.color if isinstance(cur, LampState) else None
        g.objects[oid] = lamp_state(color, blinking=color is not None, attention=True)
        changed.append(oid)
    for key, value in run.option_world.items():
        g.world = apply_world(g.world, key, value)
    for oid in dict.fromkeys(changed):
        send_object_state(room, oid, bounce=False)


# --------------------------------------------------------------------------- effects


def apply_effects(room: Room, effects: list[Effect]) -> None:
    """Execute server-side effects and forward one-shots (§A12)."""
    g = _game(room)
    content = room.svc.content
    lamps: list[str] = []
    world_changed = False
    for e in effects:
        match e.kind:
            case "world":
                g.world = apply_world(g.world, e.name, parse_world_value(e.value or ""))
                world_changed = True
            case "lamp":
                g.objects[e.name] = lamp_state(lamp_value(e.value or ""))
                lamps.append(e.name)
            case "roll":
                pv = content.phase_var_by_name[e.name]
                value = g.rng.roll(e.name, pv.options).value
                g.phase_vars[e.name] = value
                g.vars[e.name] = value
            case "show":
                pv = content.phase_var_by_name[e.name]
                opt = _option(pv.options, g.phase_vars.get(e.name, ""))
                if opt is not None:
                    lamps += _apply_option(room, opt, observe_object=None)
                    world_changed = world_changed or bool(opt.world)
            case _:
                pass
    for oid in dict.fromkeys(lamps):
        send_object_state(room, oid, bounce=False)
    send_fx(room, effects)
    if world_changed:
        send_flyer_view(room)


# ------------------------------------------------------------------- cinematics (§B8.2)


def cinematic_params_for(role: Role, params: CinematicParams) -> CinematicParams:
    """Role-filtered params: the Tower never sees sides (§A10)."""
    if role == "flyer":
        return dict(params)
    return {k: v for k, v in params.items() if k not in TOWER_HIDDEN_PARAMS}


def cinematic_msg(cin: RunningCinematic, role: Role) -> CinematicMsg:
    return CinematicMsg(
        type="cinematic",
        id=cin.id,
        start_at_ms=cin.start_at_ms,
        duration_ms=cin.duration_ms,
        params=cinematic_params_for(role, cin.params),
    )


def play(
    room: Room, cid: CinematicId, params: CinematicParams, on_end: Callable[[], None] | None
) -> RunningCinematic:
    """Start a cinematic: lead time, input lock, fuel pause for in-phase ones (§B8.2)."""
    g = _game(room)
    defs = room.svc.content.cinematics
    d = defs.cinematics[cid]
    duration = d.duration_ms
    if room.demo and d.demo_duration_ms is not None:
        duration = d.demo_duration_ms
    if params.get("retry") is True and d.retry_duration_ms is not None:
        duration = d.retry_duration_ms
    cin = RunningCinematic(
        id=cid,
        kind=d.kind,
        start_at_ms=room.now_ms() + defs.lead_ms,
        duration_ms=duration,
        params=params,
        skippable=d.skippable,
        on_end=on_end,
    )
    g.cinematic = cin
    if d.kind in ("in_phase", "event"):
        g.fuel.pause()
    broadcast(room, lambda r: cinematic_msg(cin, r))
    broadcast_game_state(room)
    room.schedule(duration + defs.lead_ms, lambda: finish_cinematic(room, cin))
    return cin


def finish_cinematic(room: Room, cin: RunningCinematic) -> None:
    """Clear the cinematic, unlock input, resume fuel, run `on_end` (§B8.2)."""
    g = room.game
    if g is None or g.cinematic is not cin:
        return
    g.cinematic = None
    if cin.kind in ("in_phase", "event") and room.status == "PLAYING":
        g.fuel.resume()
    if cin.on_end is not None:
        cin.on_end()
    else:
        broadcast_game_state(room)
    if cin.id == "crash":
        check_retry(room)


def handle_skip(room: Room, p: Player) -> None:
    """`skip_cinematic`: vote; both roles (bots count) → skip now (§A10)."""
    g = room.game
    cin = g.cinematic if g else None
    if cin is None or room.status == "PAUSED":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="no cinematic"))
        return
    if not cin.skippable:
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="not skippable"))
        return
    cin.skip_votes.add(p.role)
    voted = cin.skip_votes | room.bot_roles()
    broadcast_all(room, SkipVotes(type="skip_votes", id=cin.id, roles=sorted(voted)))
    if voted >= set(ALL_ROLES):
        skip_now(room, cin)


def skip_now(room: Room, cin: RunningCinematic) -> None:
    """Skip immediately: cinematic_skip, cancel the pending finish, finish now."""
    broadcast_all(room, CinematicSkip(type="cinematic_skip", id=cin.id))
    room.bump()
    finish_cinematic(room, cin)


# -------------------------------------------------------------------- the judge (§B9.3)


def handle_interact(room: Room, p: Player, msg: InteractMsg) -> None:
    """Judge one `interact` from the Flyer (§B9.3)."""
    content = room.svc.content
    if p.role != "flyer":
        send(p, ErrorMsg(type="error", code="not_your_role", message="flyer only"))
        return
    placed = content.objects_by_id.get(msg.object_id)
    if placed is None:
        send(p, ErrorMsg(type="error", code="bad_message", message="unknown object"))
        return
    g = room.game
    ptype = placed.control.type
    run = g.run if g else None
    if g is None or run is None or not action_active(room):
        _bounce(room, msg.object_id, ptype)
        return
    if placed.station != content.phases[g.phase].station:
        _bounce(room, msg.object_id, ptype)
        return
    if not verb_valid(ptype, msg.verb):
        send(p, ErrorMsg(type="error", code="bad_message", message="verb does not suit object"))
        return
    if run.pending is not None and run.pending.object_id != msg.object_id:
        finalize_pending(room)
        if g.run is not run or not action_active(room):
            _bounce(room, msg.object_id, ptype)
            return
    state = g.objects[msg.object_id]
    decision = judge(run, msg.object_id, ptype, msg.verb, state)
    match decision:
        case Ignore(bounce=b):
            if b:
                _bounce(room, msg.object_id, ptype)
        case Wrong(reason=reason, object_id=oid, verb=verb, count=count):
            wrong(room, reason, oid, verb, count)
        case Counted(step_index=i, new_state=new_state):
            _count(room, run, i, msg.object_id, msg.verb, state, new_state)
        case StepDone(step_index=i, new_state=new_state):
            g.objects[msg.object_id] = new_state
            send_object_state(room, msg.object_id, bounce=False)
            step_done(room, i)


def _bounce(room: Room, object_id: str, ptype: PartType) -> None:
    """Ignored click: moving parts spring back (no penalty); buttons need nothing."""
    if room.game is not None and bounces(ptype):
        send_object_state(room, object_id, bounce=True)


def _count(
    room: Room,
    run: ActionRun,
    step_index: int,
    object_id: str,
    verb: Verb,
    state: ObjectState,
    new_state: ObjectState | None,
) -> None:
    g = _game(room)
    if run.pending is not None and run.pending.object_id == object_id:
        run.pending.count += 1
        run.pending.token = run.next_token()
    else:
        run.pending = Pending(step_index, object_id, verb, 1, state, run.next_token())
    if new_state is not None:
        g.objects[object_id] = new_state
    send_object_state(room, object_id, bounce=False)
    token = run.pending.token

    def debounce() -> None:
        if g.run is run and run.pending is not None and run.pending.token == token:
            finalize_pending(room)

    room.schedule(PRESS_DEBOUNCE_MS, debounce)


def finalize_pending(room: Room) -> bool:
    """Compare the pending count to the step's count (§B9.3)."""
    g = _game(room)
    run = g.run
    if run is None or run.pending is None:
        return False
    p = run.pending
    run.pending = None
    if finalize_ok(run, p):
        step_done(room, p.step_index)
        return True
    restored = _restore_notch(room, p)
    wrong(room, "wrong_count", p.object_id, p.verb, p.count, skip_bounce=restored)
    return False


def _restore_notch(room: Room, p: Pending) -> bool:
    """Restore a notch lever to its pre-count state. Returns True if a bounce was sent."""
    g = _game(room)
    if isinstance(p.start_state, NotchState):
        g.objects[p.object_id] = p.start_state
        send_object_state(room, p.object_id, bounce=True)
        return True
    return False


def reset_partials(room: Room) -> None:
    """Drop a pending count (notches spring back)."""
    g = room.game
    run = g.run if g else None
    if run is not None and run.pending is not None:
        p = run.pending
        run.pending = None
        _restore_notch(room, p)


def step_done(room: Room, i: int) -> None:
    g = _game(room)
    run = g.run
    if run is None:
        return
    run.done[i] = True
    if all(run.done):
        on_action_success(room)


def wrong(
    room: Room,
    reason: ActionReason,
    object_id: str,
    verb: Verb,
    count: int,
    *,
    skip_bounce: bool = False,
) -> None:
    """A wrong action: −10 s, bounce, results, `last_wrong` (§B9.3)."""
    g = _game(room)
    content = room.svc.content
    run = g.run
    if run is None:
        return
    reset_partials(room)
    run.wrong_count += 1
    g.phase_stats.setdefault(g.phase, PhaseStats()).wrong += 1
    g.fuel.add(-WRONG_PENALTY_S)
    ptype = content.objects_by_id[object_id].control.type
    if bounces(ptype) and not skip_bounce:
        send_object_state(room, object_id, bounce=True)
    base = {
        "type": "action_result",
        "action_id": run.action.id,
        "success": False,
        "reason": reason,
        "fuel_delta": -float(WRONG_PENALTY_S),
        "completed_steps": run.completed_steps,
        "total_steps": len(run.steps),
    }
    flyer_msg = ActionResult.model_validate(base)
    used = Used(
        object_id=object_id,
        label=manual.object_label(content, room.svc.lexicon, object_id, tower_lang(room)),
        verb=verb,
        count=count,
    )
    # model_copy keeps `used`'s unset optionals (Segment.concept/concepts) off the wire.
    tower_msg = flyer_msg.model_copy(update={"used": used})
    broadcast(room, lambda r: flyer_msg if r == "flyer" else tower_msg)
    g.last_wrong = LastWrongRec(run.action.id, object_id, verb, count)
    send_manual(room)
    broadcast_game_state(room)
    log_event(log, "action_wrong", room=room.code, game=g.id, action=run.action.id, reason=reason)
    if g.fuel.value() <= 0:
        on_fuel_empty(room)


def on_action_success(room: Room, *, dev: bool = False) -> None:
    """Results, lamps, credits, effects, then the gap or the in-phase cinematic (§B8.2)."""
    g = _game(room)
    run = g.run
    if run is None or run.succeeded:
        return
    run.active = False
    run.succeeded = True
    run.pending = None
    g.completed += 1
    g.done_ids.add(run.action.id)
    base = {
        "type": "action_result",
        "action_id": run.action.id,
        "success": True,
        "reason": "dev" if dev else None,
        "fuel_delta": 0.0,
        "completed_steps": len(run.steps),
        "total_steps": len(run.steps),
    }
    flyer_msg = ActionResult.model_validate(base)
    tower_msg = ActionResult.model_validate({**base, "row_index": run.row_index})
    broadcast(room, lambda r: flyer_msg if r == "flyer" else tower_msg)
    # Attention off; observed lamps dark unless keep_lamp (kept lamps turn steady).
    for oid in dict.fromkeys([*run.observed, *run.attention]):
        cur = g.objects[oid]
        color = cur.color if isinstance(cur, LampState) else None
        if oid in run.observed and not run.action.keep_lamp:
            color = None
        g.objects[oid] = lamp_state(color)
        send_object_state(room, oid, bounce=False)
    credit_understood(room)
    has_cin = any(e.kind in ("cin", "event") for e in run.on_success)
    deferred = [e for e in run.on_success if has_cin and e.kind in ("world", "lamp")]
    immediate = [e for e in run.on_success if e not in deferred and e.kind not in ("cin", "event")]
    apply_effects(room, immediate)
    log_event(log, "action_ok", room=room.code, game=g.id, action=run.action.id, dev=dev)
    if has_cin:
        cin_effect = next(e for e in run.on_success if e.kind in ("cin", "event"))
        cid: CinematicId = cin_effect.name  # type: ignore[assignment]
        send_flyer_view(room)

        def after() -> None:
            if g.run is not run or room.status != "PLAYING":
                return
            apply_effects(room, deferred)
            send_flyer_view(room)
            g.gap_pending = True
            broadcast_game_state(room)
            room.schedule(IN_PHASE_RESUME_DELAY_MS, lambda: _next_after_gap(room, run))

        play(room, cid, in_phase_params(room, cid), after)
    else:
        send_flyer_view(room)
        g.gap_pending = True
        broadcast_game_state(room)
        room.schedule(NEXT_ACTION_DELAY_MS, lambda: _next_after_gap(room, run))


def _next_after_gap(room: Room, run: ActionRun) -> None:
    g = room.game
    if g is None or g.run is not run or not g.gap_pending or room.status != "PLAYING":
        return
    activate_next_action(room)


def in_phase_params(room: Room, cid: CinematicId) -> CinematicParams:
    """Params for in-phase cinematics (§A10)."""
    g = _game(room)
    if cid == "p2_extinguish" and "FIRE_SIDE" in g.phase_vars:
        return {"fire_side": SIDE_OF[g.phase_vars["FIRE_SIDE"]]}
    return {}


# --------------------------------------------------------------------- phase end (§B8.2)


def enter_phase_outro(room: Room, n: int) -> None:
    """PHASE_OUTRO(n): record stats, stop fuel, play the outro (§B8.2)."""
    g = _game(room)
    if g.run is not None:
        g.run.active = False
        g.run.pending = None
    g.cinematic = None
    stats = g.phase_stats.setdefault(n, PhaseStats())
    stats.fuel_left_s = round(max(0.0, g.fuel.value()), 1)
    if stats.started_at is not None:
        stats.time_s += room.clock.monotonic() - stats.started_at
        stats.started_at = None
    g.fuel.stop()
    set_status(room, "PHASE_OUTRO")
    g.run = None
    g.action_index = -1
    g.gap_pending = False
    from app import bots

    bots.on_phase_end(room, n)
    send_manual(room)
    send_flyer_view(room)
    params: CinematicParams = {}
    if n == 2 and "FIRE_SIDE" in g.phase_vars:
        params["stopped_side"] = SIDE_OF[g.phase_vars["FIRE_SIDE"]]
    if n == 3 and g.damaged_side is not None:
        params["damaged_side"] = g.damaged_side
    play(room, OUTRO_CINEMATIC[n], params, lambda: _outro_done(room, n))


def apply_outro_end_state(room: Room, n: int) -> None:
    """World/objects as the outro cinematic leaves them (§A11)."""
    g = _game(room)
    content = room.svc.content
    if n == 1:
        g.world = apply_world(g.world, "overhead_all_green", True)
        g.world = apply_world(g.world, "alarm", False)
        for c in content.station_by_id["overhead"].controls:
            if c.type == "Lamp":
                g.objects[c.id] = lamp_state("green")
    elif n == 2:
        fire = g.phase_vars.get("FIRE_SIDE")
        if fire is not None:
            g.world = apply_world(g.world, "propeller_stopped", SIDE_OF[fire])
    elif n == 3:
        g.world = landing_world(g.damaged_side)


def _outro_done(room: Room, n: int) -> None:
    apply_outro_end_state(room, n)
    send_flyer_view(room)
    if n < 3:
        enter_phase_intro(room, n + 1)
    else:
        enter_ending(room)


def enter_ending(room: Room) -> None:
    """ENDING: deck + report computed now, persistence in the background (§B8.2)."""
    g = _game(room)
    set_status(room, "ENDING")
    g.total_time_s = round(room.clock.monotonic() - g.started_at, 1)
    g.ended_wall = datetime.now(UTC)
    from app import deck, persistence

    deck.prepare(room)
    persister = room.svc.persister
    if persister is not None:
        room.spawn(persister.save(persistence.game_item(room)))
    fuel_left = g.phase_stats[3].fuel_left_s if 3 in g.phase_stats else 0.0
    params: CinematicParams = {"fuel_left_s": fuel_left, "total_time_s": g.total_time_s}
    play(room, "ending", params, lambda: enter_deck(room))


def enter_deck(room: Room) -> None:
    """DECK: each player gets their own deck (§B8.2)."""
    set_status(room, "DECK")
    room.ticker = None
    broadcast_room_state(room)
    broadcast_game_state(room)
    send_flyer_view(room)
    from app import deck

    deck.send_decks(room)


# ----------------------------------------------------------------- crash / retry (§B8.2)


def on_fuel_empty(room: Room) -> None:
    """Fuel hit 0: CRASH, crash cinematic, wait for Retry (§B8.2)."""
    g = _game(room)
    if room.status != "PLAYING":
        return
    g.fuel.stop()
    g.fuel.left_s = 0.0
    if g.run is not None:
        g.run.active = False
        g.run.pending = None
    g.cinematic = None
    g.gap_pending = False
    stats = g.phase_stats.setdefault(g.phase, PhaseStats())
    if stats.started_at is not None:
        stats.time_s += room.clock.monotonic() - stats.started_at
        stats.started_at = None
    set_status(room, "CRASH")
    g.retry_votes.clear()
    log_event(log, "crash", room=room.code, game=g.id, phase=g.phase)
    broadcast_all(room, Crash(type="crash", phase=PHASE_NO[g.phase]))
    send_flyer_view(room)
    send_manual(room)
    play(room, "crash", {}, None)


def handle_retry(room: Room, p: Player) -> None:
    """`retry` (CRASH only)."""
    g = room.game
    if g is None or room.status != "CRASH":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="not crashed"))
        return
    g.retry_votes.add(p.role)
    check_retry(room)


def check_retry(room: Room) -> None:
    """Tally retry votes (bots vote at once); both → same phase from action 1."""
    g = room.game
    if g is None or room.status != "CRASH":
        return
    voted = g.retry_votes | room.bot_roles()
    if not g.retry_votes and voted != set(ALL_ROLES):
        return
    broadcast_all(room, RetryVotes(type="retry_votes", roles=sorted(voted)))
    if voted >= set(ALL_ROLES):
        n = g.phase
        g.attempts[n] = g.attempts.get(n, 1) + 1
        g.action_log.clear()
        for pl in room.players.values():
            pl.lifelines = LIFELINES_PER_PLAYER
        log_event(log, "retry", room=room.code, game=g.id, phase=n, attempt=g.attempts[n])
        enter_phase_intro(room, n, retry=True)


# -------------------------------------------------------------------------- fuel ticker


def fuel_tick(room: Room) -> None:
    """Every 100 ms: crash at 0, `game_state` heartbeat every second while draining (§B10)."""
    g = room.game
    gen = room.gen
    if g is not None and room.status == "PLAYING" and g.fuel.draining:
        now = room.clock.monotonic()
        if g.fuel.value() <= 0:
            on_fuel_empty(room)
            room.after_handle()
        # Half-ms slack: float drift (1030.8 - 1029.8 < 1.0) would otherwise slip a beat to 1.1 s.
        elif (now - g.last_fuel_broadcast) * 1000 >= FUEL_BROADCAST_MS - 0.5:
            g.last_fuel_broadcast = now
            broadcast_game_state(room)
            room.after_handle()
    if room.gen == gen and room.ticker is not None:
        room.schedule_tick()


# ----------------------------------------------------------------- pause / resume (§B8.4)


def on_player_disconnect(room: Room, p: Player) -> None:
    """Pause a running game when a human drops (§B8.4)."""
    release_channel_of(room, p.role)
    g = room.game
    if g is None or not p.human:
        return
    if room.status not in ACTIVE_STATUSES:
        return
    room.paused_from = room.status
    room.status = "PAUSED"
    room.bump()
    room.paused_had_cinematic = g.cinematic is not None
    g.fuel.pause()
    room.pause_token += 1
    log_event(
        log, "state", room=room.code, game=g.id, status="PAUSED", paused_from=room.paused_from
    )
    other = {r for r in ALL_ROLES if r != p.role}
    toast(room, other, "warning", "toast.partner_left", {"name": p.name})
    broadcast_game_state(room)
    room.schedule(
        RECONNECT_GRACE_S * 1000,
        lambda: abandon(room),
        key=lambda: room.pause_token if room.status == "PAUSED" else None,
    )


def maybe_resume(room: Room) -> None:
    """Resume when every human is back (§B8.4)."""
    g = room.game
    if g is None or room.status != "PAUSED" or not room.humans_connected():
        return
    st = room.paused_from or "PLAYING"
    room.status = st
    room.paused_from = None
    room.pause_token += 1
    room.bump()
    log_event(log, "state", room=room.code, game=g.id, status=st, resumed=True)
    toast(room, set(ALL_ROLES), "info", "toast.partner_back")
    cin = g.cinematic
    if cin is not None:
        # SPEC-ASSUMPTION (§B8.4): a cinematic interrupted by the pause completes instantly;
        # clients get cinematic_skip so they jump to its end state.
        broadcast_all(room, CinematicSkip(type="cinematic_skip", id=cin.id))
        finish_cinematic(room, cin)
    elif st == "PLAYING":
        g.fuel.resume()
        g.last_fuel_broadcast = room.clock.monotonic()
        run = g.run
        if run is not None and run.active:
            reset_partials(room)
            _on_active(room)
        elif g.gap_pending and run is not None:
            room.schedule(NEXT_ACTION_DELAY_MS, lambda: _next_after_gap(room, run))
    send_flyer_view(room)
    broadcast_game_state(room)


def abandon(room: Room) -> None:
    """60 s without the partner: drop the game, back to LOBBY (§B8.4)."""
    g = room.game
    if room.status != "PAUSED":
        return
    from app import bots

    bots.restore_auto_bots(room)
    log_event(log, "abandon", room=room.code, game=g.id if g else None)
    room.game = None
    room.ticker = None
    room.status = "LOBBY"
    room.paused_from = None
    room.bump()
    for role in list(room.players):
        p = room.players[role]
        if p.human and p.conn is None:
            del room.players[role]
        else:
            p.ready = p.is_bot
    toast(room, set(ALL_ROLES), "warning", "toast.partner_gone")
    broadcast_room_state(room)
    broadcast_game_state(room)
    send_flyer_view(room)
    send_manual(room)


def deck_seat_freed(room: Room) -> None:
    """A seat freed in DECK: drop the finished game, back to LOBBY (§B8.4)."""
    g = room.game
    if room.status != "DECK":
        return
    from app import bots

    bots.restore_auto_bots(room)
    log_event(log, "deck_seat_freed", room=room.code, game=g.id if g else None)
    # The game was already persisted at ENDING (§B8.2): nothing more to save.
    room.game = None
    room.ticker = None
    room.deck_votes.clear()
    set_status(room, "LOBBY")
    for p in room.players.values():
        p.ready = p.is_bot
    toast(room, set(ALL_ROLES), "warning", "toast.partner_gone")
    broadcast_room_state(room)
    broadcast_game_state(room)
    send_flyer_view(room)
    send_manual(room)


# -------------------------------------------------------------- play again / swap (§B8.5)


def _deck_vote(room: Room, p: Player, vote: DeckVote) -> bool:
    """Record `p`'s one current deck vote; True when both current votes are `vote` (§B8.5)."""
    if room.status != "DECK":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="deck only"))
        return False
    room.deck_votes[p.role] = vote
    for r in room.bot_roles():
        if r in room.players:
            room.deck_votes[r] = vote  # seated bots vote at once, matching the human
    broadcast_room_state(room)
    # Act only with both seats filled: a freed seat never counts as a vote.
    return all(r in room.players and room.deck_votes.get(r) == vote for r in ALL_ROLES)


def handle_play_again(room: Room, p: Player) -> None:
    """`play_again` (DECK only): both → new game, same roles (§B8.5)."""
    if _deck_vote(room, p, "play_again"):
        start_game(room)


def handle_swap_roles(room: Room, p: Player) -> None:
    """`swap_roles` (DECK only): both → LOBBY with roles swapped, languages kept (§B8.5)."""
    if not _deck_vote(room, p, "swap_roles"):
        return
    f, t = room.players.get("flyer"), room.players.get("tower")
    new_players: dict[Role, Player] = {}
    if f is not None:
        f.role = "tower"
        new_players["tower"] = f
    if t is not None:
        t.role = "flyer"
        new_players["flyer"] = t
    room.players = new_players
    room.bots = {"flyer": room.bots.get("tower", False), "tower": room.bots.get("flyer", False)}
    for pl in room.players.values():
        pl.ready = pl.is_bot
    room.game = None
    room.ticker = None
    room.deck_votes.clear()
    set_status(room, "LOBBY")
    for pl in room.players.values():
        send(pl, joined_msg(pl))
    broadcast_room_state(room)
    broadcast_game_state(room)
    send_flyer_view(room)
    send_manual(room)


# ---------------------------------------------------------------- rejoin snapshot (§B7)


def send_snapshot(room: Room, p: Player) -> None:
    """game_state, flyer_view | manual_card, history, cinematic, channel, deck (§B7).

    Uses broadcast / send_role for role-filtered messages so the privacy test's broadcast
    wrapper audits every outbound frame.
    """
    from app import deck

    broadcast_all(room, game_state_msg(room))
    send_flyer_view(room)
    send_manual(room)
    send(p, history_msg(room, p))
    g = room.game
    if g is not None and g.cinematic is not None:
        cin = g.cinematic
        broadcast(room, lambda r: cinematic_msg(cin, r))
    broadcast_all(room, ChannelMsg(type="channel", busy_by=room.channel_holder))
    if room.status == "DECK":
        deck.send_deck(room, p)


# ------------------------------------------------------------------------------ helpers


def _game(room: Room) -> Game:
    g = room.game
    if g is None:
        raise RuntimeError("no game")
    return g


def complete_current_action(room: Room) -> bool:
    """Dev `complete_action` / presenter `next_action` (§B9.3)."""
    g = room.game
    run = g.run if g else None
    if g is None or run is None or not action_active(room):
        return False
    run.pending = None
    content = room.svc.content
    for i, s in enumerate(run.steps):
        if run.done[i]:
            continue
        ptype = content.objects_by_id[s.object].control.type
        g.objects[s.object] = target_state(s, ptype)
        send_object_state(room, s.object, bounce=False)
        run.done[i] = True
    on_action_success(room, dev=True)
    return True


def fail_current_action(room: Room) -> bool:
    """Dev `fail_action`: wrong_object with the first expected object."""
    g = room.game
    run = g.run if g else None
    if g is None or run is None or not action_active(room) or not run.steps:
        return False
    s = run.steps[0]
    wrong(room, "wrong_object", s.object, s.verb, 1)
    return True


# --------------------------------------------------------------- talking (§B13.2, §B11)


def utterance_level(room: Room) -> int:
    """Signal level for subtitles: the phase in PLAYING..PHASE_OUTRO, else 0 (§B13.2)."""
    g = room.game
    if g is None:
        return 0
    return g.phase if effective_status(room) in ("PLAYING", "PHASE_OUTRO") else 0


def handle_say_text(room: Room, p: Player, msg: SayTextMsg) -> None:
    """`say_text` (Mock/Dev/Demo): same pipeline as speech, no channel lock (§A16)."""
    if not room.say_text_allowed:
        send(p, ErrorMsg(type="error", code="mock_only", message="say_text not allowed"))
        return
    if room.status == "DECK":
        send(p, ErrorMsg(type="error", code="not_allowed_now", message="game over"))
        return
    text = nfc(msg.text).strip()
    if not text:
        send(p, ErrorMsg(type="error", code="bad_message", message="empty text"))
        return
    finalize_utterance(room, p, text, msg.lang or p.lang)


def finalize_utterance(
    room: Room,
    speaker: Player,
    transcript: str,
    lang: Lang,
    *,
    items: list[WordItem] | None = None,
    pcm: bytes | None = None,
    released_at: float | None = None,
) -> Utterance:
    """Build the utterance, send subtitles/echo, credit exposure and crossover (§B13.2)."""
    lexicon = room.svc.lexicon
    g = room.game
    if items:
        tokens, gs, transcript = subtitles.tokens_from_items(items)
    else:
        tokens = tokenize(transcript)
        gs = gaps(transcript, tokens)
    listener = room.partner(speaker)
    level = utterance_level(room)
    matches = lexicon.match(tokens, lang)
    listener_matches = []
    if listener is not None and listener.lang != lang:
        listener_matches = lexicon.match_listener_side(
            tokens, listener.lang, taken_indices(matches)
        )
    run = g.run if g else None
    utt = Utterance(
        id="u_" + secrets.token_hex(4),
        room=room.code,
        speaker_id=speaker.id,
        speaker_role=speaker.role,
        speaker_name=speaker.name,
        lang=lang,
        phase=g.phase if g else 0,
        level=level,
        action_id=run.action.id if run is not None and room.status == "PLAYING" else None,
        transcript=transcript,
        tokens=tokens,
        gaps=gs,
        items=list(items or []),
        matches=matches,
        listener_matches=listener_matches,
        listener_id=listener.id if listener else None,
        listener_lang=listener.lang if listener else None,
        pcm=pcm,
        created_at=room.clock.monotonic(),
        created_at_ms=room.now_ms(),
        released_at=released_at,
    )
    if listener is not None and listener.human:
        segs = subtitles.build_segments(
            utt, listener.lang, listener.stats, level, lexicon, room.svc.settings.gloss_threshold
        )
        utt.segments_for_listener = segs
        payload = UtteranceMsg(
            type="utterance",
            id=utt.id,
            speaker_role=speaker.role,
            speaker_name=speaker.name,
            lang=lang,
            segments=segs,
            level=LEVEL_NO[level],
            lifeline_available=bool(g and g.phase == 3 and room.status == "PLAYING"),
            created_at_ms=utt.created_at_ms,
        )
        utt.listener_payload = dump(payload)
        send(listener, payload)
        record_exposure(room, utt, listener, level)
    if speaker.human:
        send(
            speaker,
            UtteranceEcho(
                type="utterance_echo",
                id=utt.id,
                transcript_display=subtitles.display_text(utt, lexicon),
            ),
        )
    credit_crossover(room, utt, speaker)
    if released_at is not None:
        utt.latency_ms = int((room.clock.monotonic() - released_at) * 1000)
        room.latencies_ms.append(utt.latency_ms)
    log_fields: dict[str, object] = {
        "room": room.code,
        "role": speaker.role,
        "lang": lang,
        "ms": utt.latency_ms,
        "chars": len(transcript),
        "matches": len(matches),
    }
    if room.svc.settings.dev_mode:
        log_fields["transcript"] = transcript
    log.info("utterance", extra={"evt": "utterance", **log_fields})
    room.utterances.append(utt)
    room.last_utterance = utt
    start_translation(room, utt)
    from app import bots

    bots.on_utterance(room, utt)
    return utt


def history_msg(room: Room, p: Player) -> History:
    """The partner's last 5 utterances to this listener, with revealed translations (§B7)."""
    mine = [u for u in room.utterances if u.listener_id == p.id and u.listener_payload]
    out: list[HistoryUtterance] = []
    for u in mine[-HISTORY_SIZE:]:
        data = dict(u.listener_payload or {})
        if p.id in u.lifelined_by and u.translation is not None:
            data["translation"] = u.translation
        out.append(HistoryUtterance.model_validate(data))
    return History(type="history", utterances=out)


def release_channel_of(room: Room, role: Role) -> None:
    """Free the radio channel if `role` holds it, aborting its transmission (§B13.2)."""
    if room.channel_holder != role:
        return
    tx = room.transmission
    room.channel_holder = None
    room.channel_token += 1
    room.transmission = None
    if tx is not None:
        room.charge_transcribe(len(tx.buffer) / BYTES_PER_SECOND)
        room.spawn(abort_transmission(tx))
    broadcast_all(room, ChannelMsg(type="channel", busy_by=None))


def record_exposure(room: Room, utt: Utterance, listener: Player, level: int) -> None:
    """Exposure counters and credit events for the listener (§B11.6, §B11.7)."""
    if level < 1:
        return  # level 0 glosses like level 1 but counts no exposure
    shown = record_shown(listener.stats, utt.segments_for_listener)
    g = room.game
    for concept, glossed in shown:
        (utt.glossed_concepts if glossed else utt.unglossed_concepts).add(concept)
        if g is not None and room.status == "PLAYING":
            g.action_log.append(CreditEvent(utt.id, listener.id, concept, glossed))


def credit_crossover(room: Room, utt: Utterance, speaker: Player) -> None:
    """Spoken / crossover: partner-language words already shown to the speaker (§B11.7)."""
    g = room.game
    if g is None or room.status != "PLAYING" or not utt.listener_matches:
        return
    paid = g.crossover_paid.setdefault(speaker.id, set())
    listener_lang = utt.listener_lang or ("hi" if utt.lang == "en" else "en")
    bonus = False
    for m in utt.listener_matches:
        for c in m.concepts:
            if c not in speaker.stats.shown:
                continue
            speaker.stats.spoken[c] += 1
            if c in paid:
                continue
            paid.add(c)
            g.fuel.add(float(CROSSOVER_BONUS_S))
            bonus = True
            word = room.svc.lexicon.display(c, listener_lang)
            toast(
                room,
                set(ALL_ROLES),
                "crossover",
                "toast.crossover",
                {"word": word},
                text=f"CROSSOVER! +{CROSSOVER_BONUS_S}s ({word})",
            )
            log_event(log, "crossover", room=room.code, game=g.id, role=speaker.role)
    if bonus:
        broadcast_game_state(room)


def credit_understood(room: Room) -> None:
    """Understood credit on action success, phases 2–3, once per concept per action."""
    g = room.game
    if g is None or g.phase not in (2, 3):
        return
    for p in room.players.values():
        lifelined = {u.id for u in room.utterances if p.id in u.lifelined_by}
        for c in understood_concepts(g.action_log, p.id, lifelined):
            p.stats.understood[c] += 1


def translator_for(room: Room) -> Translator | None:
    """Mock rooms use the authored-line index; real rooms the AWS translator (§B14.1)."""
    if room.mock_speech or room.svc.settings.mock_speech:
        return room.svc.mock_translator
    return room.svc.translator or room.svc.mock_translator


def start_translation(room: Room, utt: Utterance) -> None:
    """Background translation for lifelines and the deck; skipped without a listener."""
    if utt.listener_lang is None:
        utt.translation_status = "failed"
        utt.translation_event.set()
        return
    tr = translator_for(room)
    paid = tr is not None and tr is not room.svc.mock_translator
    if paid and not room.svc.limits.translate.take(room.clock.now_ms()):
        tr = room.svc.mock_translator  # daily Translate cap: authored lines only (§B22)
    if tr is None:
        utt.translation_status = "failed"
        utt.translation_event.set()
        return
    room.spawn(translate_in_background(room, tr, utt))


async def translate_in_background(room: Room, tr: Translator, utt: Utterance) -> None:
    """`pending` → call → `ready` / `failed`, then set the event (§B14.1)."""
    dst = utt.listener_lang or "en"
    try:
        text = await tr.translate(utt.transcript, utt.lang, dst)
        utt.translation = text
        utt.translation_status = "ready"
    except (TranslateError, TimeoutError, OSError) as exc:
        utt.translation_status = "failed"
        log_event(log, "translate_fail", level=logging.WARNING, room=room.code, err=str(exc))
    finally:
        utt.translation_event.set()


# --------------------------------------------------------------------- lifelines (§B14.2)


def _lifeline_target(room: Room, p: Player, utterance_id: str) -> Utterance | ErrorCode:
    g = room.game
    if g is None or room.status != "PLAYING" or g.phase != 3:
        return "lifeline_not_available"
    partner = room.partner(p)
    if partner is None:
        return "lifeline_not_available"
    theirs = [u for u in room.utterances if u.speaker_id == partner.id]
    recent = theirs[-LIFELINE_WINDOW:]
    utt = next((u for u in recent if u.id == utterance_id), None)
    if utt is None:
        return "lifeline_not_available"
    return utt


def _send_translation(room: Room, p: Player, utt: Utterance) -> None:
    send(
        p,
        TranslationMsg(
            type="translation",
            utterance_id=utt.id,
            text=utt.translation or "",
            lang=p.lang,
            lifelines_left=p.lifelines,
        ),
    )


def _deliver_lifeline(room: Room, p: Player, utt: Utterance) -> None:
    g = _game(room)
    p.lifelines -= 1
    utt.lifelined_by.add(p.id)
    g.phase_stats.setdefault(3, PhaseStats()).lifelines_used[p.id] += 1
    _send_translation(room, p, utt)
    broadcast_game_state(room)
    log_event(log, "lifeline", room=room.code, game=g.id, role=p.role, left=p.lifelines)


def _lifeline_step(room: Room, p: Player, utterance_id: str) -> Utterance | None:
    """Checks under the lock; returns the utterance to wait for, or None when done."""
    target = _lifeline_target(room, p, utterance_id)
    if isinstance(target, str):
        send(p, ErrorMsg(type="error", code=target, message="lifeline not available"))
        return None
    utt = target
    if p.id in utt.lifelined_by:
        _send_translation(room, p, utt)  # the "show" link: free
        return None
    if p.lifelines <= 0:
        send(p, ErrorMsg(type="error", code="no_lifelines", message="no lifelines left"))
        return None
    if utt.translation_status == "ready":
        _deliver_lifeline(room, p, utt)
        return None
    if utt.translation_status == "failed":
        send(p, ErrorMsg(type="error", code="translation_failed", message="translation failed"))
        return None
    return utt


async def handle_lifeline(room: Room, p: Player, msg: LifelineMsg) -> None:
    """`lifeline`: decrement only after a translation is delivered (§B14.2).

    The room lock is held only around the checks; it is released while waiting for a
    pending translation, then re-acquired and everything is re-checked.
    """
    async with room.lock:
        utt = _lifeline_step(room, p, msg.utterance_id)
        room.after_handle()
    if utt is None:
        return
    with contextlib.suppress(TimeoutError):
        await room.clock.wait(utt.translation_event.wait(), LIFELINE_WAIT_MS / 1000)
    async with room.lock:
        if utt.translation_status != "ready":
            target = _lifeline_target(room, p, msg.utterance_id)
            if not isinstance(target, str) and p.id not in utt.lifelined_by:
                send(
                    p,
                    ErrorMsg(
                        type="error", code="translation_failed", message="translation not ready"
                    ),
                )
                room.after_handle()
                return
        _lifeline_step(room, p, msg.utterance_id)
        room.after_handle()
