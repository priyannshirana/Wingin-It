import { describe, expect, it } from "vitest";
import { CINEMATIC_IDS, cinematicDurationMs } from "../src/content/cinematics";
import { type CinematicParams, type TimelineCtx } from "../src/cinematics/timelineKit";
import { buildTowerTimeline } from "../src/cinematics/towerTimelines";
import type { CinematicId } from "../src/net/protocol";
import type { CueName, TitleCardSpec } from "../src/state/store";

// §F14.4 Tower timelines: every beat at its spec time, and seek / skip leave the same state as a
// full play (every effect is a positioned, idempotent call).

type Ev =
  | { t: number; kind: "cue"; name: CueName; on: boolean }
  | { t: number; kind: "title"; card: TitleCardSpec | null }
  | { t: number; kind: "flash"; color: string; ms: number; opacity?: number }
  | { t: number; kind: "sfx"; name: string };

interface Rec {
  ctx: TimelineCtx;
  cues: Partial<Record<CueName, boolean>>;
  title: { card: TitleCardSpec | null };
  events: Ev[];
  now: { t: number };
}

function recorder(params: CinematicParams = {}, demo = false): Rec {
  const now = { t: 0 };
  const cues: Partial<Record<CueName, boolean>> = {};
  const title: { card: TitleCardSpec | null } = { card: null };
  const events: Ev[] = [];
  const ctx: TimelineCtx = {
    params,
    demo,
    retry: params.retry === true,
    titleCard: (card) => {
      title.card = card;
      events.push({ t: now.t, kind: "title", card });
    },
    cue: (name, on) => {
      cues[name] = on;
      events.push({ t: now.t, kind: "cue", name, on });
    },
    flash: (color, ms, opacity) => events.push({ t: now.t, kind: "flash", color, ms, opacity }),
    sfx: {
      play: (name) => events.push({ t: now.t, kind: "sfx", name }),
      loop: () => {},
    },
  };
  return { ctx, cues, title, events, now };
}

const STEP = 0.01;

/** The cues a recorder currently holds on, sorted. */
const onCues = (r: Rec) =>
  Object.entries(r.cues)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort();
const ENDING_PARAMS = { fuel_left_s: 42, total_time_s: 305 };

function build(id: CinematicId, rec: Rec, v: { demo?: boolean; retry?: boolean } = {}) {
  return buildTowerTimeline(id, rec.ctx, cinematicDurationMs(id, v));
}

/** Plays the timeline through in 10 ms steps, recording when each call fires. */
function playThrough(id: CinematicId, v: { demo?: boolean; retry?: boolean } = {}) {
  const rec = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
  const tl = build(id, rec, v);
  const D = tl.duration();
  const n = Math.round(D / STEP);
  for (let i = 1; i <= n; i++) {
    rec.now.t = Math.min(D, i * STEP);
    tl.seek(rec.now.t, false);
  }
  tl.kill();
  return rec;
}

/** First time `cue` switched to `on`. */
function cueAt(rec: Rec, name: CueName, on: boolean): number | undefined {
  return rec.events.find((e) => e.kind === "cue" && e.name === name && e.on === on)?.t;
}
const titleAt = (rec: Rec, card: TitleCardSpec | null) =>
  rec.events.find((e) => e.kind === "title" && JSON.stringify(e.card) === JSON.stringify(card))?.t;
const sfxAt = (rec: Rec, name: string) =>
  rec.events.find((e) => e.kind === "sfx" && e.name === name)?.t;
const flashAt = (rec: Rec) => rec.events.find((e) => e.kind === "flash");

const near = (actual: number | undefined, expected: number) => {
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? NaN) - expected)).toBeLessThanOrEqual(STEP + 1e-6);
};

type CueSpec = [CueName, number, number | null]; // on at, off at (null = held to the end)

