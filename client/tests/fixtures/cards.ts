// Manual-card fixtures for four representative steps, in BOTH languages (§A2 rule 9: a Hindi
// Tower and an English Tower are equally first-class). Shaped exactly like Part A `ManualCard`;
// the wording follows the build spec's action tables and stations.json `manual_name`s.
import type { Lang, ManualCard, Segment } from "../../src/net/protocol";
import { kw, plain } from "./messages";

type Pair<T> = Record<Lang, T>;

const progress = (index: number, total: number): ManualCard["progress"] =>
  Array.from({ length: total }, (_, i) =>
    i < index ? "done" : i === index ? "current" : "upcoming",
  );

const base = (
  lang: Lang,
): Pick<
  ManualCard,
  "lang" | "last_wrong" | "stamp" | "smudges" | "quick_say" | "known_from" | "find_out"
> => ({
  lang,
  last_wrong: null,
  stamp: null,
  smudges: false,
  quick_say: null,
  known_from: null,
  find_out: null,
});

const OWN_ASK: Pair<string> = { en: "Ask in your own words", hi: "अपने शब्दों में पूछो" };
const OWN_SAY: Pair<string> = { en: "Say it in your own words", hi: "अपने शब्दों में बोलो" };

/** P1_A1: observe MASTER_COLOR (red / blue) → press button one / three. */
export function cardP1A1(lang: Lang): ManualCard {
  const L = {
    en: {
      phase: "Pilot Down",
      title: "Master alarm",
      station: "Overhead panel",
      part: [plain("big center light")],
      prop: "color?",
      red: [kw("red", "RED", null)],
      blue: [kw("blue", "BLUE", null)],
      doRed: [kw("Press", "PRESS", null), plain(" button "), kw("one", "ONE", null)],
      doBlue: [kw("Press", "PRESS", null), plain(" button "), kw("three", "THREE", null)],
      hint: "Ask what color the big light is",
      sticky: "Hurry, the alarm is loud!",
    },
    hi: {
      phase: "पायलट बेहोश",
      title: "मास्टर अलार्म",
      station: "ओवरहेड पैनल",
      part: [plain("बड़ी बीच वाली लाइट")],
      prop: "रंग?",
      red: [kw("लाल", "RED", null)],
      blue: [kw("नीली", "BLUE", null)],
      doRed: [kw("एक", "ONE", null), plain(" नंबर बटन "), kw("दबाओ", "PRESS", null)],
      doBlue: [kw("तीन", "THREE", null), plain(" नंबर बटन "), kw("दबाओ", "PRESS", null)],
      hint: "बड़ी लाइट का रंग पूछो",
      sticky: "जल्दी करो, अलार्म बज रहा है!",
    },
  }[lang];
  return {
    ...base(lang),
    action_id: "P1_A1",
    index: 0,
    total: 7,
    phase: 1,
    station: "overhead",
    phase_name: L.phase,
    title: L.title,
    find_out: {
      station_label: L.station,
      part_label: L.part,
      property_label: L.prop,
      values: [
        { value: "RED", label: L.red, swatch: { kind: "color", color: "red" } },
        { value: "BLUE", label: L.blue, swatch: { kind: "color", color: "blue" } },
      ],
    },
    rows: [
      {
        when: { value: "RED", label: L.red, swatch: { kind: "color", color: "red" } },
        do: L.doRed,
        controls: [btn("OH_BTN_1", "1", 1)],
        order: "single",
      },
      {
        when: { value: "BLUE", label: L.blue, swatch: { kind: "color", color: "blue" } },
        do: L.doBlue,
        controls: [btn("OH_BTN_3", "3", 1)],
        order: "single",
      },
    ],
    hint: L.hint,
    sticky: L.sticky,
    own_words_note: OWN_ASK[lang],
    progress: progress(0, 7),
    highlight: { circled: ["OH_BTN_1", "OH_BTN_3"], question: ["OH_MASTER_LAMP"] },
  };
}

/** P1_A7: say-only, two ordered steps (switch four off, then pull lever one). */
export function cardP1A7(lang: Lang): ManualCard {
  const doLine: Pair<Segment[]> = {
    en: [
      plain("Switch "),
      kw("four", "FOUR", null),
      plain(" "),
      kw("off", "OFF", null),
      plain(", then "),
      kw("pull", "PULL", null),
      plain(" lever "),
      kw("one", "ONE", null),
    ],
    hi: [
      kw("चार", "FOUR", null),
      plain(" नंबर स्विच "),
      kw("बंद", "OFF", null),
      plain(" करो, फिर "),
      kw("एक", "ONE", null),
      plain(" नंबर लीवर "),
      kw("खींचो", "PULL", null),
    ],
  };
  return {
    ...base(lang),
    action_id: "P1_A7",
    index: 6,
    total: 7,
    phase: 1,
    station: "overhead",
    phase_name: { en: "Pilot Down", hi: "पायलट बेहोश" }[lang],
    title: { en: "Engage autopilot", hi: "ऑटोपायलट चालू" }[lang],
    rows: [
      {
        when: null,
        do: doLine[lang],
        controls: [
          {
            object_id: "OH_SW_4",
            type: "ToggleSwitch",
            label: "4",
            color: "grey",
            target: { kind: "toggle", value: "off" },
            count: 1,
          },
          {
            object_id: "OH_HANDLE_1",
            type: "PullHandle",
            label: "1",
            color: "grey",
            target: { kind: "handle", value: "out" },
            count: 1,
          },
        ],
        order: "ordered",
      },
    ],
    hint: { en: "Last step of this phase!", hi: "इस चरण का आखिरी कदम!" }[lang],
    sticky: { en: "Switch first, lever second", hi: "पहले स्विच, फिर लीवर" }[lang],
    own_words_note: OWN_SAY[lang],
    progress: progress(6, 7),
    highlight: { circled: ["OH_SW_4", "OH_HANDLE_1"], question: [] },
  };
}

