// A Part A §A13 `dev_state` fixture (Dev Mode only).
import type { ConceptId, DevState } from "../../src/net/protocol";
import { CONCEPTS } from "../../src/ui/dev/concepts";

type Counts = { heard: number; glossed: number; understood: number; spoken: number };

function exposureOf(over: Partial<Record<ConceptId, Counts>>): Record<ConceptId, Counts> {
  const out = {} as Record<ConceptId, Counts>;
  for (const c of CONCEPTS) out[c] = over[c] ?? { heard: 0, glossed: 0, understood: 0, spoken: 0 };
  return out;
}

export const devState = (over: Partial<DevState> = {}): DevState => ({
  type: "dev_state",
  room: "TEST",
  status: "PLAYING",
  phase: 1,
  action_id: "P1_A1",
  seed: 42,
  vars: { MASTER_COLOR: "BLUE", PRESS_COUNT: "2" },
  forced: { FIRE_SIDE: "left" },
  expected: [
    { object: "OH_BTN_3", verb: "press", count: 2, done: false },
    { object: "OH_TGL_A", verb: "toggle", value: "on", done: true },
  ],
  unordered: false,
  pending: { object: "OH_BTN_3", count: 1 },
  fuel_s: 132.4,
  bots: { flyer: false, tower: true },
  exposure: {
    "p-tower": {
      name: "Asha",
      role: "tower",
      concepts: exposureOf({ BLUE: { heard: 1, glossed: 1, understood: 1, spoken: 4 } }),
    },
    "p-flyer": {
      name: "Sam",
      role: "flyer",
      concepts: exposureOf({
        BLUE: { heard: 4, glossed: 3, understood: 2, spoken: 1 },
        THREE: { heard: 2, glossed: 2, understood: 1, spoken: 0 },
      }),
    },
  },
  last_utterance: {
    id: "u7",
    speaker_role: "tower",
    transcript: "teen number button do baar dabao",
    matches: [
      { start: 0, end: 4, concepts: ["THREE"], side: "speaker" },
      { start: 19, end: 26, concepts: ["TWO", "TIMES"], side: "speaker" },
      { start: 27, end: 32, concepts: ["PRESS"], side: "speaker" },
    ],
    segments: [
      { text: "teen", kind: "keyword", concept: "THREE", gloss: "three" },
      { text: " number button ", kind: "plain" },
      { text: "do baar", kind: "keyword", concepts: ["TWO", "TIMES"], gloss: "twice" },
      { text: " ", kind: "plain" },
      { text: "dabao", kind: "keyword", concept: "PRESS", gloss: null },
    ],
    latency_ms: 1180,
  },
  latencies_ms: [900, 1100, 1250, 1600, 1180],
  ...over,
});
