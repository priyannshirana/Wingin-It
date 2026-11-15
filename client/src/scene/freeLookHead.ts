// Free look and interact mode (§F10.3): the head state, its limits, lean and collision clamp, the
// settle-on-freeze target, the mode reducer, and `applyFreeLook`, which the CameraRigDriver calls
// every frame to blend the rig's base pose toward the head pose (shake and roll still compose on
// top). Module-level state, no React; `useFreeLook` wires the DOM (pointer lock, mouse, clicks).
import { events as createPointerEvents } from "@react-three/fiber";
import { MathUtils, Vector3 } from "three";
import { rig, SHOTS, STATION_SHOT } from "../cinematics/cameraRig";
import { STATION_FACES } from "../content/stations";
import type { StationId } from "../net/protocol";
import type { LookMode } from "../state/store";
import { assertNever } from "../util/assertNever";
import { FLYER_EYE } from "./characters/firstPerson";
import { DEG } from "./parts/kit";

// ---------------------------------------------------------------------------
// Limits and feel (§F10.3)
// ---------------------------------------------------------------------------

export const LOOK = {
  yawMax: 110, // degrees, + = left
  pitchMin: -55,
  pitchMax: 60,
  leanForward: 0.25, // m, toward the front panel / pedestal
  leanSide: 0.2, // m, toward a side window when |yaw| > 60°
  sideYawStart: 60,
  clearance: 0.06, // m from cockpit geometry
  smoothing: 0.06, // s, the look's damping time
  settleS: 0.3,
  // SPEC-ASSUMPTION: 0.4 s on activation too — §F10.3 gives 0.4 s only for the cinematic hand-back;
  // the first look-mode entry reuses it so the head never pops.
  blendS: 0.4, // rig ↔ head hand-over (cinematic end / start)
  // SPEC-ASSUMPTION: 1.5 m — a rig farther than this from the head is a cinematic cut, so the head
  // snaps instead of flying 0.4 s across the set; the longest in-cockpit head offset is ~0.6 m.
  cutDistance: 1.5, // m: a rig farther than this from the head is a cut, not a move
  settleRadius: 25, // degrees: nearest panel within this cone
  // SPEC-ASSUMPTION: settle blend constants (aim ≥ 40% toward the station shot's aim, eye 90% of the
  // way to the shot's eye, spot kept inside 70% of the panel) — §F10.3 only says "a blend of the
  // current view and the station's shot"; the aim share rises as needed until the whole panel fits.
  settleAim: 0.4, // minimum share of the aim moved from the player's spot toward the shot's aim
  settleFov: 55, // degrees, the cockpit camera's vertical FOV (CockpitCanvas)
  // Narrower canvases widen the vertical FOV to keep this horizontal coverage (cameraFov.ts), so a
  // fit checked at 1.6 / 55° holds at every aspect.
  settleAspect: 1.6,
  settleFit: 0.94, // every panel corner must land inside this share of NDC
  settleInset: 0.7, // the player's spot is kept within this share of the panel's half-size
  settlePos: 0.9, // share of the way toward the station shot's eye (it rises over the yokes)
  settleMaxOffset: 0.6, // m from the seated eye (inside the first-person radius, 0.8 m)
} as const;

export const SENSITIVITY = { default: 0.15, min: 0.05, max: 0.4 } as const;

/** The seated eye (= FLYER_DEFAULT position), the origin of every head offset. */
export const SEAT_EYE: Readonly<Vector3> = new Vector3(FLYER_EYE.x, FLYER_EYE.y, FLYER_EYE.z);

// ---------------------------------------------------------------------------
// Mode reducer
// ---------------------------------------------------------------------------

export type LookEvent =
  | { type: "activate"; locked: boolean }
  | { type: "deactivate" }
  | { type: "locked" }
  | { type: "unlocked" }
  | { type: "freeze" };

/**
 * off = not playing / a cinematic owns the camera; enter = playing, waiting for the first click
 * (pointer lock needs a gesture); look = pointer locked, the mouse turns the head; interact = the
 * view is frozen and the cursor clicks controls.
 */
export function nextLookMode(mode: LookMode, ev: LookEvent): LookMode {
  switch (ev.type) {
    case "activate":
      if (mode !== "off") return mode;
      return ev.locked ? "look" : "enter";
    case "deactivate":
      return "off";
    case "locked":
      return mode === "off" ? "off" : "look";
    case "unlocked":
      return mode === "look" ? "interact" : mode;
    case "freeze":
      return mode === "look" ? "interact" : mode;
    default:
      return assertNever(ev);
  }
}