/** P2_B2: branch_on FIRE_SIDE (known from step 1) → the yellow switch on that side off. */
export function cardP2B2(lang: Lang): ManualCard {
  const left: Pair<Segment[]> = { en: [kw("left", "LEFT", null)], hi: [kw("बायाँ", "LEFT", null)] };
  const right: Pair<Segment[]> = {
    en: [kw("right", "RIGHT", null)],
    hi: [kw("दायाँ", "RIGHT", null)],
  };
  const doSide = (side: Pair<Segment[]>): Segment[] =>
    lang === "en"
      ? [plain("Turn the "), ...side.en, plain(" yellow switch "), kw("off", "OFF", null)]
      : [...side.hi, plain(" पीला स्विच "), kw("बंद", "OFF", null), plain(" करो")];
  const sw = (id: string, label: string) => ({
    object_id: id,
    type: "ToggleSwitch" as const,
    label,
    color: "yellow",
    target: { kind: "toggle" as const, value: "off" as const },
    count: 1,
  });
  return {
    ...base(lang),
    action_id: "P2_B2",
    index: 1,
    total: 6,
    phase: 2,
    station: "pedestal",
    phase_name: { en: "Engine Fire", hi: "इंजन में आग" }[lang],
    title: { en: "Cut the fuel", hi: "फ्यूल बंद" }[lang],
    known_from: {
      index: 0,
      text: { en: "You found the fire side in step 1", hi: "आग की तरफ़ आपने कदम 1 में पता की" }[lang],
    },
    rows: [
      {
        when: { value: "LEFT", label: left[lang], swatch: { kind: "side", side: "left" } },
        do: doSide(left),
        controls: [sw("PD_FUEL_SW_L", "←")],
        order: "single",
      },
      {
        when: { value: "RIGHT", label: right[lang], swatch: { kind: "side", side: "right" } },
        do: doSide(right),
        controls: [sw("PD_FUEL_SW_R", "→")],
        order: "single",
      },
    ],
    hint: { en: "Same side as the fire", hi: "आग वाली तरफ़ ही" }[lang],
    sticky: { en: "Fuel feeds the fire!", hi: "फ्यूल से आग बढ़ती है!" }[lang],
    own_words_note: OWN_SAY[lang],
    progress: progress(1, 6),
    stamp: "emergency",
    highlight: { circled: ["PD_FUEL_SW_L", "PD_FUEL_SW_R"], question: [] },
  };
}

/** P3_C3: say-only, unordered, notch counts (left flap ×2, right flap ×1). */
export function cardP3C3(lang: Lang): ManualCard {
  const doLine: Segment[] =
    lang === "en"
      ? [
          kw("left", "LEFT", null),
          plain(" lever "),
          kw("down", "DOWN", null),
          plain(" "),
          kw("twice", "TWO", null),
          plain(", "),
          kw("right", "RIGHT", null),
          plain(" lever "),
          kw("down", "DOWN", null),
          plain(" once"),
        ]
      : [
          kw("बायाँ", "LEFT", null),
          plain(" लीवर "),
          kw("दो", "TWO", null),
          plain(" "),
          kw("बार", "TIMES", null),
          plain(" "),
          kw("नीचे", "DOWN", null),
          plain(", "),
          kw("दायाँ", "RIGHT", null),
          plain(" लीवर एक बार"),
        ];
  return {
    ...base(lang),
    action_id: "P3_C3",
    index: 2,
    total: 8,
    phase: 3,
    station: "front",
    phase_name: { en: "Storm Landing", hi: "तूफ़ान में लैंडिंग" }[lang],
    title: { en: "Set the flaps", hi: "फ्लैप सेट करो" }[lang],
    rows: [
      {
        when: null,
        do: doLine,
        controls: [
          {
            object_id: "FP_FLAP_L",
            type: "NotchLever",
            label: "←",
            color: "grey",
            target: { kind: "notch", value: 2 },
            count: 2,
          },
          {
            object_id: "FP_FLAP_R",
            type: "NotchLever",
            label: "→",
            color: "grey",
            target: { kind: "notch", value: 1 },
            count: 1,
          },
        ],
        order: "unordered",
      },
    ],
    hint: { en: "Any order is fine", hi: "किसी भी क्रम में" }[lang],
    sticky: { en: "Count the clicks!", hi: "क्लिक गिनो!" }[lang],
    own_words_note: OWN_SAY[lang],
    progress: progress(2, 8),
    smudges: true,
    highlight: { circled: ["FP_FLAP_L", "FP_FLAP_R"], question: [] },
  };
}

function btn(id: string, label: string, count: number) {
  return {
    object_id: id,
    type: "PushButton" as const,
    label,
    color: "white",
    target: { kind: "button" as const },
    count,
  };
}

export const CARD_FIXTURES = { P1_A1: cardP1A1, P1_A7: cardP1A7, P2_B2: cardP2B2, P3_C3: cardP3C3 };
