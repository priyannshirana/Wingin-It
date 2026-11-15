// Word-deck screenshots and layout checks (§F17). The room's WebSocket is answered by
// Playwright's routeWebSocket with Part A messages, so no server is needed:
//   E2E_BASE_URL=http://localhost:5178 npm run e2e -- deck.spec.ts
import { expect, test, type Page } from "@playwright/test";
import type {
  ConceptId,
  DeckMsg,
  DeckWord,
  Gender,
  Lang,
  PlayerPublic,
  Role,
  S2C,
} from "../src/net/protocol";

const SHOTS = "e2e/__screenshots__/deck";

// [concept, en.display, hi.display_roman, hi.display_deva] (§B5 lexicon, reference only)
const LEXICON: [ConceptId, string, string, string][] = [
  ["RED", "red", "laal", "लाल"],
  ["GREEN", "green", "hara", "हरा"],
  ["BLUE", "blue", "neela", "नीला"],
  ["ONE", "one", "ek", "एक"],
  ["TWO", "two", "do", "दो"],
  ["THREE", "three", "teen", "तीन"],
  ["FOUR", "four", "chaar", "चार"],
  ["PRESS", "press", "dabao", "दबाओ"],
  ["PULL", "pull", "kheencho", "खींचो"],
  ["ON", "on", "chalu", "चालू"],
  ["OFF", "off", "band", "बंद"],
  ["YES", "yes", "haan", "हाँ"],
  ["NO", "no", "nahi", "नहीं"],
  ["WHICH", "which", "kaun sa", "कौन सा"],
  ["TIMES", "times", "baar", "बार"],
  ["FIRE", "fire", "aag", "आग"],
  ["LEFT", "left", "baayan", "बायाँ"],
  ["RIGHT", "right", "daayan", "दायाँ"],
  ["YELLOW", "yellow", "peela", "पीला"],
  ["DOWN", "down", "neeche", "नीचे"],
];

/** Counts for the learned words, in deck order (learned first, by understood + spoken). */
const LEARNED: Partial<Record<ConceptId, [number, number]>> = {
  RED: [4, 2],
  PRESS: [3, 1],
  FIRE: [2, 1],
  THREE: [3, 0],
  LEFT: [2, 0],
  YES: [1, 1],
  BLUE: [1, 0],
  PULL: [0, 1],
};

function buildWords(viewer: Lang, partner: Lang, learnedSet: ConceptId[], clips: boolean) {
  const words: DeckWord[] = LEXICON.map(([concept, en, roman, deva]) => {
    const counts = learnedSet.includes(concept) ? LEARNED[concept] : undefined;
    const [understood, spoken] = counts ?? [0, 0];
    return {
      concept,
      word: partner === "hi" ? roman : en,
      meaning: viewer === "hi" ? deva : en,
      meaning_script: viewer === "hi" ? "deva" : "latin",
      understood,
      spoken,
      learned: understood + spoken > 0,
      clip_url:
        clips && (concept === "RED" || concept === "PRESS") ? `/clips/c_${concept}.wav` : null,
    };
  });
  const score = (w: DeckWord) => (w.learned ? 100 + w.understood + w.spoken : 0);
  return [...words].sort((a, b) => score(b) - score(a));
}

interface Scenario {
  name: string;
  role: Role;
  lang: Lang;
  gender: Gender;
  partnerGender: Gender;
  learned: ConceptId[];
  clips: boolean;
  report: string | null;
}

const ALL_LEARNED = Object.keys(LEARNED) as ConceptId[];

const SCENARIOS: Scenario[] = [
  {
    name: "en-flyer",
    role: "flyer",
    lang: "en",
    gender: "female",
    partnerGender: "male",
    learned: ALL_LEARNED,
    clips: true,
    report:
      "Maya and Arjun landed with 38s of fuel to spare. You learned 8 words, including laal and dabao.",
  },
  {
    name: "hi-tower",
    role: "tower",
    lang: "hi",
    gender: "male",
    partnerGender: "female",
    learned: ALL_LEARNED,
    clips: false,
    report: "माया और अर्जुन ने 38 सेकंड ईंधन बचाकर विमान उतार लिया। आपने 8 शब्द सीखे, जैसे red और press।",
  },
  {
    name: "report-pending",
    role: "flyer",
    lang: "en",
    gender: "male",
    partnerGender: "female",
    learned: ALL_LEARNED,
    clips: true,
    report: null,
  },
  {
    name: "near-empty-hi-flyer",
    role: "flyer",
    lang: "hi",
    gender: "female",
    partnerGender: "female",
    learned: ["RED"],
    clips: false,
    report: "माया और अर्जुन ने 12 सेकंड ईंधन बचाकर विमान उतार लिया। आपने 1 शब्द सीखे।",
  },
];