// ---------------------------------------------------------------------------
// Head state
// ---------------------------------------------------------------------------

interface SettleAnim {
  t: number;
  fromYaw: number;
  fromPitch: number;
  toYaw: number;
  toPitch: number;
  from: Vector3;
  to: Vector3;
}

export const head = {
  mode: "off" as LookMode,
  /** Mouse targets, degrees. */
  yaw: 0,
  pitch: 0,
  /** Smoothed values the camera uses. */
  sYaw: 0,
  sPitch: 0,
  /** Eye offset from SEAT_EYE (lean / settle), smoothed. */
  offset: new Vector3(),
  /** 0 = the rig's pose, 1 = the head's pose. */
  weight: 0,
  settle: null as SettleAnim | null,
  /** The pointerdown that froze the view (look → interact); it must not poke (§F10.3). */
  frozeBy: null as Event | null,
};

/** The first-person hands poke only in interact mode, never on the click that froze the view. */
export function pokeAllowed(e: Event): boolean {
  return head.mode === "interact" && head.frozeBy !== e;
}

const clamp = MathUtils.clamp;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** View direction for yaw/pitch in degrees (yaw + = left, forward = −Z). */
export function dirFor(yawDeg: number, pitchDeg: number, out: Vector3): Vector3 {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
}

/** Yaw/pitch (degrees) of a direction. */
export function anglesOf(d: Vector3): { yaw: number; pitch: number } {
  const len = d.length() || 1;
  return {
    yaw: Math.atan2(-d.x, -d.z) / DEG,
    pitch: Math.asin(clamp(d.y / len, -1, 1)) / DEG,
  };
}

export function clampYaw(yaw: number): number {
  return clamp(yaw, -LOOK.yawMax, LOOK.yawMax);
}
export function clampPitch(pitch: number): number {
  return clamp(pitch, LOOK.pitchMin, LOOK.pitchMax);
}

/** Mouse movement in look mode (px) → head targets. Sensitivity in °/px. */
export function addMouse(dx: number, dy: number, sensitivity: number): void {
  const s = clamp(sensitivity, SENSITIVITY.min, SENSITIVITY.max);
  head.yaw = clampYaw(head.yaw - dx * s);
  head.pitch = clampPitch(head.pitch - dy * s);
}

const tmpDir = new Vector3();
const FWD_H = Math.sqrt(0.75);

/**
 * Lean with the look direction: forward and a little down (≤ 25 cm) when looking toward the
 * front panel or the pedestal, sideways (≤ 20 cm) toward a side window past 60° of yaw.
 */
export function leanFor(yaw: number, pitch: number, out: Vector3): Vector3 {
  const ay = Math.abs(yaw);
  const forward = smoothstep(0, 35, -pitch) * (1 - smoothstep(45, 80, ay));
  dirFor(yaw, 0, tmpDir); // horizontal look direction
  const f = LOOK.leanForward * forward;
  out.set(tmpDir.x * f * FWD_H, -f * 0.5, tmpDir.z * f * FWD_H); // |(FWD_H, 0.5)| = 1
  const side = smoothstep(LOOK.sideYawStart, 100, ay) * LOOK.leanSide;
  out.x += yaw > 0 ? -side : side;
  return out;
}

// Cockpit geometry near the right seat (Cockpit.tsx / §F9.3 stations), as axis-aligned boxes
// [minX, minY, minZ, maxX, maxY, maxZ]. The cabin interior bounds the head from outside.
// SPEC-ASSUMPTION: hard-coded collision boxes [x0, y0, z0, x1, y1, z1] (cabin shell, seat back, yoke,
// pedestal, glare shield, overhead housing) — §F10.3 asks for a ≥ 6 cm clamp without naming the
// geometry; boxes measured from the station/cockpit parts are the simplest allocation-free option.
const CABIN: readonly number[] = [-1.18, 0.06, -0.9, 1.18, 2.26, 1.06];
const OBSTACLES: readonly (readonly number[])[] = [
  [0.24, 0.56, 0.24, 0.76, 1.3, 0.62], // the Flyer's seat back + headrest
  [0.36, 0.85, -0.6, 0.64, 1.1, -0.5], // right yoke wheel
  [-0.3, 0.33, -0.82, 0.3, 0.94, -0.12], // pedestal face + body
  [-1.05, 1.12, -1.0, 1.05, 1.2, -0.85], // glare shield
  [-0.62, 1.76, -0.6, 0.62, 2.3, -0.02], // overhead panel (lower edge y 1.75, z −0.03) + housing
];

