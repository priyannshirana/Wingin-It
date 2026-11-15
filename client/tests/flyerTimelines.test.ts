import { DirectionalLight, Group, Object3D } from "three";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cutNow, EXTERIOR_PLANE, rig } from "../src/cinematics/cameraRig";
import { buildFlyerTimeline } from "../src/cinematics/timelines";
import type { TimelineCtx } from "../src/cinematics/timelineKit";
import { cinematicDurationMs, CINEMATIC_IDS } from "../src/content/cinematics";
import type { CinematicId } from "../src/net/protocol";
import {
  CLOUDS,
  FIRE,
  LANDING_LIGHTS,
  PROPELLERS,
  RUNWAY,
  SKY,
  WEATHER,
} from "../src/scene/env/drivers";
import { registerLamp, registerRef, type AvatarPose, type PilotPose } from "../src/scene/sceneRefs";

// Every Flyer timeline (§F14.1, §F14.2): seeking through it, skipping it (`progress(1)`) and
// seeking half way then skipping all leave the same scene state, and the title / cues / loops
// it switched on end the way a full play-through ends. The scene refs are the real driver
// singletons plus plain stand-ins for the groups.

const pilotPose = (): PilotPose => ({
  slump: 0,
  stretch: 0,
  awake: 1,
  look: 0,
  zzz: 0,
  zzzScale: 1,
  question: 0,
});
const avatarPose = (): AvatarPose => ({ panic: 0, brace: 0, cheer: 0, turn: 0 });

const pilot = { group: new Group(), pose: pilotPose() };
const avatar = { group: new Group(), pose: avatarPose() };
const seat = new Group();
const plane = new Group();
const lightning = new DirectionalLight();
const log = { rig: "", lamps: {} as Record<string, number | null> };
const lampIds = [
  "OH_GREEN_LAMP",
  "OH_MASTER_LAMP",
  "OH_AP_LAMP",
  "FP_GEAR_LAMP_1",
  "FP_GEAR_LAMP_2",
];
const cleanups: (() => void)[] = [];

beforeAll(() => {
  cleanups.push(
    registerRef("sky", SKY),
    registerRef("clouds", CLOUDS),
    registerRef("weather", WEATHER),
    registerRef("propellers", PROPELLERS),
    registerRef("wingFireLeft", { group: new Group(), fire: FIRE.left, burst: () => {} }),
    registerRef("wingFireRight", { group: new Group(), fire: FIRE.right, burst: () => {} }),
    registerRef("runway", { group: new Group(), stream: RUNWAY.stream, place: RUNWAY.place }),
    registerRef("pilot", pilot),
    registerRef("pilotSeat", seat),
    registerRef("flyerAvatar", avatar),
    registerRef("exteriorPlane", plane),
    registerRef("cockpit", new Object3D()),
    registerRef("lightRig", {
      lightning,
      setRig: (name) => {
        log.rig = name;
      },
    }),
  );
  for (const id of lampIds) {
    cleanups.push(
      registerLamp(id, {
        setOverride: (v) => {
          log.lamps[id] = v;
        },
      }),
    );
  }
});
afterAll(() => cleanups.forEach((c) => c()));

