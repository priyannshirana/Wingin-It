// M2 language UI review frames (§F13, §F15, §F18.4). Self-contained: the room's WebSocket is
// answered by Playwright with Part A-shaped messages, so it needs only the dev server
// (VITE_DEV_MODE=1). Saves PNGs to e2e/__screenshots__/m2-*.png for human/agent review and
// asserts the measured text sizes. No pixel diffs.
//   E2E_BASE_URL=http://localhost:5175 npx playwright test language-ui --project flows
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

type Json = Record<string, unknown>;
type Lang = "en" | "hi";
type Role = "flyer" | "tower";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, "__screenshots__");
const stations = JSON.parse(
  readFileSync(path.join(here, "../../content/stations.json"), "utf8"),
) as { stations: { id: string; controls: { id: string; default: Json }[] }[] };

const kw = (text: string, concept: string, gloss: string | null, concepts?: string[]): Json => ({
  text,
  kind: "keyword",
  ...(concepts ? { concepts } : { concept }),
  gloss,
});
const pl = (text: string): Json => ({ text, kind: "plain" });

/** What the partner says, per phase, as the server would segment it for this listener. */
function lines(listener: Lang, level: 1 | 2 | 3): Json[][] {
  const g = (gloss: string) => (level === 1 ? gloss : null);
  if (listener === "en") {
    // An English listener hears Hindi: romanized chips, English glosses.
    return [
      [
        pl("Kaun si light jal rahi hai — "),
        kw("laal", "RED", g("red")),
        pl(" ya "),
        kw("neeli", "BLUE", g("blue")),
        pl("?"),
      ],
      [
        kw("Teen", "THREE", level === 2 ? "three" : g("three")),
        pl(" number button "),
        kw("do baar", "", g("twice"), ["TWO", "TIMES"]),
        pl(" "),
        kw("dabao", "PRESS", g("press")),
      ],
      [
        kw("Haan", "YES", g("yes")),
        pl(", ab "),
        kw("aag", "FIRE", level === 2 ? "fire" : g("fire")),
        pl(" wala handle "),
        kw("kheencho", "PULL", g("pull")),
        pl("!"),
      ],
    ];
  }
  // A Hindi listener hears English: English chips, romanized-Hindi glosses.
  return [
    [
      pl("Which light is on — "),
      kw("red", "RED", g("laal")),
      pl(" or "),
      kw("blue", "BLUE", g("neeli")),
      pl("?"),
    ],
    [
      kw("Press", "PRESS", g("dabao")),
      pl(" button "),
      kw("three", "THREE", level === 2 ? "teen" : g("teen")),
      pl(" "),
      kw("twice", "", g("do baar"), ["TWO", "TIMES"]),
    ],
    [
      kw("Yes", "YES", g("haan")),
      pl(", now "),
      kw("pull", "PULL", g("kheencho")),
      pl(" the "),
      kw("fire", "FIRE", level === 2 ? "aag" : g("aag")),
      pl(" handle!"),
    ],
  ];
}

function defaultObjects(): Json {
  const out: Json = {};
  for (const s of stations.stations) for (const c of s.controls) out[c.id] = c.default;
  return out;
}

function gameState(phase: 1 | 2 | 3, over: Json = {}): Json {
  return {
    type: "game_state",
    status: "PLAYING",
    paused_from: null,
    phase,
    signal_level: phase,
    action_index: 1,
    completed: 1,
    total_actions: phase === 3 ? 8 : 7,
    action_id: `P${phase}_A2`,
    action_active: true,
    input_locked: false,
    fuel_s: 118.4,
    fuel_max_s: 150,
    fuel_draining: true,
    lifelines: { flyer: 3, tower: 3 },
    lifelines_enabled: phase === 3,
    attempt: 1,
    radar: {
      blip: "red",
      icon: "mayday",
      storm: phase === 3,
      runway: phase === 3,
      glide_path: false,
      progress: 0.2,
      landed: false,
    },
    demo: false,
    server_ms: Date.now(),
    ...over,
  };
}

