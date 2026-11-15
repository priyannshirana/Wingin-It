// Typed builders for the Part A server → client messages the fake server sends (§A8). Every
// builder returns a full message typed from src/net/protocol.ts; `over` patches fields.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ActionResult,
  ChannelMsg,
  CinematicId,
  CinematicMsg,
  CinematicSkip,
  ConceptId,
  DeckMsg,
  DeckWord,
  DevState,
  ErrorCode,
  ErrorMsg,
  FlyerView,
  GameState,
  Gender,
  History,
  Joined,
  Lang,
  ManualCard,
  ManualCardMsg,
  ObjectState,
  ObjectStateMsg,
  PartType,
  PhaseNo,
  PlayerPublic,
  Pong,
  QuickLine,
  Radar,
  Role,
  RoomState,
  Segment,
  SkipVotes,
  StationId,
  Toast,
  ToastKey,
  TranslationMsg,
  UtteranceEcho,
  UtteranceMsg,
  Verb,
  Welcome,
  World,
} from "../../src/net/protocol";

// ---------------------------------------------------------------------------
// Content (only the two non-secret files, §A2 rule 2)
// ---------------------------------------------------------------------------

const contentPath = (file: string) =>
  fileURLToPath(new URL(`../../../content/${file}`, import.meta.url));

export interface StationControl {
  id: string;
  type: PartType;
  default: ObjectState;
}

const PART_TYPES: readonly PartType[] = [
  "PushButton",
  "ToggleSwitch",
  "PullHandle",
  "UpDownLever",
  "NotchLever",
  "Lamp",
  "FuelGauge",
  "Screen",
];
const STATION_IDS: readonly StationId[] = ["overhead", "pedestal", "front"];

const get = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;

/** stations.json `default` → ObjectState, checked field by field (no casts). */
function toObjectState(v: unknown): ObjectState {
  const kind = get(v, "kind");
  const value = get(v, "value");
  switch (kind) {
    case "button":
      return { kind };
    case "gauge":
      return { kind };
    case "screen":
      return { kind, on: get(v, "on") === true };
    case "toggle":
      return { kind, value: value === "on" ? "on" : "off" };
    case "handle":
      return { kind, value: value === "out" ? "out" : "in" };
    case "lever":
      return { kind, value: value === "down" ? "down" : "up" };
    case "notch":
      return { kind, value: value === 2 ? 2 : value === 1 ? 1 : 0 };
    case "lamp":
      return { kind, color: null, blinking: false, attention: false };
    default:
      throw new Error(`stations.json: unknown object state ${JSON.stringify(v)}`);
  }
}

function loadStations(): Record<StationId, StationControl[]> {
  const file: unknown = JSON.parse(readFileSync(contentPath("stations.json"), "utf8"));
  const list = get(file, "stations");
  if (!Array.isArray(list)) throw new Error("stations.json: no stations array");
  const out: Record<StationId, StationControl[]> = { overhead: [], pedestal: [], front: [] };
  for (const station of list) {
    const id = STATION_IDS.find((s) => s === get(station, "id"));
    const controls = get(station, "controls");
    if (!id || !Array.isArray(controls)) throw new Error("stations.json: bad station");
    for (const c of controls) {
      const cid = get(c, "id");
      const type = PART_TYPES.find((t) => t === get(c, "type"));
      if (typeof cid !== "string" || !type) throw new Error("stations.json: bad control");
      out[id].push({ id: cid, type, default: toObjectState(get(c, "default")) });
    }
  }
  return out;
}

export const STATIONS = loadStations();

