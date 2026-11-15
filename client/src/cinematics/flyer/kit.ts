// Flyer timeline helpers (§F14.2, §F0.4): tweens on the scene drivers and the camera rig that
// skip quietly when the scene isn't mounted (unit tests, the Tower), plus the derived-state beats
// the Tower timelines use. Flyer only: it imports three.js through cameraRig.
import { fireLevel } from "../../scene/env/drivers";
import { getRef } from "../../scene/sceneRefs";
import type { LightRig, Side } from "../../net/protocol";
import { EXTERIOR_PLANE, rig } from "../cameraRig";
import { beats } from "../tower/beats";

export { beats };
export type Timeline = gsap.core.Timeline;
export type V3 = readonly [number, number, number];

const P = EXTERIOR_PLANE;

/** A point relative to the exterior plane's resting position. */
export const ext = (dx: number, dy: number, dz: number): V3 => [P.x + dx, P.y + dy, P.z + dz];

/** Tween numeric props of `target` (skipped when it is undefined). Seek-safe: no onComplete. */
export function tw(
  tl: Timeline,
  target: object | undefined,
  vars: gsap.TweenVars,
  pos: number,
  dur: number,
  ease = "power2.inOut",
): void {
  if (!target) return;
  tl.to(target, { ...vars, duration: dur, ease, immediateRender: false }, pos);
}

/** Set props at a position (a zero-length tween: re-applied by every seek). */
export function put(tl: Timeline, target: object | undefined, vars: gsap.TweenVars, pos: number) {
  if (!target) return;
  tl.to(target, { ...vars, duration: 0, immediateRender: false }, pos);
}

/** Move the camera and its aim point freely (not through the shot table). */
export function cam(
  tl: Timeline,
  pos: number,
  dur: number,
  to: { at?: V3; look?: V3 },
  ease = "power2.inOut",
): void {
  if (to.at) tw(tl, rig.position, { x: to.at[0], y: to.at[1], z: to.at[2] }, pos, dur, ease);
  if (to.look) tw(tl, rig.target, { x: to.look[0], y: to.look[1], z: to.look[2] }, pos, dur, ease);
}

/** Camera roll, pitch offset, rest shake (degrees / amount) as timeline tweens. */
export function roll(tl: Timeline, deg: number, pos: number, dur: number, ease = "power2.inOut") {
  tw(tl, rig, { roll: deg }, pos, dur, ease);
}
export function pitch(tl: Timeline, deg: number, pos: number, dur: number, ease = "power2.inOut") {
  tw(tl, rig, { pitchOffset: deg }, pos, dur, ease);
}

/**
 * A camera shake at `pos`: jumps to `amount`, decays to the rest shake. Two zero-length sets and a
 * tween, so seeking through it ends at the rest value (`rig.restShake` is read at build time).
 */
export function shake(tl: Timeline, amount: number, seconds: number, pos: number, rest = 0): void {
  put(tl, rig, { shake: Math.min(1, amount) }, pos);
  tw(tl, rig, { shake: rest }, pos, seconds, "power2.out");
}

/** The lightning double flash (§F14.2): 6 for 70 ms, off 60 ms, 4 for 50 ms, off. Ends at 0. */
export function lightning(tl: Timeline, pos: number): void {
  const l = getRef("lightRig")?.lightning;
  put(tl, l, { intensity: 6 }, pos);
  put(tl, l, { intensity: 0 }, pos + 0.07);
  put(tl, l, { intensity: 4 }, pos + 0.13);
  put(tl, l, { intensity: 0 }, pos + 0.18);
}

/** Cross-fade the light rig (idempotent: the last call in seek order wins). */
export function rigAt(tl: Timeline, name: LightRig, seconds: number, pos: number): void {
  tl.call(() => getRef("lightRig")?.setRig(name, seconds), [], pos);
}

/** Show or hide the exterior plane's root group. */
export function planeVisible(tl: Timeline, on: boolean, pos: number): void {
  tl.call(
    () => {
      const g = getRef("exteriorPlane");
      if (g) g.visible = on;
    },
    [],
    pos,
  );
}

/** The exterior plane back at its resting pose, visible. */
export function resetPlane(tl: Timeline, pos: number): void {
  const plane = getRef("exteriorPlane");
  put(tl, plane?.position, { x: P.x, y: P.y, z: P.z }, pos);
  put(tl, plane?.rotation, { x: 0, y: 0, z: 0 }, pos);
  planeVisible(tl, true, pos);
}

