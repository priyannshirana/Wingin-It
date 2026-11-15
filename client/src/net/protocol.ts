// Wire types for the Wingin' it! WebSocket protocol.
// A verbatim TypeScript copy of the shared contract (docs/FRONTEND_SPEC.md Part A):
// §A6 enums and ids, §A7 client → server, §A8 server → client, §A10 CinematicId,
// §A11 World, §A13 dev_state, §A15 error codes. Do not add, rename or drop fields here:
// any change must be made in Part A of both specs first.

// ---------------------------------------------------------------------------
// §A6 Enums and ids
// ---------------------------------------------------------------------------

export type Role = "flyer" | "tower";
export type Lang = "en" | "hi";
export type Status =
  | "LOBBY"
  | "PROLOGUE"
  | "PHASE_INTRO"
  | "PLAYING"
  | "PHASE_OUTRO"
  | "ENDING"
  | "CRASH"
  | "DECK"
  | "PAUSED";
export type PhaseNo = 1 | 2 | 3;
export type SignalLevel = 1 | 2 | 3; // == phase number while playing
export type StationId = "overhead" | "pedestal" | "front";
export type Verb = "press" | "toggle" | "pull" | "move_down" | "move_up";
export type LampColor = "red" | "green" | "blue" | "yellow";
export type Side = "left" | "right";
export type Gender = "male" | "female"; // the player's character for their role (avatar + Hindi grammar)

export type ConceptId =
  | "RED"
  | "GREEN"
  | "BLUE"
  | "ONE"
  | "TWO"
  | "THREE"
  | "FOUR"
  | "PRESS"
  | "PULL"
  | "ON"
  | "OFF"
  | "YES"
  | "NO"
  | "WHICH"
  | "TIMES" // phase 1 (15)
  | "FIRE"
  | "LEFT"
  | "RIGHT"
  | "YELLOW"
  | "DOWN"; // phase 2 (5)

export type PartType =
  | "PushButton"
  | "ToggleSwitch"
  | "PullHandle"
  | "UpDownLever"
  | "NotchLever"
  | "Lamp"
  | "FuelGauge"
  | "Screen";

export type LightRig = "night_alarm" | "night_calm" | "fire" | "storm" | "dawn";
export type Weather = "clouds_night" | "rain" | "storm" | "rain_light" | "clear_dawn";

/** Object states (tagged union on `kind`). */
export type ObjectState =
  | { kind: "button" } // PushButton: no persistent state
  | { kind: "toggle"; value: "on" | "off" } // ToggleSwitch (bat up = on)
  | { kind: "handle"; value: "in" | "out" } // PullHandle
  | { kind: "lever"; value: "up" | "down" } // UpDownLever
  | { kind: "notch"; value: 0 | 1 | 2 } // NotchLever
  | { kind: "lamp"; color: LampColor | null; blinking: boolean; attention: boolean }
  | { kind: "gauge" } // FuelGauge reads game_state.fuel_s
  | { kind: "screen"; on: boolean }; // decorative screens (AP screen)

// ---------------------------------------------------------------------------
// §A7 Client → server messages
// ---------------------------------------------------------------------------

export type C2S =
  | { type: "ping"; client_ms: number }
  | { type: "join"; name: string; role: Role; lang: Lang; gender: Gender; token?: string }
  | { type: "update_player"; name?: string; role?: Role; lang?: Lang; gender?: Gender } // LOBBY only [ASSUMPTION]
  | { type: "ready"; ready?: boolean } // default true
  | { type: "ptt_start" }
  | { type: "ptt_end" }
  | { type: "say_text"; text: string; lang?: Lang } // Mock/Dev/Demo only; lang defaults to the player's
  | { type: "interact"; object_id: string; verb: Verb } // flyer only
  | { type: "lifeline"; utterance_id: string } // phase 3 only
  | { type: "skip_cinematic" }
  | { type: "retry" } // CRASH only
  | { type: "play_again" } // DECK only [ASSUMPTION]
  | { type: "swap_roles" } // DECK only [ASSUMPTION]
  | { type: "presenter"; cmd: "next_action" | "next_phase" } // demo rooms only
  | { type: "dev"; cmd: DevCmd; args?: Record<string, unknown> }; // DEV_MODE only