const CUES: Record<CinematicId, CueSpec[]> = {
  prologue: [
    // the 12 s layout scaled to the 28 s message (Tower prologue rewrite pending, §F14.4)
    ["radar_boot", 0, 2.5 * (28 / 12)],
    ["mayday_stamp", 8.5 * (28 / 12), null],
  ],
  p1_intro: [["manual_open", 0, null]],
  p1_seat: [],
  p1_outro: [
    ["dots_green", 0, null],
    ["autopilot_banner", 4, 6],
    ["manual_close", 5.4, null],
  ],
  p2_intro: [
    ["screen_shake", 0.8, 1.4],
    ["fire_icon", 0.8, null],
  ],
  p2_extinguish: [["smoke_icon", 0.5, null]],
  p2_outro: [
    ["storm_in", 0, null],
    ["manual_close", 7, null],
  ],
  p3_intro: [
    ["subtitle_glitch", 2.5, 3.1],
    ["lifeline_dots_pop", 3, 5],
    ["glide_draw", 5, null],
  ],
  lightning_strike: [["radar_flicker", 0, 0.5]],
  p3_runway_reveal: [["runway_pulse", 0.5, 3]],
  p3_touchdown: [["blip_touchdown", 2, 3]],
  landing: [
    ["landed_stamp", 3, null],
    ["confetti", 3, 5],
    ["dawn_warm", 3, null],
  ],
  ending: [
    ["dawn_warm", 0, null],
    ["fade_cream", 4, null],
  ],
  crash: [
    ["blip_spiral", 0, null],
    ["poof", 2.6, null],
  ],
};

