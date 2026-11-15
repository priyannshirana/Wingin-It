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
/** An exterior shot: camera and aim point as offsets from the plane (aim ahead = lead room). */
const ext = (
  dx: number,
  dy: number,
  dz: number,
  aim: readonly [number, number, number] = [0, 0, 0],
): Shot => ({
  position: [P.x + dx, P.y + dy, P.z + dz],
  target: [P.x + aim[0], P.y + aim[1], P.z + aim[2]],
});

// Station shots are tuned by eye against §F0.3 in /dev/scene (the build-spec values framed the
// overhead canted and too tight, and hid the front panel's lever row behind the pedestal):
// OVERHEAD sits near the panel normal so its rows read level with a slight three-quarter turn;
// FRONT leans up over the yokes so the lever row clears the pedestal's raised top edge.
export const SHOTS: Readonly<Record<ShotId, Shot>> = {
  FLYER_DEFAULT: { position: [0.5, 1.3, 0.35], target: [0.2, 1.0, -1.0] },
  OVERHEAD: { position: [0.29, 1.17, 0.44], target: [-0.01, 1.875, -0.3] },
  // PEDESTAL keeps the lever row (phase 2 targets) above the subtitle zone (upper 70%).
  PEDESTAL: { position: [0.36, 1.35, 0.33], target: [0, 0.45, -0.54] },
  FRONT: { position: [0.2, 1.86, 0.14], target: [0.02, 0.95, -0.95] },
  // Window shots look down onto the wing so it runs as a diagonal through the lower third with
  // the sill and frame as foreground (from seat height the wing hid below the sill).
  RIGHT_WINDOW: { position: [0.62, 1.42, 0.32], target: [2.9, 1.12, -0.5] },
  LEFT_WINDOW: { position: [-0.56, 1.48, 0.06], target: [-2.9, 1.12, -0.6] },
  // Front-right three-quarter from beside the pedestal: cap, mustache and the Zzz against the side
  // window, the seat behind him and the throttle knobs as foreground.
  PILOT: { position: [0.45, 1.25, -0.6], target: [-0.5, 1.08, 0.18] },
  // From the doorway, high enough that both heads clear the seat backs against the windshield.
  WIDE_INTERIOR: { position: [0.05, 1.84, 1.5], target: [0, 1.14, -0.6] },
  // Exterior shots aim ahead of the plane so it sits on a thirds line flying into open frame;
  // the chase is slightly low (§F0.3).
  EXT_SIDE: ext(9.5, 1.5, 2.0, [0.4, 0.1, -2.6]),
  EXT_CHASE: ext(-2.2, -0.7, 9.5, [1.2, 1.0, -6]),
  EXT_FRONT_LOW: ext(2.4, -0.75, -8.5, [-1.0, 0.9, 0]),
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