/** Keep `p` inside the cabin and ≥ LOOK.clearance away from the obstacle boxes (in place). */
export function clampEye(p: Vector3): Vector3 {
  const c = LOOK.clearance;
  p.x = clamp(p.x, (CABIN[0] ?? 0) + c, (CABIN[3] ?? 0) - c);
  p.y = clamp(p.y, (CABIN[1] ?? 0) + c, (CABIN[4] ?? 0) - c);
  p.z = clamp(p.z, (CABIN[2] ?? 0) + c, (CABIN[5] ?? 0) - c);
  for (const b of OBSTACLES) {
    const [x0 = 0, y0 = 0, z0 = 0, x1 = 0, y1 = 0, z1 = 0] = b;
    if (p.x <= x0 - c || p.x >= x1 + c) continue;
    if (p.y <= y0 - c || p.y >= y1 + c) continue;
    if (p.z <= z0 - c || p.z >= z1 + c) continue;
    // Inside the padded box: push out along the axis of least penetration.
    const pens = [
      p.x - (x0 - c),
      x1 + c - p.x,
      p.y - (y0 - c),
      y1 + c - p.y,
      p.z - (z0 - c),
      z1 + c - p.z,
    ];
    let k = 0;
    for (let i = 1; i < 6; i++) if ((pens[i] ?? 0) < (pens[k] ?? 0)) k = i;
    if (k === 0) p.x = x0 - c;
    else if (k === 1) p.x = x1 + c;
    else if (k === 2) p.y = y0 - c;
    else if (k === 3) p.y = y1 + c;
    else if (k === 4) p.z = z0 - c;
    else p.z = z1 + c;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Settle on freeze
// ---------------------------------------------------------------------------

export interface FaceFrame {
  id: StationId;
  center: Vector3;
  normal: Vector3;
  right: Vector3;
  up: Vector3;
  halfW: number;
  halfH: number;
}

const WORLD_UP = new Vector3(0, 1, 0);
const FACES: readonly FaceFrame[] = (Object.keys(STATION_FACES) as StationId[]).map((id) => {
  const f = STATION_FACES[id];
  const center = new Vector3(...f.center);
  // Same basis as Object3D.lookAt on the station group: +Z toward the target.
  const normal = new Vector3(...f.target).sub(center).normalize();
  const right = new Vector3().crossVectors(WORLD_UP, normal).normalize();
  const up = new Vector3().crossVectors(normal, right).normalize();
  return { id, center, normal, right, up, halfW: f.size[0] / 2, halfH: f.size[1] / 2 };
});

const tmpHit = new Vector3();
const tmpTo = new Vector3();

/** The station whose panel the view ray hits, else the nearest within 25°, else null. */
export function pickSettleStation(eye: Vector3, dir: Vector3): StationId | null {
  let best: StationId | null = null;
  let bestT = Infinity;
  for (const f of FACES) {
    const denom = dir.dot(f.normal);
    if (Math.abs(denom) < 1e-6) continue;
    const t = tmpTo.copy(f.center).sub(eye).dot(f.normal) / denom;
    if (t <= 0 || t >= bestT) continue;
    tmpHit.copy(dir).multiplyScalar(t).add(eye).sub(f.center);
    if (Math.abs(tmpHit.dot(f.right)) <= f.halfW && Math.abs(tmpHit.dot(f.up)) <= f.halfH) {
      best = f.id;
      bestT = t;
    }
  }
  if (best) return best;
  let bestAngle = LOOK.settleRadius * DEG;
  for (const f of FACES) {
    const a = tmpTo.copy(f.center).sub(eye).angleTo(dir);
    if (a < bestAngle) {
      bestAngle = a;
      best = f.id;
    }
  }
  return best;
}

export interface SettleTarget {
  yaw: number;
  pitch: number;
  offset: Vector3;
}

/** Where the view ray meets the station's panel plane, kept inside the panel (centre if parallel). */
export function panelAimPoint(station: StationId, eye: Vector3, dir: Vector3): Vector3 {
  const f = FACES.find((x) => x.id === station);
  if (!f) return new Vector3();
  const out = f.center.clone();
  const denom = dir.dot(f.normal);
  if (Math.abs(denom) < 1e-6) return out;
  const t = tmpTo.copy(f.center).sub(eye).dot(f.normal) / denom;
  if (t <= 0) return out;
  const local = tmpHit.copy(dir).multiplyScalar(t).add(eye).sub(f.center);
  const k = LOOK.settleInset;
  const x = clamp(local.dot(f.right), -f.halfW * k, f.halfW * k);
  const y = clamp(local.dot(f.up), -f.halfH * k, f.halfH * k);
  return out.addScaledVector(f.right, x).addScaledVector(f.up, y);
}

/**
 * A clean framing of the station panel: the eye moves most of the way toward the station shot's
 * eye (the lean that clears the pedestal and shows the bottom row), and the view aims between the
 * spot the player was looking at and the shot's aim point, so the player's intent is kept.
 */
export function settleTargetFor(
  station: StationId,
  eye: Vector3,
  dir: Vector3,
  offset: Vector3,
): SettleTarget {
  const shot = SHOTS[STATION_SHOT[station]];
  const to = new Vector3(...shot.position).sub(SEAT_EYE);
  const off = offset.clone().lerp(to, LOOK.settlePos);
  if (off.length() > LOOK.settleMaxOffset) off.setLength(LOOK.settleMaxOffset);
  const next = clampEye(off.clone().add(SEAT_EYE));
  off.copy(next).sub(SEAT_EYE);
  const spot = panelAimPoint(station, eye, dir);
  const shotAim = new Vector3(...shot.target);
  const face = FACES.find((x) => x.id === station);
  // Keep as much of the player's angle as still frames the whole panel (§F10.3 "clean framing").
  let w: number = LOOK.settleAim;
  for (;;) {
    const a = anglesOf(spot.clone().lerp(shotAim, w).sub(next));
    const yaw = clampYaw(a.yaw);
    const pitch = clampPitch(a.pitch);
    if (w >= 1 || !face || panelExtent(face, next, yaw, pitch) <= LOOK.settleFit) {
      return { yaw, pitch, offset: off };
    }
    w = Math.min(1, w + 0.1);
  }
}

const fitRight = new Vector3();
const fitUp = new Vector3();
const fitFwd = new Vector3();
const fitV = new Vector3();

/** Largest |NDC| of the panel's four corners seen from `eye` looking along yaw/pitch (Infinity if behind). */
export function panelExtent(f: FaceFrame, eye: Vector3, yaw: number, pitch: number): number {
  dirFor(yaw, pitch, fitFwd);
  fitRight.crossVectors(fitFwd, WORLD_UP).normalize();
  fitUp.crossVectors(fitRight, fitFwd);
  const ty = Math.tan((LOOK.settleFov * DEG) / 2);
  const tx = ty * LOOK.settleAspect;
  let max = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      fitV
        .copy(f.center)
        .addScaledVector(f.right, sx * f.halfW)
        .addScaledVector(f.up, sy * f.halfH)
        .sub(eye);
      const z = fitV.dot(fitFwd);
      if (z < 0.05) return Infinity;
      max = Math.max(
        max,
        Math.abs(fitV.dot(fitRight)) / (z * tx),
        Math.abs(fitV.dot(fitUp)) / (z * ty),
      );
    }
  }
  return max;
}