/** The scene as the world before a cinematic leaves it (a clean night sky, plane at rest). */
function reset(): void {
  cutNow("FLYER_DEFAULT");
  Object.assign(rig, { roll: 0, pitchOffset: 0, shake: 0, restShake: 0 });
  Object.assign(SKY, { storm: 0, dawn: 0, moon: 1, stars: 1, sun: 0 });
  Object.assign(CLOUDS, { density: 1, storm: 0, dawn: 0, speed: 1 });
  Object.assign(WEATHER, { rain: 0, droplets: 0, fog: 0.004 });
  Object.assign(PROPELLERS, { left: 1, right: 1 });
  for (const f of [FIRE.left, FIRE.right]) {
    Object.assign(f, { flames: 0, size: 1, smoke: 0, flicker: 0, boom: 0, foam: 0, snuff: 0 });
  }
  Object.assign(RUNWAY.stream, { speed: 0, lights: 0 });
  Object.assign(RUNWAY.place, { y: -40, z: -600, shown: 0 });
  LANDING_LIGHTS.on = 0;
  Object.assign(pilot.pose, pilotPose());
  Object.assign(avatar.pose, avatarPose());
  seat.position.set(0, 0, 0.3);
  plane.position.copy(EXTERIOR_PLANE);
  plane.rotation.set(0, 0, 0);
  plane.visible = true;
  lightning.intensity = 0;
  log.rig = "";
  log.lamps = {};
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

function snapshot(ui: UiLog): unknown {
  const nums = (o: object) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r6(v) : v]));
  return {
    rig: {
      pos: rig.position.toArray().map(r6),
      target: rig.target.toArray().map(r6),
      ...nums({ roll: rig.roll, pitch: rig.pitchOffset, shake: rig.shake, rest: rig.restShake }),
    },
    sky: nums(SKY),
    clouds: nums(CLOUDS),
    weather: nums(WEATHER),
    props: nums(PROPELLERS),
    fire: [nums(FIRE.left), nums(FIRE.right)],
    runway: [nums(RUNWAY.stream), nums(RUNWAY.place)],
    landing: r6(LANDING_LIGHTS.on),
    pilot: nums(pilot.pose),
    avatar: nums(avatar.pose),
    seat: r6(seat.position.z),
    plane: [
      plane.position.toArray().map(r6),
      plane.rotation
        .toArray()
        .slice(0, 3)
        .map((v) => (typeof v === "number" ? r6(v) : v)),
      plane.visible,
    ],
    lightning: r6(lightning.intensity),
    rigName: log.rig,
    lamps: log.lamps,
    card: ui.card,
    cues: Object.fromEntries([...ui.cues].filter(([, on]) => on)),
    loops: Object.fromEntries([...ui.loops]),
  };
}

interface UiLog {
  card: unknown;
  cues: Map<string, boolean>;
  loops: Map<string, boolean>;
}

function ctxFor(params: TimelineCtx["params"], demo: boolean, ui: UiLog): TimelineCtx {
  return {
    params,
    demo,
    retry: params.retry === true,
    titleCard: (c) => (ui.card = c),
    cue: (name, on) => ui.cues.set(name, on),
    flash: () => {},
    sfx: { play: () => {}, loop: (name, on) => ui.loops.set(name, on) },
  };
}

function run(
  id: CinematicId,
  how: "play" | "skip" | "half",
  opts: { demo?: boolean; retry?: boolean } = {},
): unknown {
  reset();
  const ui: UiLog = { card: null, cues: new Map(), loops: new Map() };
  const params = {
    fire_side: "left",
    stopped_side: "left",
    damaged_side: "left",
    retry: opts.retry === true,
    fuel_left_s: 73,
    total_time_s: 412,
  };
  const ms = cinematicDurationMs(id, opts);
  const tl = buildFlyerTimeline(id, ctxFor(params, opts.demo === true, ui), ms);
  const D = tl.duration();
  if (how === "play") {
    for (let t = 0.05; t < D; t += 0.05) tl.seek(t, false);
    tl.seek(D, false);
  } else if (how === "half") {
    tl.seek(D / 2, false);
    tl.progress(1, false);
  } else {
    tl.progress(1, false);
  }
  const out = snapshot(ui);
  tl.kill();
  return out;
}

const VARIANTS: [CinematicId, { demo?: boolean; retry?: boolean }][] = [
  ...CINEMATIC_IDS.map((id): [CinematicId, { demo?: boolean; retry?: boolean }] => [id, {}]),
  ["prologue", { demo: true }],
  ["ending", { demo: true }],
  ["p1_intro", { retry: true }],
  ["p2_intro", { retry: true }],
  ["p3_intro", { retry: true }],
];

describe("Flyer timelines: seek / skip / play end in the same state (§F14.1)", () => {
  beforeEach(reset);
  for (const [id, opts] of VARIANTS) {
    it(`${id} ${JSON.stringify(opts)}`, () => {
      const played = run(id, "play", opts);
      expect(run(id, "skip", opts)).toEqual(played);
      expect(run(id, "half", opts)).toEqual(played);
    });
  }

  it("prologue ends in the phase 1 start pose: slumped captain, first person at the overhead", () => {
    const end = run("prologue", "skip") as {
      pilot: Record<string, number>;
      rig: { pos: number[]; roll: number };
      sky: Record<string, number>;
      runway: Record<string, number>[];
      card: unknown;
      loops: Record<string, boolean>;
    };
    expect(end.pilot).toMatchObject({ slump: 1, awake: 0, zzz: 1, stretch: 0 });
    expect(end.rig.roll).toBe(0);
    expect(end.sky).toMatchObject({ dawn: 0, stars: 1, moon: 1 });
    expect(end.runway[1]).toMatchObject({ shown: 0 });
    expect(end.card).toBeNull();
    expect(end.loops.alarm_master).toBe(true);
  });
});