const WORLD: Json = {
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
};

interface Room {
  ws: WebSocketRoute | null;
  push: (msg: Json) => void;
}

/** Answers the room socket like the server would for `role` speaking `lang`. */
async function mockRoom(page: Page, role: Role, lang: Lang): Promise<Room> {
  const room: Room = {
    ws: null,
    push: (msg) => room.ws?.send(JSON.stringify(msg)),
  };
  const other: Lang = lang === "en" ? "hi" : "en";
  await page.routeWebSocket(/\/ws\/TEST$/, (ws) => {
    room.ws = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as Json;
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", client_ms: msg.client_ms, server_ms: Date.now() }));
      } else if (msg.type === "join") {
        room.push({
          type: "joined",
          player_id: `p-${role}`,
          token: "tok",
          role,
          lang,
          gender: "female",
          name: "Me",
        });
        room.push({
          type: "room_state",
          code: "TEST",
          status: "PLAYING",
          demo: false,
          mock_speech: true,
          players: [
            {
              id: "p-tower",
              name: role === "tower" ? "Me" : "Asha",
              role: "tower",
              lang: role === "tower" ? lang : other,
              gender: role === "tower" ? "female" : "male",
              ready: true,
              connected: true,
              is_bot: false,
            },
            {
              id: "p-flyer",
              name: role === "flyer" ? "Me" : "Sam",
              role: "flyer",
              lang: role === "flyer" ? lang : other,
              gender: role === "flyer" ? "female" : "male",
              ready: true,
              connected: true,
              is_bot: false,
            },
          ],
          can_start: false,
          block_reason: null,
          play_again_votes: [],
        });
        room.push(gameState(1));
        if (role === "flyer") {
          room.push({
            type: "flyer_view",
            station: "overhead",
            interactive: [],
            objects: defaultObjects(),
            world: WORLD,
            quick_replies: null,
          });
        } else {
          room.push({ type: "manual_card", card: null });
        }
      }
    });
    ws.send(
      JSON.stringify({
        type: "welcome",
        server_ms: Date.now(),
        room_code: "TEST",
        mock_speech: true,
        dev_mode: true,
        demo: false,
        gloss_threshold: 2,
        version: "e2e",
      }),
    );
  });
  return room;
}

let utteranceSeq = 0;
function say(
  room: Room,
  speaker: Role,
  speakerLang: Lang,
  level: 1 | 2 | 3,
  segments: Json[],
): string {
  const id = `u${++utteranceSeq}`;
  room.push({
    type: "utterance",
    id,
    speaker_role: speaker,
    speaker_name: speaker === "tower" ? "Asha" : "Sam",
    lang: speakerLang,
    segments,
    level,
    lifeline_available: level === 3,
    created_at_ms: Date.now(),
  });
  return id;
}

async function open(page: Page, role: Role, lang: Lang): Promise<Room> {
  const room = await mockRoom(page, role, lang);
  await page.goto(`/r/TEST?role=${role}&lang=${lang}&gender=female&name=Me&auto=1`);
  await page.locator(`[data-screen=${role}]`).waitFor();
  return room;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const px = (sel: string) =>
      Array.from(document.querySelectorAll(sel), (el) => parseFloat(getComputedStyle(el).fontSize));
    const classes = Array.from(
      document.querySelectorAll("[data-testid=keyword-chip]"),
      (el) => el.className,
    );
    return {
      chip: px("[data-testid=subtitle-line] [data-testid=keyword-chip]"),
      gloss: px("[data-testid=subtitle-line] [data-testid=gloss]"),
      translation: px("[data-testid=translation]"),
      toast: px("[data-testid=toast]"),
      chipClassLists: new Set(classes).size,
      glossClassLists: new Set(
        Array.from(document.querySelectorAll("[data-testid=gloss]"), (el) => el.className),
      ).size,
      // A gloss whose box sits on another line than its chip has wrapped away from it.
      detachedGlosses: Array.from(document.querySelectorAll("[data-testid=gloss]")).filter((g) => {
        const chip = g.previousElementSibling;
        if (!chip) return true;
        const a = g.getBoundingClientRect();
        const b = chip.getBoundingClientRect();
        return a.top > b.bottom || a.bottom < b.top;
      }).length,
      devanagariInSegments: Array.from(
        document.querySelectorAll(
          "[data-testid=subtitle-line] [data-kind], [data-testid=subtitle-line] [data-testid=gloss]",
        ),
      ).some((p) => /[ऀ-ॿ]/.test(p.textContent ?? "")),
    };
  });
}

