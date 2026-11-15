"""Wire protocol: pydantic models for every §A7 / §A8 message (§A6, §A13, §A15).

Outbound models are serialized with `dump()` (exclude_unset): every field that is always
present on the wire has no default, so it is always "set"; optional fields (`row_index?`,
`used?`, `concepts?`, `alt_text?`, `translation?`, `text?`) default to None and are omitted
unless the server sets them explicitly.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, TypeAdapter, field_validator

from app.constants import MAX_NAME_CHARS, MAX_SAY_TEXT_CHARS

# --------------------------------------------------------------------------- enums (§A6)

Role = Literal["flyer", "tower"]
Lang = Literal["en", "hi"]
Status = Literal[
    "LOBBY",
    "PROLOGUE",
    "PHASE_INTRO",
    "PLAYING",
    "PHASE_OUTRO",
    "ENDING",
    "CRASH",
    "DECK",
    "PAUSED",
]
StationId = Literal["overhead", "pedestal", "front"]
Verb = Literal["press", "toggle", "pull", "move_down", "move_up"]
LampColor = Literal["red", "green", "blue", "yellow"]
Side = Literal["left", "right"]
Gender = Literal["male", "female"]
ConceptId = Literal[
    "RED",
    "GREEN",
    "BLUE",
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "PRESS",
    "PULL",
    "ON",
    "OFF",
    "YES",
    "NO",
    "WHICH",
    "TIMES",
    "FIRE",
    "LEFT",
    "RIGHT",
    "YELLOW",
    "DOWN",
]
PartType = Literal[
    "PushButton",
    "ToggleSwitch",
    "PullHandle",
    "UpDownLever",
    "NotchLever",
    "Lamp",
    "FuelGauge",
    "Screen",
]
LightRig = Literal["night_alarm", "night_calm", "fire", "storm", "dawn"]
Weather = Literal["clouds_night", "rain", "storm", "rain_light", "clear_dawn"]
CinematicId = Literal[
    "prologue",
    "p1_intro",
    "p1_seat",
    "p1_outro",
    "p2_intro",
    "p2_extinguish",
    "p2_outro",
    "p3_intro",
    "lightning_strike",
    "p3_runway_reveal",
    "p3_touchdown",
    "landing",
    "ending",
    "crash",
]
ErrorCode = Literal[
    "bad_message",
    "room_not_found",
    "room_full",
    "role_taken",
    "not_joined",
    "not_allowed_now",
    "not_your_role",
    "channel_busy",
    "mock_only",
    "lifeline_not_available",
    "no_lifelines",
    "translation_failed",
    "transcribe_failed",
    "dev_disabled",
    "demo_only",
    "rate_limited",
    "internal",
]
ToastKey = Literal[
    "toast.crossover",
    "toast.partner_left",
    "toast.partner_back",
    "toast.partner_gone",
    "toast.didnt_catch",
    "toast.channel_busy",
    "toast.translation_failed",
    "toast.no_lifelines",
    "toast.info",
]
DevCmd = Literal[
    "complete_action",
    "fail_action",
    "goto_phase",
    "set_seed",
    "add_fuel",
    "bots",
    "force",
    "skip_cinematic",
]
ActionReason = Literal["wrong_object", "wrong_count", "wrong_direction", "wrong_order", "dev"]
DropReason = Literal["too_short", "no_speech", "transcribe_failed"]
BlockReason = Literal["missing_player", "same_language", "not_ready"]

ALL_ROLES: tuple[Role, Role] = ("flyer", "tower")


def other_role(role: Role) -> Role:
    """The partner's role."""
    return "tower" if role == "flyer" else "flyer"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Frozen(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def dump(model: BaseModel) -> dict[str, Any]:
    """Serialize an outbound model to a JSON-ready dict (omits unset optional fields)."""
    # Any: a JSON object leaving the process.
    return model.model_dump(mode="json", exclude_unset=True)


# --------------------------------------------------------------------- object states (§A6)


class ButtonState(_Frozen):
    kind: Literal["button"]


class ToggleState(_Frozen):
    kind: Literal["toggle"]
    value: Literal["on", "off"]


class HandleState(_Frozen):
    kind: Literal["handle"]
    value: Literal["in", "out"]


class LeverState(_Frozen):
    kind: Literal["lever"]
    value: Literal["up", "down"]


class NotchState(_Frozen):
    kind: Literal["notch"]
    value: Literal[0, 1, 2]


class LampState(_Frozen):
    kind: Literal["lamp"]
    color: LampColor | None
    blinking: bool
    attention: bool


class GaugeState(_Frozen):
    kind: Literal["gauge"]


class ScreenState(_Frozen):
    kind: Literal["screen"]
    on: bool


ObjectState = Annotated[
    ButtonState
    | ToggleState
    | HandleState
    | LeverState
    | NotchState
    | LampState
    | GaugeState
    | ScreenState,
    Field(discriminator="kind"),
]
OBJECT_STATE_ADAPTER: TypeAdapter[ObjectState] = TypeAdapter(ObjectState)

# ---------------------------------------------------------------------------- world (§A11)


def _static_level(v: float) -> float:
    if v not in (0, 0.02, 0.04):
        raise ValueError("static_level must be 0, 0.02 or 0.04")
    return v


class Pilot(_Model):
    slumped: bool
    seat_back: bool
    awake: bool


class FireState(_Model):
    side: Side | None
    level: Literal["none", "full", "half", "smoke", "wisp", "flicker"]


class World(_Model):
    light_rig: LightRig
    alarm: bool
    warning_beep: bool
    pilot: Pilot
    ap_screen: bool
    fire: FireState
    propeller_stopped: Side | None
    fire_bell: bool
    fuel_hiss: bool
    engine_hum: Literal["normal", "one_engine", "steady", "off"]
    weather: Weather
    fog: float
    turbulence: float
    static_level: Annotated[float, AfterValidator(_static_level)]
    landing_lights: bool
    runway: Literal["hidden", "far", "rolling", "stopped"]
    overhead_all_green: bool


# ----------------------------------------------------------------- client -> server (§A7)


def _clean_name(raw: str) -> str:
    no_tags = re.sub(r"<[^>]*>", "", raw)
    cleaned = no_tags.replace("<", "").replace(">", "").strip()[:MAX_NAME_CHARS].strip()
    if not cleaned:
        raise ValueError("name must have 1-16 characters")
    return cleaned


class PingMsg(_Model):
    type: Literal["ping"]
    client_ms: float


class JoinMsg(_Model):
    type: Literal["join"]
    name: Annotated[str, Field(min_length=1, max_length=64)]
    role: Role
    lang: Lang
    gender: Gender
    token: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v)


