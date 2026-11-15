import type { DirectionalLight, Group, Object3D, Vector3 } from "three";
import { rig } from "../cinematics/cameraRig";
import type { LightRig as LightRigName } from "../net/protocol";

// FINAL API (M3a). The registry cinematics use to reach scene objects (§F14.1 `ctx.refs`).
//
// How to use it from a Flyer timeline (cinematics/flyer/*):
// - Every "drivers" object is a plain object of numbers that the owning component reads in
//   `useFrame` (no React state). Tween those numbers directly with GSAP inside the timeline, e.g.
//   `const fire = getRef("wingFireRight")?.fire;`
//   `if (fire) tl.to(fire, { flames: 1, smoke: 1, duration: 0.2 }, at(0.8));`
// - End-state rule: the value a driver has at the timeline's end must equal what the next
//   `World` maps to (the mapping each owner applies is documented on each field below). The
//   owner re-syncs from `World` when a newer world arrives after the cinematic; if your end state
//   matches, that sync is a no-op and nothing jumps.
// - While a cinematic plays the owners never touch their drivers (scene/env/worldSync.ts), so the
//   timeline owns them completely. Use tweens and idempotent `tl.call`s only (seek / skip safe).
// - Group refs (`pilotSeat`, `exteriorPlane`, `cockpit`, `*.group`) may be tweened through their
//   `position` / `rotation`; only `pilotSeat.position.z` is also synced from World (seat_back).

/** Fire on one side (cockpit nacelle and exterior-plane nacelle share it). */
export interface FireDrivers {
  /** Flame amount 0..1 (fraction of the 120 sprites): full 1, half 0.5, flicker 0.25, else 0. */
  flames: number;
  /** Flame and smoke sprite size multiplier: full / none 1, every other level 0.7. */
  size: number;
  /** Smoke amount 0..1 (fraction of the 60 sprites): full 1, half 0.7, smoke 1, wisp 0.2, flicker 0.4, none 0. */
  smoke: number;
  /** 1 = the flames gate on and off at random 0.4–0.9 s intervals (`flicker` level), else 0. */
  flicker: number;
  /**
   * p2_intro fireball progress: tween 0 → 1 over ~0.6 s (sphere 0 → 2.5 m, fading out). It is
   * hidden at exactly 0 and 1, so leave it at 1 (or 0) at the end; World sync resets it to 0.
   */
  boom: number;
  /**
   * Seek-safe white puffs (p2_extinguish): tween 0 → 1 over 0.8 s (`foam`) / 0.5 s (`snuff`).
   * Hidden at 0 and 1; World sync resets them to 0. Prefer these over `burst()` in timelines.
   */
  foam: number;
  snuff: number;
}

export interface WingFireHandle {
  /** The group at the cockpit-visible burning nacelle. */
  group: Group;
  fire: FireDrivers;
  /**
   * Live one-shot puff for the server's `fx:burst:<foam|snuff>` (wall-clock, not seekable). Inside
   * a timeline tween `fire.foam` / `fire.snuff` instead, so skipping never replays a puff.
   */
  burst(kind: "foam" | "snuff"): void;
}

export interface RunwayHandle {
  /** The runway under the cockpit (a twin copy sits under the exterior plane). */
  group: Group;
  /**
   * Stream speed in m/s and edge-light brightness 0..1 (World: hidden 0/0, far 0/1, rolling 60/1,
   * stopped 0/0.45).
   */
  stream: { speed: number; lights: number };
  /**
   * Placement of the threshold relative to each stage origin, in meters, and `shown` 0..1 (strip
   * opacity). World: hidden (y −40, z −600, shown 0); far (y −40, z −600, shown 1); rolling and
   * stopped (y −1.2, z +300, shown 1), i.e. the plane is 300 m past the threshold. Both copies
   * read it, so tween these (not `group.position`) to move the runway.
   */
  place: { y: number; z: number; shown: number };
}

export interface LampHandle {
  /**
   * Override the lamp's emissive intensity (timeline flicker, p1_outro green sweep); null hands
   * control back to the server state.
   */
  setOverride(intensity: number | null, color?: string): void;
}

export interface LightRigHandle {
  /** The lightning directional light (timelines spike it to 6; the sky flashes with it). */
  lightning: DirectionalLight;
  /**
   * Cross-fade to a rig over `seconds` (§F10.1 `setLightRig`), overriding `world.light_rig`
   * until the next world sync. Idempotent: put it in a `tl.call` at the beat's position (a seek
   * fires the calls in order, so the last one wins). The lightning light is not part of any rig:
   * tween `lightning.intensity` 0 → 6 → 0 yourself and end at 0.
   */
  setRig(name: LightRigName, seconds: number): void;
}

/** The captain's pose (§F9.8). All 0..1 unless noted; the World mapping is given per field. */
export interface PilotPose {
  /** Head pitched 60° forward, torso leaned 25° (World: pilot.slumped ? 1 : 0). */
  slump: number;
  /** Prologue yawn, arms up (World: always 0, so end at 0). */
  stretch: number;
  /** Eyes open (World: pilot.awake ? 1 : 0). */
  awake: number;
  /** Extra head yaw −1..1 (World leaves it alone; end at 0). */
  look: number;
  /** "Zzz" loop visibility (World: slumped ? 1 : 0). */
  zzz: number;
  /** "Zzz" size (World: 1; p1_seat may pop it to 1.6 and must end at 1). */
  zzzScale: number;
  /**
   * "?" pop scale with an automatic look-around (World: awake && seat_back && !slumped ? 1 : 0,
   * i.e. only after the landing). Tween with `back.out`.
   */
  question: number;
}

