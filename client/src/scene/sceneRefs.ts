// Registry of scene objects the cinematics animate (§F14.1 `ctx.refs`). FINAL API.
// Scene components register on mount and unregister on unmount; timelines look objects up at
// build time and must tolerate a missing entry (`undefined`) — e.g. a stub component in M1.
import type { DirectionalLight, Group, Object3D } from "three";
import { rig } from "../cinematics/cameraRig";

/** Imperative controls for things that are not just a transform. */
export interface WingFireHandle {
  /** The group at the burning nacelle (cockpit wing). */
  group: Group;
  /** 0..1 multipliers the timeline tweens (flames / smoke), on top of `world.fire.level`. */
  fire: { scale: number; smoke: number };
  burst(kind: "foam" | "snuff"): void;
}

export interface RunwayHandle {
  group: Group;
  /** Stream speed in m/s (0 = stopped, 60 = rolling) and edge-light opacity 0..1. */
  stream: { speed: number; lights: number };
}

export interface LampHandle {
  /**
   * Override the lamp's emissive intensity (timeline flicker, p1_outro green sweep); null hands
   * control back to the server state.
   */
  setOverride(intensity: number | null, color?: string): void;
}

export interface LightRigHandle {
  /** The lightning directional light (timelines spike it to 6). */
  lightning: DirectionalLight;
}

export interface SceneRefMap {
  pilot: Group; // the captain (head pitch, Zzz, "?")
  pilotSeat: Group; // seat + pilot, slides +0.4 m Z in p1_seat
  flyerAvatar: Group; // the Flyer's character in the right seat
  firstPersonHands: Group;
  exteriorPlane: Group;
  cockpit: Object3D;
  wingFireLeft: WingFireHandle;
  wingFireRight: WingFireHandle;
  runway: RunwayHandle;
  lightRig: LightRigHandle;
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