class UpdatePlayerMsg(_Model):
    type: Literal["update_player"]
    name: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    role: Role | None = None
    lang: Lang | None = None
    gender: Gender | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class ReadyMsg(_Model):
    type: Literal["ready"]
    ready: bool = True


class PttStartMsg(_Model):
    type: Literal["ptt_start"]


class PttEndMsg(_Model):
    type: Literal["ptt_end"]


class SayTextMsg(_Model):
    type: Literal["say_text"]
    text: Annotated[str, Field(min_length=1, max_length=MAX_SAY_TEXT_CHARS)]
    lang: Lang | None = None


class InteractMsg(_Model):
    type: Literal["interact"]
    object_id: Annotated[str, Field(min_length=1, max_length=64)]
    verb: Verb


class LifelineMsg(_Model):
    type: Literal["lifeline"]
    utterance_id: Annotated[str, Field(min_length=1, max_length=64)]


class SkipCinematicMsg(_Model):
    type: Literal["skip_cinematic"]


class RetryMsg(_Model):
    type: Literal["retry"]


class PlayAgainMsg(_Model):
    type: Literal["play_again"]


class SwapRolesMsg(_Model):
    type: Literal["swap_roles"]


class PresenterMsg(_Model):
    type: Literal["presenter"]
    cmd: Literal["next_action", "next_phase"]


class DevMsg(_Model):
    type: Literal["dev"]
    cmd: DevCmd
    # Any: dev args are a free-form JSON object validated per command in dev.py.
    args: dict[str, Any] | None = None


C2S = Annotated[
    PingMsg
    | JoinMsg
    | UpdatePlayerMsg
    | ReadyMsg
    | PttStartMsg
    | PttEndMsg
    | SayTextMsg
    | InteractMsg
    | LifelineMsg
    | SkipCinematicMsg
    | RetryMsg
    | PlayAgainMsg
    | SwapRolesMsg
    | PresenterMsg
    | DevMsg,
    Field(discriminator="type"),
]
C2S_ADAPTER: TypeAdapter[C2S] = TypeAdapter(C2S)
parse_c2s = C2S_ADAPTER.validate_python

# ----------------------------------------------------------------- server -> client (§A8)


class Welcome(_Model):
    type: Literal["welcome"]
    server_ms: int
    room_code: str
    mock_speech: bool
    dev_mode: bool
    demo: bool
    voice: bool
    gloss_threshold: int
    version: str


class Pong(_Model):
    type: Literal["pong"]
    client_ms: float
    server_ms: int


class Joined(_Model):
    type: Literal["joined"]
    player_id: str
    token: str
    role: Role
    lang: Lang
    gender: Gender
    name: str