function messages(s: Scenario): S2C[] {
  const partnerLang: Lang = s.lang === "en" ? "hi" : "en";
  const partnerRole: Role = s.role === "flyer" ? "tower" : "flyer";
  const me: PlayerPublic = {
    id: "p-me",
    name: "Maya",
    role: s.role,
    lang: s.lang,
    gender: s.gender,
    ready: false,
    connected: true,
    is_bot: false,
  };
  const partner: PlayerPublic = {
    ...me,
    id: "p-partner",
    name: "Arjun",
    role: partnerRole,
    lang: partnerLang,
    gender: s.partnerGender,
  };
  const words = buildWords(s.lang, partnerLang, s.learned, s.clips);
  const deck: DeckMsg = {
    type: "deck",
    partner_name: partner.name,
    partner_lang: partnerLang,
    partner_gender: s.partnerGender,
    learned_count: words.filter((w) => w.learned).length,
    words,
    report: s.report,
    report_pending: s.report === null,
    stats: {
      phases: [
        {
          phase: 1,
          fuel_left_s: 92.4,
          wrong_actions: 1,
          lifelines_used: 0,
          attempts: 1,
          time_s: 81,
        },
        {
          phase: 2,
          fuel_left_s: 61,
          wrong_actions: 0,
          lifelines_used: 0,
          attempts: 2,
          time_s: 133,
        },
        {
          phase: 3,
          fuel_left_s: 38.2,
          wrong_actions: 2,
          lifelines_used: 2,
          attempts: 1,
          time_s: 154,
        },
      ],
      wrong_actions_total: 3,
      lifelines_used: { mine: 2, partner: 1 },
      total_time_s: 427,
      fuel_left_final_s: 38.2,
    },
  };
  return [
    {
      type: "joined",
      player_id: me.id,
      token: "tok",
      role: s.role,
      lang: s.lang,
      gender: s.gender,
      name: me.name,
    },
    {
      type: "room_state",
      code: "TEST",
      status: "DECK",
      demo: false,
      mock_speech: true,
      voice: false,
      players: [me, partner],
      can_start: false,
      block_reason: null,
      play_again_votes: [],
    },
    deck,
  ];
}

async function openDeck(page: Page, s: Scenario): Promise<string[]> {
  const sent: string[] = [];
  await page.routeWebSocket(/\/ws\//, (ws) => {
    ws.send(
      JSON.stringify({
        type: "welcome",
        server_ms: Date.now(),
        room_code: "TEST",
        mock_speech: true,
        voice: false,
        dev_mode: false,
        demo: false,
        gloss_threshold: 2,
        version: "e2e",
      } satisfies S2C),
    );
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      sent.push(raw);
      const msg = JSON.parse(raw) as { type: string; client_ms?: number };
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", client_ms: msg.client_ms, server_ms: Date.now() }));
      } else if (msg.type === "join") {
        for (const m of messages(s)) ws.send(JSON.stringify(m));
      }
    });
  });
  const q = new URLSearchParams({
    role: s.role,
    lang: s.lang,
    gender: s.gender,
    name: "Maya",
    auto: "1",
  });
  await page.goto(`/r/TEST?${q.toString()}`);
  await expect(page.getByTestId("deck-card").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600); // the deal-in: 0.25 s + 19 × 40 ms stagger
  return sent;
}

