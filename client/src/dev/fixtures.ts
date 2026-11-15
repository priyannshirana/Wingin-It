// Fixture worlds for the scene sandbox and the cinematic scrubber (§F18.5). Every value is shaped
// exactly like a Part A message, and the sandbox feeds them through the store's `receive`, so the
// scene renders them with the same code path as a real game. Dev builds only.
import { findControl, STATIONS_FILE } from "../content/stations";
import type { ShotId } from "../cinematics/cameraRig";
import type {
  CinematicId,
  FlyerView,
  Gender,
  LampColor,
  ObjectState,
  RoomState,
  Side,
  StationId,
  World,
} from "../net/protocol";
import { REST_WORLD } from "../scene/env/worldSync";

export const PRESET_NAMES = [
  "lobby",
  "p1_start",
  "p1_calm",
  "p2_start",
  "p2_half",
  "p2_extinguished",
  "p3_start",
  "p3_runway",
  "p3_rolling",
  "landed",
] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

export function isPresetName(v: string | null | undefined): v is PresetName {
  return PRESET_NAMES.some((p) => p === v);
}

export interface PresetOptions {
  /** The rolled FIRE_SIDE (= the damaged side in phase 3). Default "right" (the demo's value). */
  fire_side?: Side;
}

interface PresetDef {
  station: StationId | null;
  shot: ShotId;
  world: (side: Side) => World;
  /** Object states on top of the stations.json defaults. */
  objects: (side: Side) => Record<string, ObjectState>;
}

const lamp = (color: LampColor | null, blinking = false): ObjectState => ({
  kind: "lamp",
  color,
  blinking,
  attention: false,
});

const LR = (side: Side) => (side === "left" ? "L" : "R");

/** §A11 phase starts. */
const phase1 = (): World => ({
  ...REST_WORLD,
  light_rig: "night_alarm",
  alarm: true,
  pilot: { slumped: true, seat_back: false, awake: false },
});

const phase2 = (side: Side): World => ({
  ...REST_WORLD,
  light_rig: "fire",
  pilot: { slumped: true, seat_back: true, awake: false },
  ap_screen: true,
  fire: { side, level: "full" },
  fire_bell: true,
  fuel_hiss: true,
  fog: 0.006,
  static_level: 0.02,
  overhead_all_green: true,
});

const phase3 = (side: Side): World => ({
  ...REST_WORLD,
  light_rig: "storm",
  pilot: { slumped: true, seat_back: true, awake: false },
  ap_screen: true,
  fire: { side, level: "wisp" },
  propeller_stopped: side,
  engine_hum: "one_engine",
  weather: "storm",
  fog: 0.035,
  turbulence: 0.15,
  static_level: 0.04,
  overhead_all_green: true,
});

/** Overhead after p1_outro: every lamp green and steady, the autopilot screen on. */
const overheadDone = (): Record<string, ObjectState> => ({
  OH_GREEN_LAMP: lamp("green"),
  OH_MASTER_LAMP: lamp("green"),
  OH_AP_LAMP: lamp("green"),
  OH_AP_SCREEN: { kind: "screen", on: true },
});

/** Front panel after C1–C3 (the demo's phase3_preset): gear down, three greens, flaps set. */
const gearDown = (): Record<string, ObjectState> => ({
  FP_LEVER_4: { kind: "lever", value: "down" },
  FP_GEAR_LAMP_1: lamp("green"),
  FP_GEAR_LAMP_2: lamp("green"),
  FP_GEAR_LAMP_3: lamp("green"),
  FP_FLAP_L: { kind: "notch", value: 2 },
  FP_FLAP_R: { kind: "notch", value: 1 },
});

const PRESETS: Readonly<Record<PresetName, PresetDef>> = {
  lobby: { station: null, shot: "WIDE_INTERIOR", world: () => REST_WORLD, objects: () => ({}) },
  p1_start: {
    station: "overhead",
    shot: "OVERHEAD",
    world: phase1,
    objects: () => ({ OH_MASTER_LAMP: lamp("red", true) }),
  },
  p1_calm: {
    station: "overhead",
    shot: "OVERHEAD",
    world: () => ({ ...phase1(), light_rig: "night_calm", alarm: false }),
    objects: () => ({ OH_AP_LAMP: lamp("blue", true) }),
  },
  p2_start: {
    station: "pedestal",
    shot: "PEDESTAL",
    world: phase2,
    objects: (side) => ({ ...overheadDone(), [`PD_FIRE_LAMP_${LR(side)}`]: lamp("red", true) }),
  },
  p2_half: {
    station: "pedestal",
    shot: "PEDESTAL",
    world: (side) => ({ ...phase2(side), fire: { side, level: "half" } }),
    objects: (side) => ({ ...overheadDone(), [`PD_FIRE_LAMP_${LR(side)}`]: lamp("red") }),
  },
  p2_extinguished: {
    station: "pedestal",
    shot: "PEDESTAL",
    world: (side) => ({
      ...phase2(side),
      light_rig: "night_calm",
      fire: { side, level: "wisp" },
      fire_bell: false,
      fuel_hiss: false,
    }),
    objects: () => overheadDone(),
  },
  p3_start: { station: "front", shot: "FRONT", world: phase3, objects: () => overheadDone() },
  p3_runway: {
    station: "front",
    shot: "FRONT",
    world: (side) => ({
      ...phase3(side),
      weather: "rain",
      fog: 0.012,
      landing_lights: true,
      runway: "far",
    }),
    objects: () => ({ ...overheadDone(), ...gearDown() }),
  },
  p3_rolling: {
    station: "front",
    shot: "FRONT",
    world: (side) => ({
      ...phase3(side),
      weather: "rain_light",
      fog: 0.012,
      turbulence: 0,
      landing_lights: true,
      runway: "rolling",
    }),
    objects: () => ({ ...overheadDone(), ...gearDown() }),
  },
  landed: {
    station: "front",
    shot: "FLYER_DEFAULT",
    world: (side) => ({
      ...phase3(side),
      light_rig: "dawn",
      pilot: { slumped: false, seat_back: true, awake: true },
      engine_hum: "off",
      weather: "clear_dawn",
      fog: 0.004,
      turbulence: 0,
      static_level: 0,
      landing_lights: true,
      runway: "stopped",
    }),
    objects: () => ({ ...overheadDone(), ...gearDown() }),
  },
};