const eyeNow = new Vector3();
const dirNow = new Vector3();

/** Look → interact: start the 0.3 s settle toward the nearest panel (or stay put). */
export function startSettle(): StationId | null {
  eyeNow.copy(SEAT_EYE).add(head.offset);
  dirFor(head.sYaw, head.sPitch, dirNow);
  head.yaw = head.sYaw;
  head.pitch = head.sPitch;
  const station = pickSettleStation(eyeNow, dirNow);
  if (!station) {
    head.settle = null;
    return null;
  }
  const target = settleTargetFor(station, eyeNow, dirNow, head.offset);
  head.settle = {
    t: 0,
    fromYaw: head.sYaw,
    fromPitch: head.sPitch,
    toYaw: target.yaw,
    toPitch: target.pitch,
    from: head.offset.clone(),
    to: target.offset,
  };
  return station;
}

/** Face a station's shot from the seat (start of play, after a cinematic). */
export function faceStation(station: StationId | null): void {
  const shot = SHOTS[station ? STATION_SHOT[station] : "FLYER_DEFAULT"];
  const a = anglesOf(tmpTo.set(...shot.target).sub(SEAT_EYE));
  setHead(a.yaw, a.pitch);
}

/** Snap the head to yaw/pitch (degrees) with the matching lean, no smoothing. */
export function setHead(yaw: number, pitch: number): void {
  head.yaw = head.sYaw = clampYaw(yaw);
  head.pitch = head.sPitch = clampPitch(pitch);
  head.settle = null;
  leanFor(head.sYaw, head.sPitch, head.offset);
}