/** The fire drivers on one side. */
export const fireOf = (side: Side) =>
  getRef(side === "left" ? "wingFireLeft" : "wingFireRight")?.fire;

/** Mirror an exterior offset to the left side (x → −x). */
export const mirror = (v: V3, left: boolean): V3 => (left ? [-v[0], v[1], v[2]] : v);

type Runway = "hidden" | "far" | "rolling" | "stopped";
const RUNWAY: Record<
  Runway,
  { speed: number; lights: number; y: number; z: number; shown: number }
> = {
  hidden: { speed: 0, lights: 0, y: -40, z: -600, shown: 0 },
  far: { speed: 0, lights: 1, y: -40, z: -600, shown: 1 },
  rolling: { speed: 60, lights: 1, y: -1.2, z: 300, shown: 1 },
  stopped: { speed: 0, lights: 0.45, y: -1.2, z: 300, shown: 1 },
};

/** What a phase-start `World` maps to on the scene drivers (§A11, sceneRefs.ts). */
export interface Look {
  rig: LightRig;
  storm: number;
  moon: number;
  density: number;
  cloudStorm: number;
  rain: number;
  droplets: number;
  fog: number;
  runway: Runway;
  fire: { side: Side; level: Parameters<typeof fireLevel>[0] } | null;
  stopped: Side | null;
  seatZ: number;
  rest: number;
}

export const LOOK_P1: Look = {
  rig: "night_alarm",
  storm: 0,
  moon: 1,
  density: 1,
  cloudStorm: 0,
  rain: 0,
  droplets: 0,
  fog: 0.004,
  runway: "hidden",
  fire: null,
  stopped: null,
  seatZ: 0.3,
  rest: 0,
};
export const lookP2 = (side: Side): Look => ({
  ...LOOK_P1,
  rig: "fire",
  fog: 0.006,
  fire: { side, level: "full" },
  seatZ: 0.7,
});
export const lookP3 = (side: Side): Look => ({
  ...LOOK_P1,
  rig: "storm",
  storm: 1,
  moon: 0,
  density: 2,
  cloudStorm: 1,
  rain: 1,
  droplets: 40,
  fog: 0.035,
  fire: { side, level: "wisp" },
  stopped: side,
  seatZ: 0.7,
  rest: 0.15,
});

/** Put every driver at a phase-start world (a retry intro starts from the crash scene). */
export function putLook(tl: Timeline, w: Look, pos: number): void {
  const night = w.storm === 0 ? 1 : 0;
  put(tl, getRef("sky"), { storm: w.storm, dawn: 0, moon: w.moon, stars: night, sun: 0 }, pos);
  put(tl, getRef("clouds"), { density: w.density, storm: w.cloudStorm, dawn: 0, speed: 1 }, pos);
  put(tl, getRef("weather"), { rain: w.rain, droplets: w.droplets, fog: w.fog }, pos);
  const r = RUNWAY[w.runway];
  const run = getRef("runway");
  put(tl, run?.stream, { speed: r.speed, lights: r.lights }, pos);
  put(tl, run?.place, { y: r.y, z: r.z, shown: r.shown }, pos);
  put(
    tl,
    getRef("propellers"),
    { left: w.stopped === "left" ? 0 : 1, right: w.stopped === "right" ? 0 : 1 },
    pos,
  );
  for (const side of ["left", "right"] as const) {
    put(tl, fireOf(side), fireLevel(w.fire?.side === side ? w.fire.level : "none"), pos);
  }
  put(
    tl,
    getRef("pilot")?.pose,
    { slump: 1, awake: 0, zzz: 1, zzzScale: 1, stretch: 0, look: 0, question: 0 },
    pos,
  );
  put(tl, getRef("pilotSeat")?.position, { z: w.seatZ }, pos);
  put(tl, getRef("flyerAvatar")?.pose, { panic: 0, brace: 0, cheer: 0, turn: 0 }, pos);
  put(tl, rig, { roll: 0, pitchOffset: 0, restShake: w.rest, shake: w.rest }, pos);
  resetPlane(tl, pos);
  rigAt(tl, w.rig, 0.05, pos);
}