export type DevCmd =
  | "complete_action" // succeed the current action as if done right
  | "fail_action" // count one wrong action (buzzer, -10 s)
  | "goto_phase" // args {phase: 1|2|3}: jump to PHASE_INTRO(n)
  | "set_seed" // args {seed: number}: LOBBY = next game; in game = restart current phase
  | "add_fuel" // args {seconds: number} (default 60)
  | "bots" // args {flyer?: boolean, tower?: boolean}
  | "force" // args {var: string, value: string}: next roll of var returns value
  | "skip_cinematic"; // force-skip without the partner's vote

// ---------------------------------------------------------------------------
// §A8 Server → client messages
// ---------------------------------------------------------------------------

export type S2C =
  | Welcome
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
  | DevState;

export interface Welcome {
  type: "welcome";
  server_ms: number;
  room_code: string;
  mock_speech: boolean;
  dev_mode: boolean;
  demo: boolean;
  voice: boolean; // voice room: the partner's live audio arrives as binary frames
  gloss_threshold: number;
  version: string;
}
export interface Pong {
  type: "pong";
  client_ms: number;
  server_ms: number;
}
export interface Joined {
  type: "joined";
  player_id: string;
  token: string;
  role: Role;
  lang: Lang;
  gender: Gender;
  name: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  role: Role;
  lang: Lang;
  gender: Gender;
  ready: boolean;
  connected: boolean;
  is_bot: boolean;
}
export interface RoomState {
  type: "room_state";
  code: string;
  status: Status;
  demo: boolean;
  mock_speech: boolean;
  voice: boolean;
  players: PlayerPublic[];
  can_start: boolean;
  block_reason: null | "missing_player" | "same_language" | "not_ready";
  play_again_votes: Role[];
}

export interface Radar {
  blip: "green" | "amber" | "red";
  icon: null | "mayday" | "fire" | "smoke";
  storm: boolean; // storm clouds drawn on the radar (phase 2 outro onward)
  runway: boolean; // runway icon visible (phase 3)
  glide_path: boolean; // glide-path line (phase 3)
  progress: number; // 0..1, plane blip position along the route (= completed actions / total, per phase)
  landed: boolean;
}
export interface GameState {
  type: "game_state";
  status: Status;
  paused_from: Status | null;
  phase: 0 | PhaseNo; // 0 before phase 1 starts
  signal_level: 0 | SignalLevel;
  action_index: number; // 0-based; -1 when no action
  completed: number; // actions done in this phase
  total_actions: number;
  action_id: string | null; // e.g. "P1_A1" (not secret)
  action_active: boolean; // false during the 1.5 s gap, cinematics and events
  input_locked: boolean; // true while any cinematic/event runs
  fuel_s: number; // one decimal
  fuel_max_s: number;
  fuel_draining: boolean;
  lifelines: { flyer: number; tower: number };
  lifelines_enabled: boolean; // phase 3 PLAYING only
  attempt: number; // 1 + retries of this phase
  radar: Radar;
  demo: boolean;
  server_ms: number;
}

export interface FlyerView {
  type: "flyer_view";
  station: StationId | null; // current station (null outside phases)
  interactive: string[]; // ids clickable right now
  objects: Record<string, ObjectState>; // every object on all three stations
  world: World; // see A11
  quick_replies: QuickLine[] | null; // Mock/Dev only
}

export interface ManualCardMsg {
  type: "manual_card";
  card: ManualCard | null; // null = manual closed (cover page)
}
export interface ManualCard {
  action_id: string;
  index: number;
  total: number;
  phase: PhaseNo;
  station: StationId;
  lang: Lang;
  phase_name: string; // "पायलट बेहोश"
  title: string; // short module title, e.g. "ऑटोपायलट लाइट"
  find_out: FindOut | null; // null for say-only and branch_on actions
  known_from: { index: number; text: string } | null; // branch_on: "यह आपने कदम 1 में पता किया"
  rows: RuleRow[]; // same order as content branches; one row for say-only
  hint: string; // handwritten hint under the drawing
  sticky: string; // yellow sticky note
  own_words_note: string; // "अपने शब्दों में पूछो" (observe) / "अपने शब्दों में बोलो" (say-only)
  progress: ("done" | "current" | "upcoming")[];
  last_wrong: { label: Segment[]; count: number } | null;
  stamp: null | "emergency"; // phase 2 pages
  smudges: boolean; // phase 3 pages
  highlight: { circled: string[]; question: string[] }; // object ids on the drawing
  quick_say: QuickSay | null; // Mock/Dev only
}
export interface FindOut {
  station_label: string;
  part_label: Segment[];
  property_label: string;
  values: { value: string; label: Segment[]; swatch: Swatch }[];
}
export interface RuleRow {
  when: { value: string; label: Segment[]; swatch: Swatch } | null;
  do: Segment[];
  controls: ControlDrawing[];
  order: "single" | "ordered" | "unordered";
}
export interface ControlDrawing {
  object_id: string;
  type: PartType;
  label: string | null;
  color: string;
  target: ObjectState;
  count: number;
}
export type Swatch =
  | { kind: "color"; color: LampColor }
  | { kind: "side"; side: Side }
  | { kind: "yesno"; value: "yes" | "no" };