const PAIRINGS: { name: string; flyer: Lang; tower: Lang }[] = [
  { name: "flyerEN-towerHI", flyer: "en", tower: "hi" },
  { name: "flyerHI-towerEN", flyer: "hi", tower: "en" },
];

for (const pair of PAIRINGS) {
  test.describe(`M2 language UI · ${pair.name}`, () => {
    test.setTimeout(120_000);
    test("Flyer HUD: phases 1/2/3, lifeline reveal, toasts", async ({ page }) => {
      const room = await open(page, "flyer", pair.flyer);
      const sizes: Json = {};
      for (const level of [1, 2, 3] as const) {
        room.push(gameState(level));
        for (const segs of lines(pair.flyer, level)) say(room, "tower", pair.tower, level, segs);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-phase${level}.png` });
        const m = await measure(page);
        sizes[`phase${level}`] = m;
        expect(m.chipClassLists).toBe(1);
        expect(m.devanagariInSegments).toBe(false);
        expect(m.detachedGlosses).toBe(0);
        expect(m.glossClassLists).toBeLessThanOrEqual(1);
        const glossCount = m.gloss.length;
        if (level === 1) expect(glossCount).toBe(8);
        if (level === 2) expect(glossCount).toBe(2);
        if (level === 3) expect(glossCount).toBe(0);
        // Newest line 26 px, older lines 21 px; glosses 0.7 em.
        expect(Math.max(...m.chip)).toBe(26);
      }

      // Phase 3 lifeline: hover, decode, reveal.
      const newest = page.getByTestId("subtitle-line").last();
      await newest.hover();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-lifeline-hover.png` });
      await newest.getByTestId("decode").click();
      await page.getByTestId("lifeline-decoding").waitFor();
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-lifeline-decoding.png` });
      const id = `u${utteranceSeq}`;
      room.push({
        type: "translation",
        utterance_id: id,
        text: pair.flyer === "en" ? "Yes, now pull the fire handle!" : "हाँ, अब आग वाला हैंडल खींचो!",
        lang: pair.flyer,
        lifelines_left: 2,
      });
      room.push(gameState(3, { lifelines: { flyer: 2, tower: 3 } }));
      await page.getByTestId("translation").waitFor();
      // Measure before the (slow) screenshot: the reveal only lasts TRANSLATION_REVEAL_MS.
      sizes.revealed = await measure(page);
      await page.mouse.move(10, 10);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-lifeline-revealed.png` });
      expect((sizes.revealed as { translation: number[] }).translation[0]).toBeCloseTo(26 * 0.8, 0);
      await page.getByTestId("lifeline-show").waitFor({ timeout: 8000 });
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-lifeline-collapsed.png` });

      // Toast stack: crossover + two plain ones, then a 4th pushes the oldest out.
      room.push({ type: "toast", kind: "info", key: "toast.partner_back", params: {} });
      room.push({ type: "toast", kind: "warning", key: "toast.didnt_catch", params: {} });
      room.push({
        type: "toast",
        kind: "crossover",
        key: "toast.crossover",
        params: { word: "laal" },
      });
      // Count first: SwiftShader screenshots can take longer than the 2 s crossover life.
      await expect(page.getByTestId("toast")).toHaveCount(3);
      sizes.toasts = await measure(page);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-flyer-toasts.png` });
      await page.waitForTimeout(2700);
      await expect(page.getByTestId("toast")).toHaveCount(0);
      console.warn(`[sizes ${pair.name} flyer]`, JSON.stringify(sizes));
    });

    test("Tower: subtitles in phases 1/3, lifeline reveal, dev panel", async ({ page }) => {
      const room = await open(page, "tower", pair.tower);
      for (const segs of lines(pair.tower, 1)) say(room, "flyer", pair.flyer, 1, segs);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-tower-phase1.png` });
      const p1 = await measure(page);
      expect(p1.chipClassLists).toBe(1);
      expect(p1.devanagariInSegments).toBe(false);
      expect(p1.detachedGlosses).toBe(0);
      expect(p1.glossClassLists).toBe(1);

      room.push(gameState(3));
      for (const segs of lines(pair.tower, 3)) say(room, "flyer", pair.flyer, 3, segs);
      await page.waitForTimeout(700);
      await page.getByTestId("subtitle-line").last().getByTestId("decode").click();
      room.push({
        type: "translation",
        utterance_id: `u${utteranceSeq}`,
        text: pair.tower === "en" ? "Yes, now pull the fire handle!" : "हाँ, अब आग वाला हैंडल खींचो!",
        lang: pair.tower,
        lifelines_left: 2,
      });
      room.push(gameState(3, { lifelines: { flyer: 3, tower: 2 } }));
      await page.getByTestId("translation").waitFor();
      await page.mouse.move(10, 10);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-tower-phase3-revealed.png` });
      const p3 = await measure(page);
      expect(p3.detachedGlosses).toBe(0);
      console.warn(`[sizes ${pair.name} tower]`, JSON.stringify({ p1, p3 }));

      room.push(devStateMsg());
      await page.keyboard.press("Backquote");
      await page.getByTestId("dev-panel").waitFor();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-tower-devpanel.png` });
      await page.getByTestId("dev-panel").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${SHOTS}/m2-${pair.name}-tower-devpanel-scrolled.png` });
    });
  });
}