describe("Tower timelines: beats at their spec times (§F14.4)", () => {
  for (const id of CINEMATIC_IDS) {
    it(`${id}: every cue switches on and off on time; end-state cues are held`, () => {
      const rec = playThrough(id);
      for (const [name, on, off] of CUES[id]) {
        near(cueAt(rec, name, true), on);
        if (off === null) {
          expect(cueAt(rec, name, false), `${id} ${name} held`).toBeUndefined();
          expect(rec.cues[name], `${id} ${name} end state`).toBe(true);
        } else {
          near(cueAt(rec, name, false), off);
        }
      }
    });

    it(`${id}: every one-shot sound and flash fires exactly once in a play-through`, () => {
      const rec = playThrough(id);
      const shots = rec.events
        .filter((e) => e.kind === "sfx" || e.kind === "flash")
        .map((e) => (e.kind === "sfx" ? `sfx:${e.name}` : `flash@${e.t.toFixed(2)}`));
      expect(shots.length, id).toBe(new Set(shots).size);
    });
  }

  // SPEC-ASSUMPTION: the Tower prologue is still laid out on the old 12 s beats until its §F14.4
  // rewrite; the 28 s message scales them by 28/12.
  it("prologue (28 s): the 12 s layout scaled: MAYDAY slam, stamp thump, flash, title", () => {
    const k = 28 / 12;
    const rec = playThrough("prologue");
    near(sfxAt(rec, "radio_crackle"), 8.5 * k);
    near(sfxAt(rec, "stamp"), 8.5 * k + 0.18);
    near(flashAt(rec)?.t, 8.5 * k);
    near(titleAt(rec, { kind: "phase", phase: 1 }), 10 * k);
    near(titleAt(rec, null), 28);
  });

  it("prologue demo (12 s): the 12 s layout as is", () => {
    const rec = playThrough("prologue", { demo: true });
    near(cueAt(rec, "mayday_stamp", true), 8.5);
    near(titleAt(rec, { kind: "phase", phase: 1 }), 10);
    near(titleAt(rec, null), 12);
  });

  it("p1_intro retry (3.2 s): the title for 2 s, then the manual opens", () => {
    const rec = playThrough("p1_intro", { retry: true });
    near(titleAt(rec, { kind: "phase", phase: 1 }), 0);
    near(titleAt(rec, null), 2);
    near(cueAt(rec, "manual_open", true), 2);
  });

  it("p1_intro without retry shows no title card", () => {
    const rec = playThrough("p1_intro");
    expect(rec.events.some((e) => e.kind === "title" && e.card !== null)).toBe(false);
  });

  it("p2_intro: 0.8 shake + fire icon + crackle; 6–8 the phase 2 title", () => {
    const rec = playThrough("p2_intro");
    near(sfxAt(rec, "radio_crackle"), 0.8);
    near(flashAt(rec)?.t, 0.8);
    near(titleAt(rec, { kind: "phase", phase: 2 }), 6);
    near(titleAt(rec, null), 8);
  });

  it("p3_intro: 2 lightning (60 ms white at 40 %), thunder 0.8 s later, 2.5–5 title", () => {
    const rec = playThrough("p3_intro");
    const f = flashAt(rec);
    near(f?.t, 2);
    expect(f).toMatchObject({ color: "#FFFFFF", ms: 60, opacity: 0.4 });
    near(sfxAt(rec, "thunder"), 2.8);
    near(titleAt(rec, { kind: "phase", phase: 3 }), 2.5);
    near(titleAt(rec, null), 5);
  });

  it("lightning_strike: a 60 ms white overlay at 30 % at 0", () => {
    const rec = playThrough("lightning_strike");
    near(flashAt(rec)?.t, 0);
    expect(flashAt(rec)).toMatchObject({ color: "#FFFFFF", ms: 60, opacity: 0.3 });
  });

  it("landing: the LANDED thump lands with the stamp at 3", () => {
    const rec = playThrough("landing");
    near(sfxAt(rec, "stamp"), 3.18);
  });

  it("ending: the Flyer's title with fuel and time, from 0.5 to 6 (demo ×4/6)", () => {
    const card: TitleCardSpec = {
      kind: "text",
      key: "end.landed",
      lines: [
        { key: "end.fuel_left", params: { n: 42 } },
        { key: "end.total_time", params: { t: "5:05" } },
      ],
    };
    near(titleAt(playThrough("ending"), card), 0.5);
    const demo = playThrough("ending", { demo: true });
    near(titleAt(demo, card), 0.5 * (4 / 6));
    near(cueAt(demo, "fade_cream", true), 4 * (4 / 6));
  });

  it("crash: POOF at 2.6, crash.title at 4, cleared at 4.6 so its fade ends as CrashCard shows", () => {
    const rec = playThrough("crash");
    near(sfxAt(rec, "boom"), 2.6);
    near(titleAt(rec, { kind: "text", key: "crash.title" }), 4);
    near(titleAt(rec, null), 4.6);
  });
});

