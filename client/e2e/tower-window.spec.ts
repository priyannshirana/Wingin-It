import { expect, test } from "@playwright/test";
import type { Page, WebSocketRoute } from "@playwright/test";

// The Tower window (§F12.7) and the 28 s Tower prologue (§F14.4): screenshots of the takeoff,
// landing and crash shots, the radar boot, MAYDAY and take-control beats in both languages, plus
// the idle desk (the window is unmounted). Fake WebSocket server, like tower-cinematics.spec.ts.
// PNGs: e2e/__screenshots__/tower-<lang>-win-<beat>.png

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

const PROLOGUE = { id: "prologue", ms: 28000 };
const LANDING = { id: "landing", ms: 7000 };
const CRASH = { id: "crash", ms: 5000 };

for (const lang of ["en", "hi"] as const) {
  test(`Tower window shots (${lang})`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !m.text().includes("THREE.Clock"))
        errors.push(m.text());
    });
    const server = new FakeServer(lang);
    await server.attach(page);
    await page.goto(`/r/TEST?role=tower&lang=${lang}&name=Tara&gender=female&auto=1`);
    await expect(page.locator('[data-screen="tower"]')).toBeVisible({ timeout: 15_000 });
    await sleep(page, 0.8);
    const go = (b: Beat) =>
      beat(page, server, lang, { ...b, name: `win-${b.name}`, lead: b.lead ?? 1.2 });

    // The idle desk: no window, no canvas.
    await expect(page.getByTestId("tower-window")).toHaveCount(0);
    expect(await page.locator("canvas").count()).toBe(0);
    await page.screenshot({ path: `${DIR}/tower-${lang}-win-0-idle.png` });

    server.send(gameState({ status: "PROLOGUE", phase: 0, signal_level: 0 }));
    await go({ ...PROLOGUE, t: 1.8, name: "1a-takeoff-roll" });
    await go({ ...PROLOGUE, t: 3.9, name: "1b-takeoff-liftoff" });
    await go({ ...PROLOGUE, t: 6.2, name: "1c-takeoff-climb" });
    server.send(
      gameState({ status: "PROLOGUE", phase: 0, radar: radar({ blip: "green", progress: 0.04 }) }),
    );
    await go({ ...PROLOGUE, t: 8.1, lead: 1.5, name: "1d-radar-boot" });
    await go({ ...PROLOGUE, t: 9.2, name: "1e-time-skip" });
    await go({ ...PROLOGUE, t: 13, name: "1f-radar-cruise" });
    server.send(
      gameState({
        status: "PROLOGUE",
        phase: 0,
        radar: radar({ blip: "red", icon: "mayday", progress: 0.06 }),
      }),
    );
    await go({ ...PROLOGUE, t: 17.4, name: "1g-mayday" });
    await go({ ...PROLOGUE, t: 18.6, name: "1h-take-control" });
    await go({ ...PROLOGUE, t: 26.3, name: "1i-phase1-title" });

    server.send(
      gameState({
        status: "PHASE_OUTRO",
        phase: 3,
        signal_level: 3,
        radar: radar({ blip: "green", runway: true, progress: 1, landed: true }),
      }),
    );
    await go({ ...LANDING, t: 1.1, name: "2a-landing-approach" });
    await go({ ...LANDING, t: 2.3, name: "2b-landing-touchdown" });
    await go({ ...LANDING, t: 4.9, name: "2c-landing-stopped" });
    await go({ ...LANDING, t: 6.3, name: "2d-landing-stamp" });

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
    await go({ ...CRASH, t: 1.3, name: "3a-crash-spiral" });
    await go({ ...CRASH, t: 2.85, name: "3b-crash-poof" });
    await go({ ...CRASH, t: 4.3, name: "3c-crash-radar" });

    expect(errors, errors.join("\n")).toEqual([]);
  });
}
