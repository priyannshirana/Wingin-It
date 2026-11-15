import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

// The Tower half of M3b (§F14.4): screenshots of every Tower hero beat in both Tower languages.
// No backend: Playwright's routeWebSocket plays the server with Part A messages, and each
// shot (re)starts its cinematic just before its beat (`start_at_ms = now - t`), so the real runner
// seeks forward and plays the beat live (flash and sound included).
// PNGs: e2e/__screenshots__/tower-<lang>-<beat>.png

type Json = Record<string, unknown>;
type Lang = "en" | "hi";

const DIR = "e2e/__screenshots__";

const radar = (over: Json = {}): Json => ({
  blip: "green",
  icon: null,
  storm: false,
  runway: false,
  glide_path: false,
  progress: 0,
  landed: false,
  ...over,
});

const gameState = (over: Json): Json => ({
  type: "game_state",
  status: "PLAYING",
  paused_from: null,
  phase: 1,
  signal_level: 1,
  action_index: 0,
  completed: 0,
  total_actions: 7,
  action_id: null,
  action_active: false,
  input_locked: true,
  fuel_s: 120,
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

const player = (role: "tower" | "flyer", lang: Lang): Json => ({
  id: `p-${role}`,
  name: role === "tower" ? "Tara" : "Felix",
  role,
  lang,
  gender: role === "tower" ? "female" : "male",
  ready: true,
  connected: true,
  is_bot: false,
});

class FakeServer {
  ws: WebSocketRoute | null = null;
  private readonly lang: Lang;
  constructor(lang: Lang) {
    this.lang = lang;
  }

  async attach(page: Page) {
    await page.routeWebSocket(/\/ws\/TEST$/, (ws) => {
      this.ws = ws;
      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as Json;
        if (msg.type === "ping") {
          this.send({ type: "pong", client_ms: msg.client_ms, server_ms: Date.now() });
        } else if (msg.type === "join") {
          this.send({
            type: "joined",
            player_id: "p-tower",
            token: "tok",
            role: "tower",
            lang: this.lang,
            gender: "female",
            name: "Tara",
          });
          this.send({
            type: "room_state",
            code: "TEST",
            status: "PROLOGUE",
            demo: false,
            mock_speech: true,
            players: [
              player("tower", this.lang),
              player("flyer", this.lang === "en" ? "hi" : "en"),
            ],
            can_start: false,
            block_reason: null,
            play_again_votes: [],
          });
          this.send(gameState({ status: "PROLOGUE", phase: 0, signal_level: 0 }));
          this.send({ type: "manual_card", card: null });
        }
      });
      this.send({
        type: "welcome",
        server_ms: Date.now(),
        room_code: "TEST",
        mock_speech: true,
        dev_mode: false,
        demo: false,
        gloss_threshold: 2,
        version: "0.1.0",
      });
    });
  }

  send(msg: Json) {
    this.ws?.send(JSON.stringify(msg));
  }

  /** Start cinematic `id` so that its timeline is at `t` seconds right now. */
  cinematic(id: string, durationMs: number, t: number, params: Json = {}) {
    this.send({
      type: "cinematic",
      id,
      start_at_ms: Date.now() - t * 1000,
      duration_ms: durationMs,
      params,
    });
  }
}

const sleep = (page: Page, s: number) => page.waitForTimeout(Math.round(s * 1000));

/** How far ahead of a shot its cinematic is (re)started, so the runner plays the beat live. */
const LEAD_S = 0.5; // > the 0.4 s title fade, so a previous shot's card is gone

interface Beat {
  id: string;
  ms: number;
  t: number; // timeline time of the shot
  name: string;
  lead?: number; // seconds played live before the shot (default LEAD_S)
  params?: Json;
}

/**
 * Starts `id` so its timeline reaches `t` right as we shoot (no drift from chained waits): it is
 * sent with `start_at_ms = now - (t - LEAD_S)`, so the runner seeks to just before the beat and
 * plays the last LEAD_S live, sounds and flashes included.
 */
async function beat(page: Page, server: FakeServer, lang: Lang, b: Beat) {
  const lead = b.lead ?? LEAD_S;
  server.cinematic(b.id, b.ms, Math.max(0, b.t - lead), b.params);
  await sleep(page, Math.min(b.t, lead));
  await page.screenshot({ path: `${DIR}/tower-${lang}-${b.name}.png` });
}