/** The preset each cinematic starts from (the world before it), for /dev/cinematic. */
export const PRESET_BEFORE: Readonly<Record<CinematicId, PresetName>> = {
  prologue: "lobby",
  p1_intro: "p1_start",
  p1_seat: "p1_calm",
  p1_outro: "p1_calm",
  p2_intro: "p1_calm",
  p2_extinguish: "p2_half",
  p2_outro: "p2_extinguished",
  p3_intro: "p3_start",
  lightning_strike: "p3_start",
  p3_runway_reveal: "p3_start",
  p3_touchdown: "p3_runway",
  landing: "p3_rolling",
  ending: "landed",
  crash: "p1_start",
};

export function presetStation(name: PresetName): StationId | null {
  return PRESETS[name].station;
}

/** The default shot for a preset (its station shot; the wide / default view otherwise). */
export function presetShot(name: PresetName): ShotId {
  return PRESETS[name].shot;
}

export function presetWorld(name: PresetName, opts: PresetOptions = {}): World {
  return PRESETS[name].world(opts.fire_side ?? "right");
}

/** Every object at its stations.json default. */
export function defaultObjects(): Record<string, ObjectState> {
  const out: Record<string, ObjectState> = {};
  for (const c of STATIONS_FILE.stations.flatMap((s) => s.controls)) out[c.id] = c.default;
  return out;
}

export function presetObjects(
  name: PresetName,
  opts: PresetOptions = {},
): Record<string, ObjectState> {
  return { ...defaultObjects(), ...PRESETS[name].objects(opts.fire_side ?? "right") };
}

export class FixtureError extends Error {}

const LAMP_COLORS: readonly LampColor[] = ["red", "green", "blue", "yellow"];

/**
 * `lamps=OH_MASTER_LAMP:red:blink:ring,FP_GEAR_LAMP_3:red` → lamp object states. Each entry is
 * `ID:color|off[:blink][:ring]`; `ring` sets `attention` (which the cockpit never draws, §A6).
 */
export function parseLamps(spec: string | null | undefined): Record<string, ObjectState> {
  const out: Record<string, ObjectState> = {};
  if (!spec) return out;
  for (const raw of spec.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [id = "", color = "", ...flags] = entry.split(":");
    const control = findControl(id)?.control;
    if (!control || control.type !== "Lamp") throw new FixtureError(`lamps: ${id} is not a lamp`);
    const lit = LAMP_COLORS.find((c) => c === color);
    if (!lit && color !== "off") throw new FixtureError(`lamps: bad color "${color}" for ${id}`);
    for (const f of flags) {
      if (f !== "blink" && f !== "ring") throw new FixtureError(`lamps: bad flag "${f}" for ${id}`);
    }
    out[id] = {
      kind: "lamp",
      color: lit ?? null,
      blinking: flags.includes("blink"),
      attention: flags.includes("ring"),
    };
  }
  return out;
}

export interface SceneFixture extends PresetOptions {
  preset: PresetName;
  lamps?: Record<string, ObjectState>;
}

/** The `flyer_view` a server would send in this preset (nothing interactive in the sandbox). */
export function presetFlyerView(f: SceneFixture): FlyerView {
  return {
    type: "flyer_view",
    station: presetStation(f.preset),
    interactive: [],
    objects: { ...presetObjects(f.preset, f), ...f.lamps },
    world: presetWorld(f.preset, f),
    quick_replies: null,
  };
}

/** A two-player `room_state` so the scene picks up the Flyer character's gender. */
export function fixtureRoomState(flyerGender: Gender, towerGender: Gender = "male"): RoomState {
  return {
    type: "room_state",
    code: "SCNE",
    status: "PLAYING",
    demo: false,
    mock_speech: true,
    players: [
      {
        id: "fx-flyer",
        name: "Flyer",
        role: "flyer",
        lang: "en",
        gender: flyerGender,
        ready: true,
        connected: true,
        is_bot: false,
      },
      {
        id: "fx-tower",
        name: "Tower",
        role: "tower",
        lang: "hi",
        gender: towerGender,
        ready: true,
        connected: true,
        is_bot: false,
      },
    ],
    can_start: false,
    block_reason: null,
    play_again_votes: [],
  };
}
