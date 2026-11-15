// Renders every §F16.4 recipe through an OfflineAudioContext in real Chromium (jsdom has no
// Web Audio) and checks the signal: non-silent, the expected length, the peak within the spec
// gain; loops start and stop; ducking halves the ambience bus; mute zeroes master.
// Needs only the Vite dev server (it imports the audio modules straight from /src).
import { expect, test, type Page } from "@playwright/test";
import type * as EngineModule from "../src/audio/engine";
import type * as NamesModule from "../src/audio/names";
import type * as RecipesModule from "../src/audio/recipes";

type Engine = typeof EngineModule;
type Names = typeof NamesModule;
type Recipes = typeof RecipesModule;

interface Stats {
  peak: number;
  rms: number;
  firstS: number;
  lastS: number;
  lengthS: number;
}

/** §F16.4 gain column, transcribed independently of recipes.ts. */
const SPEC_GAIN: Record<string, number> = {
  alarm_master: 0.12,
  fire_bell: 0.08,
  warning_beep: 0.08,
  click: 0.3,
  clunk: 0.4,
  chime: 0.2,
  chime_soft: 0.1,
  buzzer: 0.25,
  boom: 0.5,
  whoosh: 0.3,
  engine_hum: 0.06,
  static: 0.04,
  rain: 0.08,
  thunder: 0.4,
  screech: 0.2,
  squeal: 0.1,
  snore: 0.05,
  sparkle: 0.15,
  low_fuel: 0.12,
  radio_in: 0.15,
  radio_out: 0.15,
  fuel_hiss: 0.03,
  motor_whirr: 0.1,
  radio_crackle: 0.12,
  music_sting: 0.12,
  stamp: 0.3,
  page_turn: 0.08,
};

const BUS: Record<string, number> = { sfx: 1, ambience: 1, radio: 0.6 };

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

/** Render `name` (one-shot via play, or loop) at master 1 and return signal stats. */
async function render(
  page: Page,
  name: string,
  opts: { loop?: boolean; seconds: number; stopAt?: number; duck?: boolean; master?: number },
): Promise<Stats> {
  return page.evaluate(
    async ({ name, opts }) => {
      const { AudioEngine } = (await import(
        /* @vite-ignore */ `${"/src/audio/"}engine.ts`
      )) as Engine;
      const { isSfxName } = (await import(/* @vite-ignore */ `${"/src/audio/"}names.ts`)) as Names;
      if (!isSfxName(name)) throw new Error(`unknown sfx ${name}`);
      const sr = 48000;
      const ctx = new OfflineAudioContext(1, Math.ceil(sr * opts.seconds), sr);
      const engine = new AudioEngine(ctx, ctx.destination, opts.master ?? 1);
      if (opts.duck) engine.duck(true);
      if (opts.loop) engine.loop(name, true);
      else engine.play(name);
      if (opts.stopAt !== undefined) {
        const at = opts.stopAt;
        void ctx.suspend(at).then(() => {
          engine.loop(name, false);
          void ctx.resume();
        });
      }
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0;
      let sum = 0;
      let first = -1;
      let last = -1;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i] ?? 0);
        peak = Math.max(peak, a);
        sum += a * a;
        if (a > 1e-4) {
          if (first < 0) first = i;
          last = i;
        }
      }
      return {
        peak,
        rms: Math.sqrt(sum / d.length),
        firstS: first / sr,
        lastS: last / sr,
        lengthS: d.length / sr,
      };
    },
    { name, opts },
  );
}

async function recipeInfo(page: Page) {
  return page.evaluate(async () => {
    const { RECIPES } = (await import(/* @vite-ignore */ `${"/src/audio/"}recipes.ts`)) as Recipes;
    const { SFX_NAMES } = (await import(/* @vite-ignore */ `${"/src/audio/"}names.ts`)) as Names;
    return SFX_NAMES.map((n) => ({
      name: n,
      bus: RECIPES[n].bus,
      loop: RECIPES[n].loop,
      gain: RECIPES[n].gain,
      durationS: RECIPES[n].durationS,
    }));
  });
}

