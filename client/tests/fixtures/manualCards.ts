// More manual-card fixtures (Part A `ManualCard`, both languages): the front-panel observe steps
// whose "?" badges sit on small lamps (P3_C2 gear lamps, P3_C6 fire lamp), and the longest-content
// page (longest hint and sticky note in the content, plus a last-try note). Wording follows the
// backend spec's phase 3 action table (§B5) and stations.json `manual_name`s.
import type { Lang, ManualCard, Segment } from "../../src/net/protocol";
import { CARD_FIXTURES, cardP2B2 } from "./cards";
import { kw, plain } from "./messages";

type Pair<T> = Record<Lang, T>;

const progress = (index: number, total: number): ManualCard["progress"] =>
  Array.from({ length: total }, (_, i) =>
    i < index ? "done" : i === index ? "current" : "upcoming",
  );

const OWN_ASK: Pair<string> = { en: "Ask in your own words", hi: "अपने शब्दों में पूछो" };
const YES: Pair<Segment[]> = { en: [kw("yes", "YES", null)], hi: [kw("हाँ", "YES", null)] };
const NO: Pair<Segment[]> = { en: [kw("no", "NO", null)], hi: [kw("नहीं", "NO", null)] };

const press = (lang: Lang, color: "red" | "green", times: number): Segment[] => {
  const c = {
    red: { en: kw("red", "RED", null), hi: kw("लाल", "RED", null) },
    green: { en: kw("green", "GREEN", null), hi: kw("हरा", "GREEN", null) },
  }[color][lang];
  if (lang === "en") {
    const count =
      times === 1 ? [plain(" one time")] : [plain(" "), kw("two", "TWO", null), plain(" times")];
    return [kw("Press", "PRESS", null), plain(" the "), c, plain(" button"), ...count];
  }
  const count =
    times === 1 ? [plain(" एक बार ")] : [plain(" "), kw("दो", "TWO", null), plain(" बार ")];
  return [c, plain(" बटन"), ...count, kw("दबाओ", "PRESS", null)];
};

const button = (id: string, color: "red" | "green", count: number) => ({
  object_id: id,
  type: "PushButton" as const,
  label: null,
  color,
  target: { kind: "button" as const },
  count,
});

function frontObserve(
  lang: Lang,
  o: {
    action_id: string;
    index: number;
    title: Pair<string>;
    part: Pair<string>;
    property: Pair<string>;
    hint: Pair<string>;
    sticky: Pair<string>;
    yes: { color: "red" | "green"; count: number };
    no: { color: "red" | "green"; count: number };
    question: string[];
  },
): ManualCard {
  const id = (c: "red" | "green") => (c === "red" ? "FP_BTN_RED" : "FP_BTN_GREEN");
  const yesw = {
    value: "YES",
    label: YES[lang],
    swatch: { kind: "yesno" as const, value: "yes" as const },
  };
  const now = {
    value: "NO",
    label: NO[lang],
    swatch: { kind: "yesno" as const, value: "no" as const },
  };
  return {
    lang,
    action_id: o.action_id,
    index: o.index,
    total: 8,
    phase: 3,
    station: "front",
    phase_name: { en: "Storm Landing", hi: "तूफ़ान में लैंडिंग" }[lang],
    title: o.title[lang],
    find_out: {
      station_label: { en: "Front panel", hi: "सामने का पैनल" }[lang],
      part_label: [plain(o.part[lang])],
      property_label: o.property[lang],
      values: [yesw, now],
    },
    known_from: null,
    rows: [
      {
        when: yesw,
        do: press(lang, o.yes.color, o.yes.count),
        controls: [button(id(o.yes.color), o.yes.color, o.yes.count)],
        order: "single",
      },
      {
        when: now,
        do: press(lang, o.no.color, o.no.count),
        controls: [button(id(o.no.color), o.no.color, o.no.count)],
        order: "single",
      },
    ],
    hint: o.hint[lang],
    sticky: o.sticky[lang],
    own_words_note: OWN_ASK[lang],
    progress: progress(o.index, 8),
    last_wrong: null,
    stamp: null,
    smudges: true,
    highlight: { circled: ["FP_BTN_GREEN", "FP_BTN_RED"], question: o.question },
    quick_say: null,
  };
}

/** P3_C2: observe the three gear lamps (all green? yes / no) → green ×1 or red ×2. */
export function cardP3C2(lang: Lang): ManualCard {
  return frontObserve(lang, {
    action_id: "P3_C2",
    index: 1,
    title: { en: "Confirm the gear", hi: "गियर पक्का करो" },
    part: { en: "lights 1, 2 and 3", hi: "लाइट 1, 2 और 3" },
    property: { en: "all green?", hi: "सब हरी?" },
    hint: { en: "All three lights matter.", hi: "तीनों लाइटें देखनी हैं।" },
    sticky: { en: "Any red = no", hi: "एक भी लाल = नहीं" },
    yes: { color: "green", count: 1 },
    no: { color: "red", count: 2 },
    question: ["FP_GEAR_LAMP_1", "FP_GEAR_LAMP_2", "FP_GEAR_LAMP_3"],
  });
}

/** P3_C6: observe the fire light (lit? yes / no) → red ×2 or green ×1. */
export function cardP3C6(lang: Lang): ManualCard {
  return frontObserve(lang, {
    action_id: "P3_C6",
    index: 5,
    title: { en: "Fire scare", hi: "आग का डर" },
    part: { en: "fire light", hi: "आग वाली लाइट" },
    property: { en: "lit?", hi: "जल रही है?" },
    hint: { en: "Check the fire light.", hi: "आग वाली लाइट देखो।" },
    sticky: { en: "Dark light = no fire", hi: "बुझी लाइट = आग नहीं" },
    yes: { color: "red", count: 2 },
    no: { color: "green", count: 1 },
    question: ["FP_FIRE_LAMP"],
  });
}

/** The longest notes in the content (hint, sticky) plus a last-try note, on a 2-column grid. */
export function cardLongest(lang: Lang): ManualCard {
  return {
    ...cardP2B2(lang),
    hint: {
      en: "Which side? The Flyer can see it from the window.",
      hi: "कौन सी तरफ़? फ़्लायर को खिड़की से आग दिखती है।",
    }[lang],
    sticky: {
      en: "The pilot is asleep — let him snore.",
      hi: "पायलट सो रहा है, सोने दो।",
    }[lang],
    last_wrong: {
      label: [plain({ en: "right yellow switch", hi: "दायाँ पीला स्विच" }[lang])],
      count: 2,
    },
  };
}

export const MANUAL_FIXTURES: Readonly<Record<string, (lang: Lang) => ManualCard>> = {
  ...CARD_FIXTURES,
  P3_C2: cardP3C2,
  P3_C6: cardP3C6,
  LONGEST: cardLongest,
};
