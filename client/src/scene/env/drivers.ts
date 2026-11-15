// The scene's driver singletons (see sceneRefs.ts for the convention). Components read them in
// useFrame and register them in the scene-ref registry; timelines tween them through getRef().
import type { Side, World } from "../../net/protocol";
import { assertNever } from "../../util/assertNever";
import type {
  CloudDrivers,
  FireDrivers,
  PropellerDrivers,
  SkyDrivers,
  WeatherDrivers,
} from "../sceneRefs";

export const SKY: SkyDrivers = { storm: 0, dawn: 0, moon: 1, stars: 1, sun: 0 };

export const CLOUDS: CloudDrivers = { density: 1, storm: 0, dawn: 0, speed: 1 };

export const WEATHER: WeatherDrivers = { rain: 0, droplets: 0, fog: 0.004 };

export const PROPELLERS: PropellerDrivers = { left: 1, right: 1 };

const fire = (): FireDrivers => ({
  flames: 0,
  size: 1,
  smoke: 0,
  flicker: 0,
  boom: 0,
  foam: 0,
  snuff: 0,
});

export const FIRE: Readonly<Record<Side, FireDrivers>> = { left: fire(), right: fire() };

/**
 * Live `fx:burst:*` one-shots per side: `seq` bumps on every burst and each emitter plays it once
 * on its own clock. Timelines use the seek-safe FIRE[side].foam / .snuff progress instead.
 */
export const BURSTS: Record<Side, { seq: number; kind: "foam" | "snuff" }> = {
  left: { seq: 0, kind: "foam" },
  right: { seq: 0, kind: "foam" },
};

export const RUNWAY = {
  stream: { speed: 0, lights: 0 },
  place: { y: -40, z: -600, shown: 0 },
};

/** Exterior landing lights 0..1 (world.landing_lights, tweened). */
export const LANDING_LIGHTS = { on: 0 };

/** Cockpit-visible wing geometry (Wings, WingFire and the window shots share these numbers). */
export const WING = { y: 1.0, z: -0.2, nacelleX: 2.6, nacelleZ: -0.75 } as const;

/** §F9.7 fire levels → drivers. */
export function fireLevel(level: World["fire"]["level"]): FireDrivers {
  switch (level) {
    case "full":
      return { flames: 1, size: 1, smoke: 1, flicker: 0, boom: 0, foam: 0, snuff: 0 };
    case "half":
      return { flames: 0.5, size: 0.7, smoke: 0.7, flicker: 0, boom: 0, foam: 0, snuff: 0 };
    case "smoke":
      return { flames: 0, size: 0.7, smoke: 1, flicker: 0, boom: 0, foam: 0, snuff: 0 };
    case "wisp":
      return { flames: 0, size: 0.7, smoke: 0.2, flicker: 0, boom: 0, foam: 0, snuff: 0 };
    case "flicker":
      return { flames: 0.25, size: 0.7, smoke: 0.4, flicker: 1, boom: 0, foam: 0, snuff: 0 };
    case "none":
      return { flames: 0, size: 1, smoke: 0, flicker: 0, boom: 0, foam: 0, snuff: 0 };
    default:
      return assertNever(level);
  }
}