/** The captain. His seat slide is `pilotSeat.position.z` (World: 0.3, or 0.7 when seat_back). */
export interface PilotHandle {
  group: Group;
  pose: PilotPose;
}

/**
 * The Flyer character's pose weights, 0..1 (all 0 = idle; World sync returns every weight to 0,
 * so a pose held at the end of a cinematic is eased back to idle by the next world).
 */
export interface AvatarPose {
  /** Hands to the cheeks (prologue, when the captain slumps). */
  panic: number;
  /** Gripping the armrests (p3_touchdown). */
  brace: number;
  /** Both arms up with a bounce (landing). */
  cheer: number;
  /** Head / shoulders turned toward the captain. */
  turn: number;
}

/** The Flyer's character; hidden automatically whenever the camera is in first person. */
export interface AvatarHandle {
  group: Group;
  pose: AvatarPose;
}

/** First-person mittens; hidden automatically during cinematics and in third-person shots. */
export interface HandsHandle {
  group: Group;
  /** The nearer mitten pokes toward a world point and back (90 ms out + 90 ms back). */
  poke(point: Vector3): void;
}

/** Sky blend (§F9.7): storm / dawn weights over the night gradient, and the moon / stars / sun. */
export interface SkyDrivers {
  /** World: storm / rain 1, rain_light 0.7, else 0. */
  storm: number;
  /** World: clear_dawn 1, else 0. */
  dawn: number;
  /** Moon brightness (World: 1 at night, 0 in storm / dawn; p1_outro may push it to ~1.6). */
  moon: number;
  /** World: 1 at night, 0 in storm / dawn. */
  stars: number;
  /** Sunrise disc + low sun (World: = dawn). */
  sun: number;
}

export interface CloudDrivers {
  /** Puff density: 1 = 40 puffs, 2 = 80 (World: 1 + storm); p1_outro may part them toward 0.4. */
  density: number;
  /** Storm look: color → #59607A, puffs pulled close (World: storm 1, rain 0.85, rain_light 0.5). */
  storm: number;
  /** Dawn tint #FFE2C4 (World: clear_dawn 1, else 0). */
  dawn: number;
  /** Scroll speed multiplier (1 = 30 m/s; World leaves it alone, so end at 1). */
  speed: number;
}

export interface WeatherDrivers {
  /** Rain amount 0..1 of the 2,000 drops (World: rain / storm 1, rain_light 0.4, else 0). */
  rain: number;
  /** Windshield droplet count 0..60 (World: storm / rain 40, rain_light 20, else 0). */
  droplets: number;
  /** FogExp2 density (World: = world.fog, tweened 2 s). */
  fog: number;
}

/**
 * Propeller spin 0..1 per side (1 = 30 rad/s); cockpit wings and the exterior plane share it.
 * World: 0 on `propeller_stopped`'s side, else 1 (spins down over 2.5 s).
 */
export interface PropellerDrivers {
  left: number;
  right: number;
}

export interface SceneRefMap {
  pilot: PilotHandle; // the captain (pose, Zzz, "?")
  pilotSeat: Group; // seat + pilot, slides +0.4 m Z in p1_seat (the pilot follows it)
  flyerAvatar: AvatarHandle; // the Flyer's character in the right seat
  firstPersonHands: HandsHandle;
  exteriorPlane: Group; // root of the exterior toy plane (rest position = EXTERIOR_PLANE)
  cockpit: Object3D;
  wingFireLeft: WingFireHandle;
  wingFireRight: WingFireHandle;
  runway: RunwayHandle;
  lightRig: LightRigHandle;
  sky: SkyDrivers;
  clouds: CloudDrivers;
  weather: WeatherDrivers;
  propellers: PropellerDrivers;
}

export type SceneRefKey = keyof SceneRefMap;

const refs: Partial<SceneRefMap> = {};
const lamps = new Map<string, LampHandle>();

/** Register a scene object; returns the unregister function (call it on unmount). */
export function registerRef<K extends SceneRefKey>(key: K, value: SceneRefMap[K]): () => void {
  refs[key] = value;
  return () => {
    if (refs[key] === value) delete refs[key];
  };
}

export function getRef<K extends SceneRefKey>(key: K): SceneRefMap[K] | undefined {
  return refs[key];
}

/** Lamps register by object id (e.g. "OH_MASTER_LAMP"). */
export function registerLamp(id: string, handle: LampHandle): () => void {
  lamps.set(id, handle);
  return () => {
    if (lamps.get(id) === handle) lamps.delete(id);
  };
}

export function getLamp(id: string): LampHandle | undefined {
  return lamps.get(id);
}

export function lampIds(): string[] {
  return [...lamps.keys()];
}

/** The camera rig is a module singleton; re-exported here so `ctx.refs` has everything. */
export { rig };