/**
 * Captures a one-shot flash (60–160 ms; too short to hit with a timed screenshot): pauses the
 * flash layer's CSS animation on its first frame, shoots, then lets it finish.
 */
async function flashBeat(page: Page, server: FakeServer, lang: Lang, b: Beat) {
  await page.evaluate(() => {
    const w = window as unknown as { __flashCatch?: MutationObserver };
    w.__flashCatch?.disconnect();
    const obs = new MutationObserver(() => {
      const layers = Array.from(document.querySelectorAll<HTMLElement>("div[style*='flash-fade']"));
      for (const el of layers) {
        for (const a of el.getAnimations()) {
          a.pause();
          a.currentTime = 8;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    w.__flashCatch = obs;
  });
  server.cinematic(b.id, b.ms, Math.max(0, b.t - LEAD_S), b.params);
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLElement>("div[style*='flash-fade']");
      return el !== null && el.getAnimations().some((a) => a.playState === "paused");
    },
    undefined,
    { timeout: 5000 },
  );
  await page.screenshot({ path: `${DIR}/tower-${lang}-${b.name}.png` });
  await page.evaluate(() => {
    const w = window as unknown as { __flashCatch?: MutationObserver };
    w.__flashCatch?.disconnect();
    const layers = Array.from(document.querySelectorAll<HTMLElement>("div[style*='flash-fade']"));
    for (const el of layers) for (const a of el.getAnimations()) a.finish();
  });
}

const PROLOGUE = { id: "prologue", ms: 12000 };
const P1_OUTRO = { id: "p1_outro", ms: 6000 };
const P2_INTRO = { id: "p2_intro", ms: 9000 };
const P2_EXT = { id: "p2_extinguish", ms: 3000 };
const P2_OUTRO = { id: "p2_outro", ms: 8000 };
const P3_INTRO = { id: "p3_intro", ms: 7000 };
const STRIKE = { id: "lightning_strike", ms: 1500 };
const REVEAL = { id: "p3_runway_reveal", ms: 4000 };
const TOUCHDOWN = { id: "p3_touchdown", ms: 6000 };
const LANDING = { id: "landing", ms: 7000 };
const ENDING = { id: "ending", ms: 6000, params: { fuel_left_s: 42, total_time_s: 305 } };
const CRASH = { id: "crash", ms: 5000 };

for (const lang of ["en", "hi"] as const) {
  test(`Tower hero beats (${lang})`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
    });
    const server = new FakeServer(lang);
    await server.attach(page);
    await page.goto(`/r/TEST?role=tower&lang=${lang}&name=Tara&gender=female&auto=1`);
    await expect(page.locator('[data-screen="tower"]')).toBeVisible({ timeout: 15_000 });
    await sleep(page, 0.8); // clock pings settle
    const go = (b: Beat) => beat(page, server, lang, b);
    const flash = (b: Beat) => flashBeat(page, server, lang, b);

    // 1. prologue: the radar boots; 8.5 the MAYDAY slam (+ red flash); 10–12 the phase 1 title
    // over the teal cover (the phase 1 bars must read on it).
    server.send(
      gameState({
        status: "PROLOGUE",
        phase: 0,
        signal_level: 0,
        radar: radar({ blip: "red", icon: "mayday", progress: 0.06 }),
      }),
    );
    await go({ ...PROLOGUE, t: 0.45, name: "1a-radar-boot" });
    await flash({ ...PROLOGUE, t: 8.5, name: "1b-mayday-flash" });
    await go({ ...PROLOGUE, t: 8.6, name: "1c-mayday-slam" });
    await go({ ...PROLOGUE, t: 9.5, name: "1d-mayday-hold" });
    await go({ ...PROLOGUE, t: 11.0, name: "1e-phase1-title-bars" });

    // 2. p1_outro 4: the AUTOPILOT ENGAGED banner; the blip is green.
    server.send(
      gameState({
        status: "PHASE_OUTRO",
        phase: 1,
        signal_level: 1,
        completed: 7,
        radar: radar({ blip: "green", progress: 0.33 }),
      }),
    );
    await go({ ...P1_OUTRO, t: 4.6, name: "2-autopilot-banner" });

    // 3. p2_intro 0.8: the shake + flash + the fire icon popping; 6–8 the phase 2 title.
    server.send(
      gameState({
        status: "PHASE_INTRO",
        phase: 2,
        signal_level: 2,
        radar: radar({ blip: "red", icon: "fire", progress: 0.4 }),
      }),
    );
    await flash({ ...P2_INTRO, t: 0.8, name: "3a-p2-flash" });
    await go({ ...P2_INTRO, t: 0.95, name: "3b-p2-shake-fire" });
    await go({ ...P2_INTRO, t: 6.9, name: "3c-p2-title" });

    // 3d. p2_extinguish: fire → smoke morph on the radar.
    server.send(
      gameState({ phase: 2, signal_level: 2, radar: radar({ blip: "amber", progress: 0.45 }) }),
    );
    await go({ ...P2_EXT, t: 1.3, lead: 1.1, name: "3d-p2-smoke-morph" });

    // 3e. p2_outro: the storm blobs drifting in.
    server.send(
      gameState({
        status: "PHASE_OUTRO",
        phase: 2,
        signal_level: 2,
        radar: radar({ blip: "amber", icon: "smoke", progress: 0.5 }),
      }),
    );
    await go({ ...P2_OUTRO, t: 3.0, name: "3e-p2-storm-in" });

    // 4. p3_intro: 2 lightning, 2.5–5 the title; 5–7 the runway + glide path draw on.
    server.send(
      gameState({
        status: "PHASE_INTRO",
        phase: 3,
        signal_level: 3,
        lifelines_enabled: true,
        radar: radar({ blip: "amber", icon: "smoke", storm: true, progress: 0.7 }),
      }),
    );
    await flash({ ...P3_INTRO, t: 2.0, name: "4a-p3-lightning" });
    await go({ ...P3_INTRO, t: 3.4, name: "4b-p3-title" });
    await go({ ...P3_INTRO, t: 5.8, name: "4c-p3-glide-drawing" });
    await go({ ...P3_INTRO, t: 6.9, name: "4d-p3-glide-drawn" });

    // 4e–g. in-phase radar beats: lightning strike flicker, runway pulse, touchdown bounce.
    server.send(
      gameState({
        phase: 3,
        signal_level: 3,
        lifelines_enabled: true,
        radar: radar({
          blip: "amber",
          storm: true,
          runway: true,
          glide_path: true,
          progress: 0.8,
        }),
      }),
    );
    await flash({ ...STRIKE, t: 0, name: "4e-lightning-strike" });
    await go({ ...REVEAL, t: 1.1, name: "4f-runway-pulse" });
    server.send(
      gameState({
        phase: 3,
        signal_level: 3,
        radar: radar({ blip: "green", storm: true, runway: true, progress: 1 }),
      }),
    );
    await go({ ...TOUCHDOWN, t: 2.2, name: "4g-touchdown-bounce" });

    // 5. landing 3: the LANDED stamp + confetti + the dawn warmth.
    server.send(
      gameState({
        status: "PHASE_OUTRO",
        phase: 3,
        signal_level: 3,
        radar: radar({ blip: "green", runway: true, progress: 1, landed: true }),
      }),
    );
    await go({ ...LANDING, t: 3.55, name: "5a-landed-confetti" });
    await go({ ...LANDING, t: 5.2, name: "5b-landed-hold" });

    // 6. ending: the title over the dawn, then the fade to cream (late frame ~5.7 s).
    server.send(gameState({ status: "ENDING", phase: 3, signal_level: 3 }));
    await go({ ...ENDING, t: 1.5, name: "6a-ending-title" });
    // the cream wash animates in once mounted, so this shot plays its last 2 s live
    await go({ ...ENDING, t: 5.7, lead: 2, name: "6b-ending-cream" });

    // 7. crash: the spiral, the POOF (2.6), crash.title (4).
    server.send(
      gameState({
        status: "CRASH",
        phase: 2,
        signal_level: 2,
        fuel_s: 0,
        radar: radar({ blip: "red", icon: "fire", progress: 0.45 }),
      }),
    );
    server.send({ type: "crash", phase: 2 });
    await go({ ...CRASH, t: 1.3, name: "7a-crash-spiral" });
    await go({ ...CRASH, t: 3.0, name: "7b-crash-poof" });
    await go({ ...CRASH, t: 4.3, name: "7c-crash-title" });
    await sleep(page, 1.2); // past 5 s: CrashCard alone (no second title)
    await page.screenshot({ path: `${DIR}/tower-${lang}-7d-crash-retry.png` });

    expect(errors, errors.join("\n")).toEqual([]);
  });
}
