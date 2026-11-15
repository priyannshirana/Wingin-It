// The camera rig (§F10.1): one mutable rig the CameraRigDriver applies every frame, the shot
// table, and tween helpers that return GSAP animations so timelines can position them.
import gsap from "gsap";
import { Vector3 } from "three";
import type { StationId } from "../net/protocol";

export const rig = {
  position: new Vector3(0.5, 1.3, 0.35),
  target: new Vector3(0.2, 1.0, -1.0),
  roll: 0, // degrees
  pitchOffset: 0, // degrees
  shake: 0,
  restShake: 0,
};

/** The exterior plane's resting position (§F9.7); EXT_* shots are offsets from it. */
export const EXTERIOR_PLANE = new Vector3(0, 50, -300);

export type ShotId =
  | "FLYER_DEFAULT"
  | "OVERHEAD"
  | "PEDESTAL"
  | "FRONT"
  | "RIGHT_WINDOW"
  | "LEFT_WINDOW"
  | "PILOT"
  | "WIDE_INTERIOR"
  | "EXT_SIDE"
  | "EXT_CHASE"
  | "EXT_FRONT_LOW";

export interface Shot {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

const P = EXTERIOR_PLANE;
const ext = (dx: number, dy: number, dz: number): Shot => ({
  position: [P.x + dx, P.y + dy, P.z + dz],
  target: [P.x, P.y, P.z],
});

export const SHOTS: Readonly<Record<ShotId, Shot>> = {
  FLYER_DEFAULT: { position: [0.5, 1.3, 0.35], target: [0.2, 1.0, -1.0] },
  OVERHEAD: { position: [0.35, 1.35, 0.25], target: [0, 1.95, -0.3] },
  PEDESTAL: { position: [0.4, 1.35, 0.25], target: [0, 0.75, -0.45] },
  FRONT: { position: [0.45, 1.3, 0.3], target: [0.1, 0.98, -0.95] },
  RIGHT_WINDOW: { position: [0.5, 1.3, 0.35], target: [3.0, 1.1, -0.2] },
  LEFT_WINDOW: { position: [0.3, 1.3, 0.3], target: [-3.0, 1.1, -0.2] },
  PILOT: { position: [0.4, 1.35, 0.4], target: [-0.5, 1.1, -0.1] },
  WIDE_INTERIOR: { position: [0, 1.6, 1.4], target: [0, 1.1, -0.8] },
  EXT_SIDE: ext(6, 1, 4),
  EXT_CHASE: ext(0, 1.5, 7),
  EXT_FRONT_LOW: ext(0, -0.5, -8),
};

export const SHOT_IDS = Object.keys(SHOTS) as ShotId[];

/** The resting shot while playing = the current station's shot (§F10.1). */
export const STATION_SHOT: Readonly<Record<StationId, ShotId>> = {
  overhead: "OVERHEAD",
  pedestal: "PEDESTAL",
  front: "FRONT",
};

/** The window on the burning / stopped side (`params.fire_side` etc., "left" | "right"). */
export function fireWindowShot(side: string | number | boolean | undefined): ShotId {
  return side === "left" ? "LEFT_WINDOW" : "RIGHT_WINDOW";
}

/** Tween position and target together (`power2.inOut` by default). */
export function moveTo(shot: ShotId, seconds: number, ease = "power2.inOut"): gsap.core.Timeline {
  const s = SHOTS[shot];
  const tl = gsap.timeline();
  const [px, py, pz] = s.position;
  const [tx, ty, tz] = s.target;
  tl.to(rig.position, { x: px, y: py, z: pz, duration: seconds, ease, immediateRender: false }, 0);
  tl.to(rig.target, { x: tx, y: ty, z: tz, duration: seconds, ease, immediateRender: false }, 0);
  return tl;
}

/** Whip pan: 0.5 s `power3.inOut` (§F0.4). */
export function whip(shot: ShotId): gsap.core.Timeline {
  return moveTo(shot, 0.5, "power3.inOut");
}

/** Cut instantly (a zero-length tween so timelines can place it and seeking re-applies it). */
export function cut(shot: ShotId): gsap.core.Timeline {
  return moveTo(shot, 0, "none");
}

/** Apply a shot right now, outside any timeline. */
export function cutNow(shot: ShotId): void {
  gsap.killTweensOf([rig.position, rig.target]);
  const s = SHOTS[shot];
  rig.position.set(...s.position);
  rig.target.set(...s.target);
}

/** `shake = amount`, decaying back to `restShake` over `seconds`. */
export function shakeFor(amount: number, seconds: number): gsap.core.Tween {
  return gsap.fromTo(
    rig,
    { shake: Math.min(1, amount) },
    { shake: rig.restShake, duration: seconds, ease: "power2.out", immediateRender: false },
  );
}

export function rollTo(deg: number, seconds: number, ease = "power2.inOut"): gsap.core.Tween {
  return gsap.to(rig, { roll: deg, duration: seconds, ease, immediateRender: false });
}

export function pitchTo(deg: number, seconds: number, ease = "power2.inOut"): gsap.core.Tween {
  return gsap.to(rig, { pitchOffset: deg, duration: seconds, ease, immediateRender: false });
}

export function setRestShake(amount: number): gsap.core.Tween {
  return gsap.to(rig, { restShake: amount, duration: 0, immediateRender: false });
}