function loadDurations(): Record<CinematicId, number> {
  const file: unknown = JSON.parse(readFileSync(contentPath("cinematics.json"), "utf8"));
  const cins = get(file, "cinematics");
  const ids: CinematicId[] = [
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
  ];
  const out: Partial<Record<CinematicId, number>> = {};
  for (const id of ids) {
    const ms = get(get(cins, id), "duration_ms");
    if (typeof ms !== "number") throw new Error(`cinematics.json: no duration for ${id}`);
    out[id] = ms;
  }
  return {
    prologue: out.prologue ?? 0,
    p1_intro: out.p1_intro ?? 0,
    p1_seat: out.p1_seat ?? 0,
    p1_outro: out.p1_outro ?? 0,
    p2_intro: out.p2_intro ?? 0,
    p2_extinguish: out.p2_extinguish ?? 0,
    p2_outro: out.p2_outro ?? 0,
    p3_intro: out.p3_intro ?? 0,
    lightning_strike: out.lightning_strike ?? 0,
    p3_runway_reveal: out.p3_runway_reveal ?? 0,
    p3_touchdown: out.p3_touchdown ?? 0,
    landing: out.landing ?? 0,
    ending: out.ending ?? 0,
    crash: out.crash ?? 0,
  };
}

/** `duration_ms` per cinematic, from content/cinematics.json (both sides read the same file). */
export const DURATIONS = loadDurations();

export const STATION_OF: Record<PhaseNo, StationId> = { 1: "overhead", 2: "pedestal", 3: "front" };

/** Every object on all three stations at its stations.json default (flyer_view.objects). */
export function defaultObjects(): Record<string, ObjectState> {
  const out: Record<string, ObjectState> = {};
  for (const id of STATION_IDS) for (const c of STATIONS[id]) out[c.id] = c.default;
  return out;
}