function devStateMsg(): Json {
  const concepts = [
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
  ];
  const exp = (seed: number) =>
    Object.fromEntries(
      concepts.map((c, i) => {
        const n = (i * 7 + seed) % 5;
        return [
          c,
          {
            heard: n,
            glossed: Math.max(0, n - 1),
            understood: Math.max(0, n - 2),
            spoken: (i + seed) % 3,
          },
        ];
      }),
    );
  return {
    type: "dev_state",
    room: "TEST",
    status: "PLAYING",
    phase: 3,
    action_id: "P3_A2",
    seed: 42,
    vars: { WARN_COLOR: "RED", PRESS_COUNT: "3", FIRE_SIDE: "left" },
    forced: { WARN_COLOR: "RED" },
    expected: [
      { object: "FR_BTN_3", verb: "press", count: 3, done: false },
      { object: "FR_GEAR", verb: "move_down", value: "down", done: true },
    ],
    unordered: false,
    pending: { object: "FR_BTN_3", count: 1 },
    fuel_s: 97.3,
    bots: { flyer: false, tower: true },
    exposure: {
      "p-tower": { name: "Asha", role: "tower", concepts: exp(1) },
      "p-flyer": { name: "Sam", role: "flyer", concepts: exp(3) },
    },
    last_utterance: {
      id: "u9",
      speaker_role: "tower",
      transcript: "teen number button do baar dabao",
      matches: [
        { start: 0, end: 4, concepts: ["THREE"], side: "speaker" },
        { start: 19, end: 26, concepts: ["TWO", "TIMES"], side: "speaker" },
        { start: 27, end: 32, concepts: ["PRESS"], side: "listener" },
      ],
      segments: [
        { text: "teen", kind: "keyword", concept: "THREE", gloss: null },
        { text: " number button ", kind: "plain" },
        { text: "do baar", kind: "keyword", concepts: ["TWO", "TIMES"], gloss: null },
        { text: " ", kind: "plain" },
        { text: "dabao", kind: "keyword", concept: "PRESS", gloss: null },
      ],
      latency_ms: 1180,
    },
    latencies_ms: [900, 1100, 1250, 1600, 1180, 1320, 980, 1450, 1720, 1210, 1090, 1150],
  };
}