class PlayerPublic(_Model):
    id: str
    name: str
    role: Role
    lang: Lang
    gender: Gender
    ready: bool
    connected: bool
    is_bot: bool


class RoomState(_Model):
    type: Literal["room_state"]
    code: str
    status: Status
    demo: bool
    mock_speech: bool
    voice: bool
    players: list[PlayerPublic]
    can_start: bool
    block_reason: BlockReason | None
    play_again_votes: list[Role]


class Radar(_Model):
    blip: Literal["green", "amber", "red"]
    icon: Literal["mayday", "fire", "smoke"] | None
    storm: bool
    runway: bool
    glide_path: bool
    progress: float
    landed: bool


class Lifelines(_Model):
    flyer: int
    tower: int


class GameState(_Model):
    type: Literal["game_state"]
    status: Status
    paused_from: Status | None
    phase: Literal[0, 1, 2, 3]
    signal_level: Literal[0, 1, 2, 3]
    action_index: int
    completed: int
    total_actions: int
    action_id: str | None
    action_active: bool
    input_locked: bool
    fuel_s: float
    fuel_max_s: float
    fuel_draining: bool
    lifelines: Lifelines
    lifelines_enabled: bool
    attempt: int
    radar: Radar
    demo: bool
    server_ms: int


class QuickLine(_Model):
    label: str
    text: str
    alt_text: str | None = None


class FlyerView(_Model):
    type: Literal["flyer_view"]
    station: StationId | None
    interactive: list[str]
    objects: dict[str, ObjectState]
    world: World
    quick_replies: list[QuickLine] | None


class Segment(_Model):
    text: str
    kind: Literal["plain", "keyword"]
    concept: ConceptId | None = None
    concepts: list[ConceptId] | None = None
    gloss: str | None = None


class SwatchColor(_Model):
    kind: Literal["color"]
    color: LampColor


class SwatchSide(_Model):
    kind: Literal["side"]
    side: Side


class SwatchYesNo(_Model):
    kind: Literal["yesno"]
    value: Literal["yes", "no"]


Swatch = Annotated[SwatchColor | SwatchSide | SwatchYesNo, Field(discriminator="kind")]


class FindOutValue(_Model):
    value: str
    label: list[Segment]
    swatch: Swatch


class FindOut(_Model):
    station_label: str
    part_label: list[Segment]
    property_label: str
    values: list[FindOutValue]


class KnownFrom(_Model):
    index: int
    text: str


class RuleWhen(_Model):
    value: str
    label: list[Segment]
    swatch: Swatch


class ControlDrawing(_Model):
    object_id: str
    type: PartType
    label: str | None
    color: str
    target: ObjectState
    count: int


class RuleRow(_Model):
    when: RuleWhen | None
    do: list[Segment]
    controls: list[ControlDrawing]
    order: Literal["single", "ordered", "unordered"]


class LastWrong(_Model):
    label: list[Segment]
    count: int


class Highlight(_Model):
    circled: list[str]
    question: list[str]


class QuickSayBranch(_Model):
    value: str
    line: QuickLine


class QuickSay(_Model):
    ask: QuickLine | None
    say: QuickLine | None
    branches: list[QuickSayBranch]


class ManualCard(_Model):
    action_id: str
    index: int
    total: int
    phase: Literal[1, 2, 3]
    station: StationId
    lang: Lang
    phase_name: str
    title: str
    find_out: FindOut | None
    known_from: KnownFrom | None
    rows: list[RuleRow]
    hint: str
    sticky: str
    own_words_note: str
    progress: list[Literal["done", "current", "upcoming"]]
    last_wrong: LastWrong | None
    stamp: Literal["emergency"] | None
    smudges: bool
    highlight: Highlight
    quick_say: QuickSay | None


class ManualCardMsg(_Model):
    type: Literal["manual_card"]
    card: ManualCard | None


CinematicParams = dict[str, str | int | float | bool]


class CinematicMsg(_Model):
    type: Literal["cinematic"]
    id: CinematicId
    start_at_ms: int
    duration_ms: int
    params: CinematicParams


class CinematicSkip(_Model):
    type: Literal["cinematic_skip"]
    id: CinematicId


class SkipVotes(_Model):
    type: Literal["skip_votes"]
    id: CinematicId
    roles: list[Role]


class CaptionPartial(_Model):
    type: Literal["caption_partial"]
    text: str


class UtteranceMsg(_Model):
    type: Literal["utterance"]
    id: str
    speaker_role: Role
    speaker_name: str
    lang: Lang
    segments: list[Segment]
    level: Literal[0, 1, 2, 3]
    lifeline_available: bool
    created_at_ms: int