describe("Tower timelines: seek and skip are exact (§F14.1)", () => {
  it("prologue: skip, then scrub back to 6 s, takes the MAYDAY stamp off again (§F18.5)", () => {
    const rec = recorder();
    const tl = build("prologue", rec);
    tl.progress(1, false);
    expect(rec.cues.mayday_stamp).toBe(true);
    const k = 28 / 12; // the Tower prologue keeps its 12 s layout, scaled to the 28 s message
    tl.seek(6 * k, false);
    expect(rec.cues.mayday_stamp).toBe(false);
    expect(rec.title.card).toBeNull();
    tl.seek(10.5 * k, false);
    expect(rec.cues.mayday_stamp).toBe(true);
    expect(rec.title.card).toEqual({ kind: "phase", phase: 1 });
    // Seeking back from exactly a beat (GSAP skips the call there) still takes it off.
    tl.seek(8.5 * k, false);
    tl.seek(8.4 * k, false);
    expect(rec.cues.mayday_stamp).toBe(false);
    tl.kill();
  });

  const variants: [CinematicId, { demo?: boolean; retry?: boolean }][] = [
    ...CINEMATIC_IDS.map((id): [CinematicId, object] => [id, {}]),
    ["prologue", { demo: true }],
    ["ending", { demo: true }],
    ["p1_intro", { retry: true }],
    ["p2_intro", { retry: true }],
    ["p3_intro", { retry: true }],
  ];

  for (const [id, v] of variants) {
    const label = `${id} ${JSON.stringify(v)}`;

    it(`${label}: skip (progress 1) leaves exactly the play-through end state`, () => {
      const played = playThrough(id, v);
      const skipped = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
      const tl = build(id, skipped, v);
      tl.progress(1, false);
      const on = (r: Rec) =>
        Object.entries(r.cues)
          .filter(([, value]) => value)
          .map(([name]) => name)
          .sort();
      expect(on(skipped)).toEqual(on(played));
      expect(skipped.title.card).toEqual(played.title.card);
      // Held cues are exactly the table's end-state ones.
      const held = CUES[id]
        .filter(([, , off]) => off === null)
        .map(([name]) => name)
        .sort();
      expect(on(skipped)).toEqual(held);
      tl.kill();
    });

    it(`${label}: backward seeks restore the earlier state, and fire no one-shots`, () => {
      const D = cinematicDurationMs(id, v) / 1000;
      for (let t = 0.05; t < D; t += 0.43) {
        const fresh = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
        const ref = build(id, fresh, v);
        ref.seek(t, false);
        const rec = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
        const tl = build(id, rec, v);
        tl.progress(1, false);
        const before = rec.events.filter((e) => e.kind === "sfx" || e.kind === "flash").length;
        tl.seek(t, false); // backwards
        const after = rec.events.filter((e) => e.kind === "sfx" || e.kind === "flash").length;
        expect(onCues(rec), `${label} back to t=${t.toFixed(2)}`).toEqual(onCues(fresh));
        expect(rec.title.card, `${label} back to t=${t.toFixed(2)}`).toEqual(fresh.title.card);
        expect(after, `${label} one-shots on a backward seek`).toBe(before);
        ref.kill();
        tl.kill();
      }
    });

    it(`${label}: seeking straight to any t = playing up to t`, () => {
      const D = cinematicDurationMs(id, v) / 1000;
      for (let t = 0.05; t < D; t += 0.37) {
        const step = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
        const a = build(id, step, v);
        for (let s = STEP; s <= t; s += STEP) a.seek(s, false);
        a.seek(t, false);
        const jump = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
        const b = build(id, jump, v);
        b.seek(t, false);
        expect(onCues(jump), `${label} t=${t.toFixed(2)}`).toEqual(onCues(step));
        expect(jump.title.card, `${label} t=${t.toFixed(2)}`).toEqual(step.title.card);
        a.kill();
        b.kill();
      }
    });

    it(`${label}: calls are idempotent (skip twice, or seek back and skip again)`, () => {
      const rec = recorder({ ...ENDING_PARAMS, retry: v.retry === true }, v.demo === true);
      const tl = build(id, rec, v);
      tl.progress(1, false);
      const once = { cues: onCues(rec), card: rec.title.card };
      tl.progress(1, false);
      tl.seek(tl.duration() / 2, false);
      tl.progress(1, false);
      expect(onCues(rec)).toEqual(once.cues);
      expect(rec.title.card).toEqual(once.card);
      tl.kill();
    });
  }
});

describe("Tower files never pull in three.js (§F1.2)", () => {
  const sources = import.meta.glob<string>(
    [
      "../src/cinematics/tower/*.{ts,tsx}",
      "../src/ui/tower/*.{ts,tsx}",
      "../src/cinematics/towerTimelines.ts",
      "../src/ui/TitleCard.tsx",
    ],
    { query: "?raw", import: "default", eager: true },
  );
  const files = Object.entries(sources);

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const [file, src] of files) {
    it(`${file} imports no three / R3F / cameraRig / scene`, () => {
      expect(src).not.toMatch(/from\s+["'](three|@react-three\/[^"']+)["']/);
      expect(src).not.toMatch(/from\s+["'][^"']*(cameraRig|\/scene\/)[^"']*["']/);
    });
  }
});