export interface QuickLine {
  label: string;
  text: string;
  alt_text?: string; // text = roman/en, alt_text = Devanagari
}
export interface QuickSay {
  ask: QuickLine | null;
  say: QuickLine | null;
  branches: { value: string; line: QuickLine }[];
}

export interface CinematicMsg {
  type: "cinematic";
  id: CinematicId;
  start_at_ms: number;
  duration_ms: number;
  params: Record<string, string | number | boolean>; // params are role-filtered (A10)
}
export interface CinematicSkip {
  type: "cinematic_skip";
  id: CinematicId;
}
export interface SkipVotes {
  type: "skip_votes";
  id: CinematicId;
  roles: Role[];
}

export interface Segment {
  text: string;
  kind: "plain" | "keyword";
  concept?: ConceptId;
  concepts?: ConceptId[]; // concepts only when one token = 2 concepts ("twice")
  gloss?: string | null;
}
export interface CaptionPartial {
  type: "caption_partial";
  text: string; // speaker only, Latin
}
export interface UtteranceMsg {
  type: "utterance";
  id: string;
  speaker_role: Role;
  speaker_name: string;
  lang: Lang;
  segments: Segment[];
  level: SignalLevel | 0;
  lifeline_available: boolean;
  created_at_ms: number;
}
export interface UtteranceEcho {
  type: "utterance_echo";
  id: string;
  transcript_display: string;
}
export interface UtteranceDropped {
  type: "utterance_dropped";
  reason: "too_short" | "no_speech" | "transcribe_failed";
}
export interface History {
  type: "history";
  utterances: (UtteranceMsg & { translation?: string })[]; // last 5 from partner
}
export interface TranslationMsg {
  type: "translation";
  utterance_id: string;
  text: string;
  lang: Lang;
  lifelines_left: number;
}

export interface ActionResult {
  type: "action_result";
  action_id: string;
  success: boolean;
  reason: null | "wrong_object" | "wrong_count" | "wrong_direction" | "wrong_order" | "dev";
  fuel_delta: number; // 0 on success, -10 on wrong
  completed_steps: number;
  total_steps: number;
  row_index?: number; // tower only, success only
  used?: { object_id: string; label: Segment[]; verb: Verb; count: number }; // tower only, failure only
}
export interface ObjectStateMsg {
  type: "object_state";
  object_id: string;
  state: ObjectState;
  bounce: boolean;
}
export interface Fx {
  type: "fx";
  effects: string[]; // role-filtered one-shots, grammar in A12
}
export interface ChannelMsg {
  type: "channel";
  busy_by: Role | null;
}
export interface Toast {
  type: "toast";
  kind: "crossover" | "info" | "warning" | "error";
  key: ToastKey;
  params: Record<string, string | number>;
  text?: string; // text = English fallback for logs
}
export type ToastKey =
  | "toast.crossover" // params {word}: "CROSSOVER! +5s"
  | "toast.partner_left"
  | "toast.partner_back"
  | "toast.partner_gone"
  | "toast.didnt_catch"
  | "toast.channel_busy"
  | "toast.translation_failed"
  | "toast.no_lifelines"
  | "toast.info"; // toast.info params {text}
export interface Crash {
  type: "crash";
  phase: PhaseNo;
}
export interface RetryVotes {
  type: "retry_votes";
  roles: Role[];
}