class HistoryUtterance(UtteranceMsg):
    translation: str | None = None


class UtteranceEcho(_Model):
    type: Literal["utterance_echo"]
    id: str
    transcript_display: str


class UtteranceDropped(_Model):
    type: Literal["utterance_dropped"]
    reason: DropReason


class History(_Model):
    type: Literal["history"]
    utterances: list[HistoryUtterance]


class TranslationMsg(_Model):
    type: Literal["translation"]
    utterance_id: str
    text: str
    lang: Lang
    lifelines_left: int


class Used(_Model):
    object_id: str
    label: list[Segment]
    verb: Verb
    count: int


class ActionResult(_Model):
    type: Literal["action_result"]
    action_id: str
    success: bool
    reason: ActionReason | None
    fuel_delta: float
    completed_steps: int
    total_steps: int
    row_index: int | None = None
    used: Used | None = None


class ObjectStateMsg(_Model):
    type: Literal["object_state"]
    object_id: str
    state: ObjectState
    bounce: bool


class Fx(_Model):
    type: Literal["fx"]
    effects: list[str]


class ChannelMsg(_Model):
    type: Literal["channel"]
    busy_by: Role | None


class Toast(_Model):
    type: Literal["toast"]
    kind: Literal["crossover", "info", "warning", "error"]
    key: ToastKey
    params: dict[str, str | int | float]
    text: str | None = None


class Crash(_Model):
    type: Literal["crash"]
    phase: Literal[1, 2, 3]


class RetryVotes(_Model):
    type: Literal["retry_votes"]
    roles: list[Role]


class DeckWord(_Model):
    concept: ConceptId
    word: str
    meaning: str
    meaning_script: Literal["latin", "deva"]
    understood: int
    spoken: int
    learned: bool
    clip_url: str | None


class PhaseStatsOut(_Model):
    phase: Literal[1, 2, 3]
    fuel_left_s: float
    wrong_actions: int
    lifelines_used: int
    attempts: int
    time_s: float


class LifelinesUsed(_Model):
    mine: int
    partner: int


class Stats(_Model):
    phases: list[PhaseStatsOut]
    wrong_actions_total: int
    lifelines_used: LifelinesUsed
    total_time_s: float
    fuel_left_final_s: float


class DeckMsg(_Model):
    type: Literal["deck"]
    partner_name: str
    partner_lang: Lang
    partner_gender: Gender
    learned_count: int
    words: list[DeckWord]
    report: str | None
    report_pending: bool
    stats: Stats


class DeckReport(_Model):
    type: Literal["deck_report"]
    report: str


class ErrorMsg(_Model):
    type: Literal["error"]
    code: ErrorCode
    message: str


# ------------------------------------------------------------------------ dev_state (§A13)


class DevExpected(_Model):
    object: str
    verb: Verb
    value: str | None = None
    count: int | None = None
    done: bool


class DevPending(_Model):
    object: str
    count: int


class DevBots(_Model):
    flyer: bool
    tower: bool


class ConceptCounters(_Model):
    heard: int
    glossed: int
    understood: int
    spoken: int


class DevExposure(_Model):
    name: str
    role: Role
    concepts: dict[ConceptId, ConceptCounters]


class DevMatch(_Model):
    start: int
    end: int
    concepts: list[ConceptId]
    side: Literal["speaker", "listener"]


class DevLastUtterance(_Model):
    id: str
    speaker_role: Role
    transcript: str
    matches: list[DevMatch]
    segments: list[Segment]
    latency_ms: int | None


class DevState(_Model):
    type: Literal["dev_state"]
    room: str
    status: Status
    phase: int
    action_id: str | None
    seed: int
    vars: dict[str, str]
    forced: dict[str, str]
    expected: list[DevExpected]
    unordered: bool
    pending: DevPending | None
    fuel_s: float
    bots: DevBots
    exposure: dict[str, DevExposure]
    last_utterance: DevLastUtterance | None
    latencies_ms: list[int]


S2C = Annotated[
    Welcome
    | Pong
    | Joined
    | RoomState
    | GameState
    | FlyerView
    | ManualCardMsg
    | CinematicMsg
    | CinematicSkip
    | SkipVotes
    | CaptionPartial
    | UtteranceMsg
    | UtteranceEcho
    | UtteranceDropped
    | History
    | TranslationMsg
    | ActionResult
    | ObjectStateMsg
    | Fx
    | ChannelMsg
    | Toast
    | Crash
    | RetryVotes
    | DeckMsg
    | DeckReport
    | ErrorMsg
    | DevState,
    Field(discriminator="type"),
]
S2C_ADAPTER: TypeAdapter[S2C] = TypeAdapter(S2C)