/** Clickable ids on a station: everything except lamps, gauges and screens (§A6). */
export function clickableIds(station: StationId): string[] {
  return STATIONS[station]
    .filter((c) => c.type !== "Lamp" && c.type !== "FuelGauge" && c.type !== "Screen")
    .map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Handshake and lobby (§A5, §A8)
// ---------------------------------------------------------------------------

export const welcome = (over: Partial<Welcome> = {}): Welcome => ({
  type: "welcome",
  server_ms: Date.now(),
  room_code: "TEST",
  mock_speech: true,
  dev_mode: true,
  demo: false,
  gloss_threshold: 2,
  version: "0.1.0",
  ...over,
});

export const pong = (client_ms: number): Pong => ({
  type: "pong",
  client_ms,
  server_ms: Date.now(),
});

export const joined = (p: PlayerPublic, token: string): Joined => ({
  type: "joined",
  player_id: p.id,
  token,
  role: p.role,
  lang: p.lang,
  gender: p.gender,
  name: p.name,
});

export const player = (over: Partial<PlayerPublic> = {}): PlayerPublic => ({
  id: "p1",
  name: "Flyer",
  role: "flyer",
  lang: "en",
  gender: "female",
  ready: false,
  connected: true,
  is_bot: false,
  ...over,
});

export const roomState = (over: Partial<RoomState> = {}): RoomState => ({
  type: "room_state",
  code: "TEST",
  status: "LOBBY",
  demo: false,
  mock_speech: true,
  players: [],
  can_start: false,
  block_reason: "missing_player",
  play_again_votes: [],
  ...over,
});

// ---------------------------------------------------------------------------
// Game state and the Flyer's view (§A8, §A11)
// ---------------------------------------------------------------------------

export const radar = (over: Partial<Radar> = {}): Radar => ({
  blip: "green",
  icon: null,
  storm: false,
  runway: false,
  glide_path: false,
  progress: 0,
  landed: false,
  ...over,
});

export const gameState = (over: Partial<GameState> = {}): GameState => ({
  type: "game_state",
  status: "PROLOGUE",
  paused_from: null,
  phase: 0,
  signal_level: 0,
  action_index: -1,
  completed: 0,
  total_actions: 0,
  action_id: null,
  action_active: false,
  input_locked: false,
  fuel_s: 150,
  fuel_max_s: 150,
  fuel_draining: false,
  lifelines: { flyer: 3, tower: 3 },
  lifelines_enabled: false,
  attempt: 1,
  radar: radar(),
  demo: false,
  server_ms: Date.now(),
  ...over,
});

const BASE_WORLD: World = {
  light_rig: "night_calm",
  alarm: false,
  warning_beep: false,
  pilot: { slumped: false, seat_back: false, awake: true },
  ap_screen: false,
  fire: { side: null, level: "none" },
  propeller_stopped: null,
  fire_bell: false,
  fuel_hiss: false,
  engine_hum: "normal",
  weather: "clouds_night",
  fog: 0.004,
  turbulence: 0,
  static_level: 0,
  landing_lights: false,
  runway: "hidden",
  overhead_all_green: false,
};

/** The §A11 phase start worlds (0 = lobby, 4 = after `landing`). The fire is on the right. */
export function worldFor(phase: 0 | PhaseNo | 4): World {
  switch (phase) {
    case 0:
      return BASE_WORLD;
    case 1:
      return {
        ...BASE_WORLD,
        light_rig: "night_alarm",
        alarm: true,
        pilot: { slumped: true, seat_back: false, awake: false },
      };
    case 2:
      return {
        ...BASE_WORLD,
        light_rig: "fire",
        pilot: { slumped: true, seat_back: true, awake: false },
        ap_screen: true,
        fire: { side: "right", level: "full" },
        fire_bell: true,
        fuel_hiss: true,
        fog: 0.006,
        static_level: 0.02,
        overhead_all_green: true,
      };
    case 3:
      return {
        ...BASE_WORLD,
        light_rig: "storm",
        pilot: { slumped: true, seat_back: true, awake: false },
        ap_screen: true,
        fire: { side: "right", level: "wisp" },
        propeller_stopped: "right",
        engine_hum: "one_engine",
        weather: "storm",
        fog: 0.035,
        turbulence: 0.15,
        static_level: 0.04,
        overhead_all_green: true,
      };
    case 4:
      return {
        ...BASE_WORLD,
        light_rig: "dawn",
        pilot: { slumped: false, seat_back: true, awake: true },
        ap_screen: true,
        fire: { side: "right", level: "wisp" },
        propeller_stopped: "right",
        engine_hum: "off",
        weather: "clear_dawn",
        landing_lights: true,
        runway: "stopped",
        overhead_all_green: true,
      };
    default:
      return BASE_WORLD;
  }
}

export const flyerView = (over: Partial<FlyerView> = {}): FlyerView => ({
  type: "flyer_view",
  station: null,
  interactive: [],
  objects: defaultObjects(),
  world: worldFor(0),
  quick_replies: null,
  ...over,
});

export const objectState = (
  object_id: string,
  state: ObjectState,
  bounce: boolean,
): ObjectStateMsg => ({
  type: "object_state",
  object_id,
  state,
  bounce,
});

// ---------------------------------------------------------------------------
// The manual (Tower only, §A8 ManualCardMsg)
// ---------------------------------------------------------------------------

export const manualCardMsg = (card: ManualCard | null): ManualCardMsg => ({
  type: "manual_card",
  card,
});

export const plain = (text: string): Segment => ({ text, kind: "plain" });

export interface CardInput {
  action_id: string;
  index: number;
  total: number;
  phase: PhaseNo;
  lang: Lang;
  /** The control the rule row draws (the expected one). */
  control: StationControl;
  verb: Verb;
  quick?: QuickLine;
  lastWrong?: ManualCard["last_wrong"];
}

const PHASE_NAMES: Record<PhaseNo, Record<Lang, string>> = {
  1: { en: "Pilot Down", hi: "पायलट बेहोश" },
  2: { en: "Engine Fire", hi: "इंजन में आग" },
  3: { en: "Storm Landing", hi: "तूफ़ान में लैंडिंग" },
};

/** A say-only style card with one rule row that draws the expected control. Localized by `lang`. */
export function manualCard(c: CardInput): ManualCard {
  const hi = c.lang === "hi";
  const target: ObjectState =
    c.control.default.kind === "toggle"
      ? { kind: "toggle", value: c.control.default.value === "on" ? "off" : "on" }
      : c.control.default.kind === "handle"
        ? { kind: "handle", value: "out" }
        : c.control.default;
  return {
    action_id: c.action_id,
    index: c.index,
    total: c.total,
    phase: c.phase,
    station: STATION_OF[c.phase],
    lang: c.lang,
    phase_name: PHASE_NAMES[c.phase][c.lang],
    title: hi ? `कदम ${c.index + 1}` : `Step ${c.index + 1}`,
    find_out: null,
    known_from: null,
    rows: [
      {
        when: null,
        do: [plain(hi ? `${c.control.id} इस्तेमाल करो` : `Use ${c.control.id}`)],
        controls: [
          {
            object_id: c.control.id,
            type: c.control.type,
            label: null,
            color: "grey",
            target,
            count: 1,
          },
        ],
        order: "single",
      },
    ],
    hint: hi ? "ध्यान से बोलो" : "Say it slowly",
    sticky: hi ? "शांत रहो!" : "Stay calm!",
    own_words_note: hi ? "अपने शब्दों में बोलो" : "Say it in your own words",
    progress: Array.from({ length: c.total }, (_, i) =>
      i < c.index ? "done" : i === c.index ? "current" : "upcoming",
    ),
    last_wrong: c.lastWrong ?? null,
    stamp: c.phase === 2 ? "emergency" : null,
    smudges: c.phase === 3,
    highlight: { circled: [c.control.id], question: [] },
    quick_say: c.quick ? { ask: null, say: c.quick, branches: [] } : null,
  };
}

// ---------------------------------------------------------------------------
// Cinematics (§A10)
// ---------------------------------------------------------------------------

export const cinematic = (
  id: CinematicId,
  params: CinematicMsg["params"] = {},
  over: Partial<CinematicMsg> = {},
): CinematicMsg => ({
  type: "cinematic",
  id,
  start_at_ms: Date.now() + 300,
  duration_ms: DURATIONS[id],
  params,
  ...over,
});

export const cinematicSkip = (id: CinematicId): CinematicSkip => ({ type: "cinematic_skip", id });
export const skipVotes = (id: CinematicId, roles: Role[]): SkipVotes => ({
  type: "skip_votes",
  id,
  roles,
});

// ---------------------------------------------------------------------------
// Talk (§A8, §A16)
// ---------------------------------------------------------------------------

/** A tiny keyword list so subtitles get chips (Latin forms only, §A2 rule 3). */
const KEYWORDS: Record<string, ConceptId> = {
  red: "RED",
  laal: "RED",
  blue: "BLUE",
  neela: "BLUE",
  one: "ONE",
  ek: "ONE",
  three: "THREE",
  teen: "THREE",
  press: "PRESS",
  dabao: "PRESS",
  pull: "PULL",
  kheencho: "PULL",
  yes: "YES",
  haan: "YES",
};

const GLOSS: Record<ConceptId, Record<Lang, string>> = {
  RED: { en: "red", hi: "laal" },
  BLUE: { en: "blue", hi: "neela" },
  ONE: { en: "one", hi: "ek" },
  THREE: { en: "three", hi: "teen" },
  PRESS: { en: "press", hi: "dabao" },
  PULL: { en: "pull", hi: "kheencho" },
  YES: { en: "yes", hi: "haan" },
  GREEN: { en: "green", hi: "hara" },
  TWO: { en: "two", hi: "do" },
  FOUR: { en: "four", hi: "chaar" },
  ON: { en: "on", hi: "chalu" },
  OFF: { en: "off", hi: "band" },
  NO: { en: "no", hi: "nahi" },
  WHICH: { en: "which", hi: "kaun sa" },
  TIMES: { en: "times", hi: "baar" },
  FIRE: { en: "fire", hi: "aag" },
  LEFT: { en: "left", hi: "baayan" },
  RIGHT: { en: "right", hi: "daayan" },
  YELLOW: { en: "yellow", hi: "peela" },
  DOWN: { en: "down", hi: "neeche" },
};

/**
 * Words → segments for a listener: keywords become chips; level 1 glosses every keyword in the
 * listener's language, levels 2 and 3 gloss nothing (good enough for the fake).
 */
export function segmentsFor(text: string, level: number, listenerLang: Lang): Segment[] {
  const out: Segment[] = [];
  const words = text.split(/(\s+)/);
  for (const w of words) {
    const concept = KEYWORDS[w.toLowerCase().replace(/[^a-z]/g, "")];
    if (concept) {
      out.push({
        text: w,
        kind: "keyword",
        concept,
        gloss: level === 1 ? GLOSS[concept][listenerLang] : null,
      });
    } else if (w) {
      const last = out[out.length - 1];
      if (last && last.kind === "plain") last.text += w;
      else out.push(plain(w));
    }
  }
  return out;
}

export const utterance = (over: Partial<UtteranceMsg> = {}): UtteranceMsg => ({
  type: "utterance",
  id: "u1",
  speaker_role: "tower",
  speaker_name: "Tower",
  lang: "hi",
  segments: [plain("namaste")],
  level: 1,
  lifeline_available: false,
  created_at_ms: Date.now(),
  ...over,
});

export const utteranceEcho = (id: string, transcript_display: string): UtteranceEcho => ({
  type: "utterance_echo",
  id,
  transcript_display,
});

export const history = (utterances: History["utterances"]): History => ({
  type: "history",
  utterances,
});

export const translation = (
  utterance_id: string,
  text: string,
  lang: Lang,
  lifelines_left: number,
): TranslationMsg => ({ type: "translation", utterance_id, text, lang, lifelines_left });

export const channel = (busy_by: Role | null): ChannelMsg => ({ type: "channel", busy_by });

// ---------------------------------------------------------------------------
// Results, toasts, errors (§A8, §A15)
// ---------------------------------------------------------------------------

export const actionResult = (over: Partial<ActionResult> = {}): ActionResult => ({
  type: "action_result",
  action_id: "P1_A1",
  success: true,
  reason: null,
  fuel_delta: 0,
  completed_steps: 1,
  total_steps: 1,
  ...over,
});

export const toast = (
  key: ToastKey,
  params: Toast["params"] = {},
  kind: Toast["kind"] = "info",
): Toast => ({ type: "toast", kind, key, params });

export const errorMsg = (code: ErrorCode, message: string = code): ErrorMsg => ({
  type: "error",
  code,
  message,
});

// ---------------------------------------------------------------------------
// The deck (§A8 DeckMsg)
// ---------------------------------------------------------------------------

/** A deck for `viewer` whose partner speaks `partnerLang`: RED and PRESS learned. */
export function deck(
  viewerLang: Lang,
  partner: { name: string; lang: Lang; gender: Gender },
): DeckMsg {
  const concepts: ConceptId[] = ["RED", "PRESS", "BLUE", "PULL"];
  const words: DeckWord[] = concepts.map((concept, i) => ({
    concept,
    word: GLOSS[concept][partner.lang],
    meaning: viewerLang === "hi" ? `(${GLOSS[concept].hi})` : GLOSS[concept].en,
    meaning_script: "latin",
    understood: i < 2 ? 2 : 0,
    spoken: i < 2 ? 1 : 0,
    learned: i < 2,
    clip_url: null,
  }));
  return {
    type: "deck",
    partner_name: partner.name,
    partner_lang: partner.lang,
    partner_gender: partner.gender,
    learned_count: 2,
    words,
    report: viewerLang === "hi" ? "शानदार उड़ान!" : "A fine flight!",
    report_pending: false,
    stats: {
      phases: ([1, 2, 3] as const).map((phase) => ({
        phase,
        fuel_left_s: 100,
        wrong_actions: 0,
        lifelines_used: 0,
        attempts: 1,
        time_s: 60,
      })),
      wrong_actions_total: 0,
      lifelines_used: { mine: 0, partner: 0 },
      total_time_s: 180,
      fuel_left_final_s: 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Dev Mode (§A13)
// ---------------------------------------------------------------------------

export const devState = (over: Partial<DevState> = {}): DevState => ({
  type: "dev_state",
  room: "TEST",
  status: "LOBBY",
  phase: 0,
  action_id: null,
  seed: 0,
  vars: {},
  forced: {},
  expected: [],
  unordered: false,
  pending: null,
  fuel_s: 0,
  bots: { flyer: false, tower: false },
  exposure: {},
  last_utterance: null,
  latencies_ms: [],
  ...over,
});