export interface DeckMsg {
  type: "deck";
  partner_name: string;
  partner_lang: Lang;
  partner_gender: Gender;
  learned_count: number;
  words: DeckWord[];
  report: string | null;
  report_pending: boolean;
  stats: Stats;
}
export interface DeckWord {
  concept: ConceptId;
  word: string; // partner-language word, Latin (romanized if Hindi)
  meaning: string;
  meaning_script: "latin" | "deva"; // meaning in the player's own language/script
  understood: number;
  spoken: number;
  learned: boolean;
  clip_url: string | null;
}
export interface Stats {
  phases: {
    phase: PhaseNo;
    fuel_left_s: number;
    wrong_actions: number;
    lifelines_used: number;
    attempts: number;
    time_s: number;
  }[];
  wrong_actions_total: number;
  lifelines_used: { mine: number; partner: number };
  total_time_s: number;
  fuel_left_final_s: number;
}
export interface DeckReport {
  type: "deck_report";
  report: string;
}
export interface ErrorMsg {
  type: "error";
  code: ErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// §A10 Cinematics: `type CinematicId` = the keys of content/cinematics.json
// ---------------------------------------------------------------------------

export type CinematicId =
  | "prologue"
  | "p1_intro"
  | "p1_seat"
  | "p1_outro"
  | "p2_intro"
  | "p2_extinguish"
  | "p2_outro"
  | "p3_intro"
  | "lightning_strike"
  | "p3_runway_reveal"
  | "p3_touchdown"
  | "landing"
  | "ending"
  | "crash";

// ---------------------------------------------------------------------------
// §A11 The `World` object (Flyer's persistent scene state)
// ---------------------------------------------------------------------------

export interface World {
  light_rig: LightRig;
  alarm: boolean; // alarm_master loop + red pulse
  warning_beep: boolean; // warning_beep loop (P1_A4)
  pilot: { slumped: boolean; seat_back: boolean; awake: boolean };
  ap_screen: boolean; // OH autopilot screen booted
  fire: { side: Side | null; level: "none" | "full" | "half" | "smoke" | "wisp" | "flicker" };
  propeller_stopped: Side | null;
  fire_bell: boolean;
  fuel_hiss: boolean;
  engine_hum: "normal" | "one_engine" | "steady" | "off";
  weather: Weather;
  fog: number; // FogExp2 density
  turbulence: number; // resting camera shake 0 or 0.15
  static_level: 0 | 0.02 | 0.04; // radio static gain (also used by the Tower via signal level)
  landing_lights: boolean;
  runway: "hidden" | "far" | "rolling" | "stopped";
  overhead_all_green: boolean; // set by p1_outro
}

// ---------------------------------------------------------------------------
// §A13 `dev_state` (Dev Mode only)
// ---------------------------------------------------------------------------

export interface DevState {
  type: "dev_state";
  room: string;
  status: Status;
  phase: number;
  action_id: string | null;
  seed: number;
  vars: Record<string, string>; // rolled values incl. phase vars
  forced: Record<string, string>;
  expected: { object: string; verb: Verb; value?: string; count?: number; done: boolean }[];
  unordered: boolean;
  pending: { object: string; count: number } | null;
  fuel_s: number;
  bots: { flyer: boolean; tower: boolean };
  exposure: Record<
    string /*player_id*/,
    {
      name: string;
      role: Role;
      concepts: Record<
        ConceptId,
        { heard: number; glossed: number; understood: number; spoken: number }
      >;
    }
  >;
  last_utterance: null | {
    id: string;
    speaker_role: Role;
    transcript: string;
    matches: {
      start: number;
      end: number;
      concepts: ConceptId[];
      side: "speaker" | "listener";
    }[];
    segments: Segment[];
    latency_ms: number | null;
  };
  latencies_ms: number[]; // last 20 release→subtitle latencies
}

// ---------------------------------------------------------------------------
// §A15 Error codes
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "bad_message"
  | "room_not_found"
  | "room_full"
  | "role_taken"
  | "not_joined"
  | "not_allowed_now" // wrong state for this intent
  | "not_your_role"
  | "channel_busy"
  | "mock_only" // say_text when not allowed
  | "lifeline_not_available" // not phase 3 / not partner's / outside the last 3
  | "no_lifelines"
  | "translation_failed" // lifeline not spent
  | "transcribe_failed"
  | "dev_disabled"
  | "demo_only"
  | "rate_limited"
  | "internal";