/** Layout facts the screenshots are judged by. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
    const overflowing = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-testid=deck-card], [data-testid=deck-card] *, [data-testid^=deck-stat-], footer button",
      ),
    )
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      .map((el) => `${el.dataset.testid ?? el.tagName}:${el.textContent ?? ""}`);
    // Cards whose content is taller than the card (clipped text).
    const tallCards = Array.from(document.querySelectorAll<HTMLElement>("[data-testid=deck-card]"))
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.dataset.concept);
    const grid = document.querySelector("[data-testid=deck-grid] ul");
    const footer = document.querySelector("footer");
    return {
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      word: px(document.querySelector("[data-testid=deck-word]")),
      meaning: px(document.querySelector("[data-testid=deck-meaning]")),
      badge: px(document.querySelector("[data-testid=deck-badge]")),
      report: px(
        document.querySelector("[data-testid=deck-report], [data-testid=deck-report-loading]"),
      ),
      header: px(document.querySelector("[data-testid=deck-header]")),
      count: px(document.querySelector("[data-testid=deck-count]")),
      statLabel: px(document.querySelector("[data-testid^=deck-stat-] dt")),
      pageOverflowX: document.documentElement.scrollWidth > window.innerWidth,
      pageOverflowY: document.documentElement.scrollHeight > window.innerHeight,
      footerBottom: footer ? footer.getBoundingClientRect().bottom : -1,
      innerHeight: window.innerHeight,
      overflowing,
      tallCards,
    };
  });
}

for (const size of [
  { w: 1440, h: 900, cols: 4 },
  { w: 1280, h: 720, cols: 3 },
]) {
  for (const s of SCENARIOS) {
    test(`deck ${s.name} @ ${size.w}x${size.h}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width: size.w, height: size.h });
      await openDeck(page, s);
      if (s.report === null) {
        await expect(page.getByTestId("deck-report-loading")).toBeVisible();
        await page.waitForTimeout(700); // mid-typing
      }
      const m = await measure(page);
      console.warn(`[deck] ${s.name} ${size.w}x${size.h}`, JSON.stringify(m));
      expect(m.columns).toBe(size.cols);
      expect(m.word).toBe(40);
      expect(m.report).toBe(20);
      expect(m.pageOverflowX).toBe(false);
      expect(m.pageOverflowY).toBe(false);
      expect(m.footerBottom).toBeLessThanOrEqual(m.innerHeight);
      expect(m.overflowing).toEqual([]);
      expect(m.tallCards).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/${s.name}-${size.w}x${size.h}.png` });
      // The still-learning half of the deck (scrolled grid).
      await page.getByTestId("deck-grid").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${SHOTS}/${s.name}-${size.w}x${size.h}-scrolled.png` });
      expect(errors).toEqual([]);
    });
  }
}

test("pending report is replaced by deck_report; votes reach the socket", async ({ page }) => {
  const s = SCENARIOS[2];
  if (!s) throw new Error("scenario");
  let server: { send: (m: string) => void } | null = null;
  const sent: string[] = [];
  await page.routeWebSocket(/\/ws\//, (ws) => {
    server = ws;
    ws.send(
      JSON.stringify({
        type: "welcome",
        server_ms: Date.now(),
        room_code: "TEST",
        mock_speech: true,
        voice: false,
        dev_mode: false,
        demo: false,
        gloss_threshold: 2,
        version: "e2e",
      } satisfies S2C),
    );
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      sent.push(raw);
      const msg = JSON.parse(raw) as { type: string; client_ms?: number };
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", client_ms: msg.client_ms, server_ms: Date.now() }));
      } else if (msg.type === "join") {
        for (const m of messages(s)) ws.send(JSON.stringify(m));
      }
    });
  });
  await page.goto(`/r/TEST?role=flyer&lang=en&gender=male&name=Maya&auto=1`);
  await expect(page.getByTestId("deck-report-loading")).toBeVisible();
  await page.waitForTimeout(1600);
  const report = "Maya and Arjun landed with 38s of fuel to spare. You learned 8 words.";
  const ws = server as { send: (m: string) => void } | null;
  ws?.send(JSON.stringify({ type: "deck_report", report } satisfies S2C));
  await expect(page.getByTestId("deck-report")).toHaveText(report);
  await expect(page.getByTestId("deck-report-loading")).toHaveCount(0);
  await page.getByTestId("deck-play-again").click();
  await expect(page.getByTestId("deck-waiting")).toHaveText("Waiting for your partner…");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/voted-1440x900.png` });
  expect(sent.some((m) => m.includes('"play_again"'))).toBe(true);
});
