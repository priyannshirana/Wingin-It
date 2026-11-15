// Typed fixtures shaped exactly like Part A server messages (§A8). Used by the unit tests to
// drive the store and the components without a server.
import { STATIONS_FILE } from "../../src/content/stations";
import type {
  ActionResult,
  CinematicMsg,
  DeckMsg,
  FlyerView,
  GameState,
  ManualCard,
  ObjectState,
  PlayerPublic,
  RoomState,
  Segment,
  UtteranceMsg,
  Welcome,
  World,
} from "../../src/net/protocol";

export const plain = (text: string): Segment => ({ text, kind: "plain" });
export const kw = (text: string, concept: Segment["concept"], gloss: string | null): Segment => ({
  text,
  kind: "keyword",
  concept,
  gloss,
});

export const welcome = (over: Partial<Welcome> = {}): Welcome => ({
  type: "welcome",
  server_ms: 1_000_000,
  room_code: "TEST",
  mock_speech: true,
  dev_mode: true,
  demo: false,
  gloss_threshold: 2,
  version: "0.1.0",
  ...over,
});

export const player = (over: Partial<PlayerPublic> = {}): PlayerPublic => ({
  id: "p-tower",
  name: "Tower",
  role: "tower",
  lang: "hi",
  gender: "male",
  ready: false,
  connected: true,
  is_bot: false,
  ...over,
});

export const flyerPlayer = (over: Partial<PlayerPublic> = {}): PlayerPublic =>
  player({ id: "p-flyer", name: "Flyer", role: "flyer", lang: "en", gender: "female", ...over });

export const roomState = (over: Partial<RoomState> = {}): RoomState => ({
  type: "room_state",
  code: "TEST",
  status: "LOBBY",
  demo: false,
  mock_speech: true,
  players: [player(), flyerPlayer()],
  can_start: false,
  block_reason: "not_ready",
  play_again_votes: [],
  ...over,
});

export const gameState = (over: Partial<GameState> = {}): GameState => ({
  type: "game_state",
  status: "PLAYING",
  paused_from: null,
  phase: 1,
  signal_level: 1,
  action_index: 0,
  completed: 0,
  total_actions: 7,
  action_id: "P1_A1",
  action_active: true,
  input_locked: false,
  fuel_s: 150,
  fuel_max_s: 150,
  fuel_draining: true,
  lifelines: { flyer: 3, tower: 3 },
  lifelines_enabled: false,
  attempt: 1,
  radar: {
    blip: "red",
    icon: "mayday",
    storm: false,
    runway: false,
    glide_path: false,
    progress: 0,
    landed: false,
  },
  demo: false,
  server_ms: 1_000_000,
  ...over,
});

/** §A11 phase-1 start world. */
export const phase1World = (over: Partial<World> = {}): World => ({
  light_rig: "night_alarm",
  alarm: true,
  warning_beep: false,
  pilot: { slumped: true, seat_back: false, awake: false },
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
  ...over,
});

/** Every object on all three stations at its `stations.json` default. */
export function defaultObjects(): Record<string, ObjectState> {
  const objects: Record<string, ObjectState> = {};
  for (const c of STATIONS_FILE.stations.flatMap((s) => s.controls)) objects[c.id] = c.default;
  return objects;
}

export const flyerView = (over: Partial<FlyerView> = {}): FlyerView => ({
  type: "flyer_view",
  station: "overhead",
  interactive: STATIONS_FILE.stations[0]?.controls.map((c) => c.id) ?? [],
  objects: {
    ...defaultObjects(),
    OH_MASTER_LAMP: { kind: "lamp", color: "red", blinking: true, attention: true },
  },
  world: phase1World(),
  quick_replies: [{ label: "Red!", text: "Red! The red one!" }],
  ...over,
});

export const utterance = (over: Partial<UtteranceMsg> = {}): UtteranceMsg => ({
  type: "utterance",
  id: "u1",
  speaker_role: "tower",
  speaker_name: "Tower",
  lang: "hi",
  segments: [
    plain("Kaun si light jal rahi hai — "),
    kw("laal", "RED", "red"),
    plain(" ya "),
    kw("neeli", "BLUE", "blue"),
    plain("?"),
  ],
  level: 1,
  lifeline_available: false,
  created_at_ms: 1_000_000,
  ...over,
});

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

export const cinematic = (over: Partial<CinematicMsg> = {}): CinematicMsg => ({
  type: "cinematic",
  id: "p1_intro",
  start_at_ms: 1_000_300,
  duration_ms: 1200,
  params: {},
  ...over,
});

/** A Hindi Tower card for P1_A1 (observe the master lamp, then press). */
export const manualCard = (over: Partial<ManualCard> = {}): ManualCard => ({
  action_id: "P1_A1",
  index: 0,
  total: 7,
  phase: 1,
  station: "overhead",
  lang: "hi",
  phase_name: "पायलट बेहोश",
  title: "मास्टर अलार्म",
  find_out: {
    station_label: "ओवरहेड पैनल",
    part_label: [plain("बड़ी बीच वाली लाइट")],
    property_label: "रंग?",
    values: [
      { value: "RED", label: [kw("लाल", "RED", null)], swatch: { kind: "color", color: "red" } },
      {
        value: "BLUE",
        label: [kw("नीली", "BLUE", null)],
        swatch: { kind: "color", color: "blue" },
      },
    ],
  },
  known_from: null,
  rows: [
    {
      when: {
        value: "RED",
        label: [kw("लाल", "RED", null)],
        swatch: { kind: "color", color: "red" },
      },
      do: [kw("एक", "ONE", null), plain(" नंबर बटन "), kw("दबाओ", "PRESS", null)],
      controls: [
        {
          object_id: "OH_BTN_1",
          type: "PushButton",
          label: "1",
          color: "white",
          target: { kind: "button" },
          count: 1,
        },
      ],
      order: "single",
    },
    {
      when: {
        value: "BLUE",
        label: [kw("नीली", "BLUE", null)],
        swatch: { kind: "color", color: "blue" },
      },
      do: [kw("तीन", "THREE", null), plain(" नंबर बटन "), kw("दबाओ", "PRESS", null)],
      controls: [
        {
          object_id: "OH_BTN_3",
          type: "PushButton",
          label: "3",
          color: "white",
          target: { kind: "button" },
          count: 2,
        },
      ],
      order: "single",
    },
  ],
  hint: "बत्ती का रंग पूछो",
  sticky: "जल्दी करो!",
  own_words_note: "अपने शब्दों में पूछो",
  progress: ["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"],
  last_wrong: null,
  stamp: null,
  smudges: false,
  highlight: { circled: ["OH_BTN_1", "OH_BTN_3"], question: ["OH_MASTER_LAMP"] },
  quick_say: null,
  ...over,
});

export const deck = (over: Partial<DeckMsg> = {}): DeckMsg => ({
  type: "deck",
  partner_name: "Tower",
  partner_lang: "hi",
  partner_gender: "male",
  learned_count: 1,
  words: [
    {
      concept: "RED",
      word: "laal",
      meaning: "red",
      meaning_script: "latin",
      understood: 2,
      spoken: 1,
      learned: true,
      clip_url: null,
    },
  ],
  report: null,
  report_pending: true,
  stats: {
    phases: [
      { phase: 1, fuel_left_s: 80, wrong_actions: 1, lifelines_used: 0, attempts: 1, time_s: 90 },
    ],
    wrong_actions_total: 1,
    lifelines_used: { mine: 0, partner: 0 },
    total_time_s: 300,
    fuel_left_final_s: 40,
  },
  ...over,
});