/** Back to the initial state (tests, unmount). */
export function resetHead(): void {
  head.mode = "off";
  head.weight = 0;
  head.settle = null;
  head.frozeBy = null;
  setHead(0, 0);
}

// ---------------------------------------------------------------------------
// Per-frame update (allocation-free)
// ---------------------------------------------------------------------------

const leanTarget = new Vector3();
const headEye = new Vector3();
const headDir = new Vector3();
const baseDir = new Vector3();
const shakeDelta = new Vector3();

/** Advance the head one frame (smoothing, lean, settle) and the rig ↔ head weight. */
export function stepHead(dt: number): void {
  const target = head.mode === "off" ? 0 : 1;
  const step = dt / LOOK.blendS;
  head.weight = target === 1 ? Math.min(1, head.weight + step) : Math.max(0, head.weight - step);
  if (head.mode === "off") return;
  const s = head.settle;
  if (s) {
    s.t = Math.min(LOOK.settleS, s.t + dt);
    const p = s.t / LOOK.settleS;
    const e = 1 - (1 - p) * (1 - p); // power2.out
    head.sYaw = s.fromYaw + (s.toYaw - s.fromYaw) * e;
    head.sPitch = s.fromPitch + (s.toPitch - s.fromPitch) * e;
    head.offset.lerpVectors(s.from, s.to, e);
    // The mouse continues from wherever the settle has got to.
    head.yaw = head.sYaw;
    head.pitch = head.sPitch;
    if (head.mode !== "interact")
      head.settle = null; // back to look: the mouse takes over
    else return;
  }
  if (head.mode !== "look") return;
  const lambda = 1 / LOOK.smoothing;
  head.sYaw = MathUtils.damp(head.sYaw, head.yaw, lambda, dt);
  head.sPitch = MathUtils.damp(head.sPitch, head.pitch, lambda, dt);
  leanFor(head.sYaw, head.sPitch, leanTarget);
  head.offset.x = MathUtils.damp(head.offset.x, leanTarget.x, lambda * 0.5, dt);
  head.offset.y = MathUtils.damp(head.offset.y, leanTarget.y, lambda * 0.5, dt);
  head.offset.z = MathUtils.damp(head.offset.z, leanTarget.z, lambda * 0.5, dt);
}

/**
 * Called by the CameraRigDriver after it placed the rig's base pose (with shake) and before roll:
 * blends `position` / `lookAt` toward the head pose by `head.weight`. The shake offset the driver
 * added is carried over, so shake (and the roll applied afterwards) compose on top of the look.
 */
export function applyFreeLook(position: Vector3, lookAt: Vector3, dt: number): void {
  stepHead(dt);
  if (head.weight <= 0) return;
  headEye.copy(SEAT_EYE).add(head.offset);
  clampEye(headEye);
  // A cut (e.g. a cinematic opening on an exterior shot) is never blended: flying the camera
  // across the set for 0.4 s would read as a glitch, so the hand-over snaps instead.
  if (rig.position.distanceTo(headEye) > LOOK.cutDistance) {
    head.weight = head.mode === "off" ? 0 : 1;
    if (head.weight <= 0) return;
  }
  const w = head.weight;
  const smooth = w * w * (3 - 2 * w);
  shakeDelta.copy(position).sub(rig.position);
  const dist = Math.max(0.5, position.distanceTo(lookAt));
  baseDir.copy(lookAt).sub(position).normalize();
  headEye.add(shakeDelta);
  dirFor(head.sYaw, head.sPitch, headDir);
  position.lerp(headEye, smooth);
  baseDir.lerp(headDir, smooth).normalize();
  lookAt.copy(position).addScaledVector(baseDir, dist);
}

// ---------------------------------------------------------------------------
// Pointer events: while the pointer is locked, R3F raycasts from the screen centre
// ---------------------------------------------------------------------------

/** Whether this canvas holds the pointer lock (flipped only on `pointerlockchange`). */
export const pointer = { locked: false };

type EventsFactory = typeof createPointerEvents;

/**
 * R3F's default pointer events, except that in look mode (pointer locked) every event hits what
 * is under the screen centre, so the freezing click also clicks the control in the middle of the
 * view (§F10.3) and the hover highlight follows the view.
 */
export const freeLookEvents: EventsFactory = (store) => {
  const base = createPointerEvents(store);
  const compute = base.compute;
  return {
    ...base,
    compute(event, state, previous) {
      compute?.(event, state, previous);
      if (!pointer.locked) return;
      state.pointer.set(0, 0);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
};