test("every recipe renders a non-silent signal within its spec gain and length", async ({
  page,
}) => {
  const info = await recipeInfo(page);
  expect(info.map((r) => r.name).sort()).toEqual(Object.keys(SPEC_GAIN).sort());
  const rows: { r: (typeof info)[number]; s: Stats; limit: number }[] = [];
  for (const r of info) {
    const s = await render(page, r.name, { seconds: r.durationS + 0.6 });
    rows.push({ r, s, limit: r.gain * (BUS[r.bus] ?? 1) });
  }
  const report = rows
    .map(
      ({ r, s, limit }) =>
        `${r.name.padEnd(14)} peak ${s.peak.toFixed(4)} / ${limit.toFixed(3)} (${((100 * s.peak) / limit).toFixed(0)} %)  rms ${s.rms.toFixed(5)}  ${s.firstS.toFixed(3)}–${s.lastS.toFixed(3)} s / ${r.durationS} s`,
    )
    .join("\n");
  console.debug(report);
  await test.info().attach("recipe-levels.txt", { body: report });
  for (const { r, s, limit } of rows) {
    expect(r.gain, `${r.name} gain`).toBeCloseTo(SPEC_GAIN[r.name] ?? -1, 5);
    expect(s.peak, `${r.name} is silent`).toBeGreaterThan(limit * 0.15);
    expect(s.peak, `${r.name} peak over the spec gain`).toBeLessThanOrEqual(limit * 1.05);
    // Sounds start at once (snore swells in from silence by design, so allow 100 ms).
    expect(s.firstS, `${r.name} starts late`).toBeLessThan(0.1);
    // A one-shot (or one loop cycle via play) ends by its duration (+ a short filter tail).
    expect(s.lastS, `${r.name} rings past its duration`).toBeLessThanOrEqual(r.durationS + 0.08);
  }
});

test("loops run until stopped, then fall silent", async ({ page }) => {
  const info = await recipeInfo(page);
  for (const r of info.filter((x) => x.loop)) {
    const seconds = Math.max(4, r.durationS * 2 + 1);
    const on = await render(page, r.name, { loop: true, seconds });
    expect(on.peak, `${r.name} loop silent`).toBeGreaterThan(0);
    // Still sounding in the last cycle: it keeps looping past one cycle.
    expect(on.lastS, `${r.name} loop stopped by itself`).toBeGreaterThan(seconds - r.durationS);
    const stopAt = Math.round(seconds * 0.4 * 128) / 128 / 1; // a render-quantum-friendly time
    const off = await render(page, r.name, { loop: true, seconds, stopAt });
    expect(off.lastS, `${r.name} still sounding after stop`).toBeLessThan(stopAt + 0.1);
  }
});

test("ducking halves the ambience bus; mute zeroes master; volume scales", async ({ page }) => {
  const full = await render(page, "fuel_hiss", { loop: true, seconds: 2 });
  const duck = await render(page, "fuel_hiss", { loop: true, seconds: 2, duck: true });
  // The 150 ms ramp is ~4 % of the 2 s render: the RMS ratio lands just above 0.5.
  expect(duck.rms / full.rms).toBeGreaterThan(0.48);
  expect(duck.rms / full.rms).toBeLessThan(0.56);

  const muted = await page.evaluate(async () => {
    const { AudioEngine } = (await import(
      /* @vite-ignore */ `${"/src/audio/"}engine.ts`
    )) as Engine;
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    const e = new AudioEngine(ctx, ctx.destination, 1);
    e.setMaster(0.8, true);
    e.loop("engine_hum", true);
    e.play("chime");
    const d = (await ctx.startRendering()).getChannelData(0);
    let peak = 0;
    // after the 30 ms master ramp
    for (let i = 2400; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i] ?? 0));
    return { peak, master: e.master.gain.value };
  });
  expect(muted.peak).toBe(0);
  expect(muted.master).toBe(0);

  const loud = await render(page, "chime", { seconds: 1, master: 1 });
  const half = await render(page, "chime", { seconds: 1, master: 0.5 });
  expect(half.peak / loud.peak).toBeCloseTo(0.5, 2);
});

test("ducking does not touch one-shots or the radio bus", async ({ page }) => {
  const a = await render(page, "radio_out", { seconds: 0.5 });
  const b = await render(page, "radio_out", { seconds: 0.5, duck: true });
  expect(b.peak).toBeCloseTo(a.peak, 5);
});
