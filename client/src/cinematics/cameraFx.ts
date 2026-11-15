// Server one-shot camera effects (§A12 `fx:shake` / `fx:yaw` / `fx:pitch_dip`, §F15). They live in
// their own mutable offset, applied on top of whatever pose the rig (or a timeline) set this frame,
// so they never fight the rig's own tweens, the free look or a running cinematic.
import gsap from "gsap";
import type { Camera } from "three";
import type { Side } from "../net/protocol";
import { rig } from "./cameraRig";

const DEG = Math.PI / 180;

/** The additive offset (degrees / shake amount). Only this module's tweens write it. */
export const cameraFx = { roll: 0, pitch: 0, shake: 0 };

/** §A12 `fx:yaw`: roll 4° toward the side. Positive roll (rotateZ) banks the view left. */
export const YAW_DEG = 4;
export const YAW_IN_S = 0.4;
export const YAW_BACK_S = 1.5;
/** §A12 `fx:pitch_dip`: −3°, easing back over 2 s. */
export const PITCH_DIP_DEG = -3;
// SPEC-ASSUMPTION: the dip itself takes 0.3 s (`power2.out`) — §A12 gives only the 2 s return;
// a quick drop then a slow recovery reads as the nose dipping.
export const PITCH_IN_S = 0.3;
export const PITCH_BACK_S = 2;
/** §F0.4: 0.03 m × amount. */
const SHAKE_M = 0.03;

let rollTl: gsap.core.Timeline | null = null;
let pitchTl: gsap.core.Timeline | null = null;
let shakeTween: gsap.core.Tween | null = null;

/** `shakeFor(amount, seconds)` on the fx offset: jumps to `amount`, decays to 0. */
export function fxShake(amount: number, seconds: number): void {
  if (!(amount > 0) || !(seconds > 0)) return;
  shakeTween?.kill();
  cameraFx.shake = Math.min(1, Math.max(cameraFx.shake, amount));
  shakeTween = gsap.to(cameraFx, { shake: 0, duration: seconds, ease: "power2.out" });
}

/** §F15: `rollTo(±4, 0.4)` toward the side, then back to 0 over 1.5 s. */
export function fxYaw(side: Side): void {
  rollTl?.kill();
  const deg = side === "left" ? YAW_DEG : -YAW_DEG;
  rollTl = gsap
    .timeline()
    .to(cameraFx, { roll: deg, duration: YAW_IN_S, ease: "power2.inOut" })
    .to(cameraFx, { roll: 0, duration: YAW_BACK_S, ease: "power2.inOut" });
}

export function fxPitchDip(): void {
  pitchTl?.kill();
  pitchTl = gsap
    .timeline()
    .to(cameraFx, { pitch: PITCH_DIP_DEG, duration: PITCH_IN_S, ease: "power2.out" })
    .to(cameraFx, { pitch: 0, duration: PITCH_BACK_S, ease: "power2.inOut" });
}

/** Kill every camera fx and zero the offset (unmount, leaving the room). */
export function resetCameraFx(): void {
  rollTl?.kill();
  pitchTl?.kill();
  shakeTween?.kill();
  rollTl = pitchTl = null;
  shakeTween = null;
  cameraFx.roll = 0;
  cameraFx.pitch = 0;
  cameraFx.shake = 0;
}

/** Smooth pseudo-noise in [-1, 1] (layered sines; a different phase than the rig's own shake). */
function noise(t: number, seed: number): number {
  return (
    (Math.sin(t * 1.7 + seed) +
      Math.sin(t * 3.1 + seed * 1.9) * 0.6 +
      Math.sin(t * 5.3 + seed * 2.9) * 0.3) /
    1.9
  );
}

/**
 * Apply the offset to a camera whose pose was already set this frame. Allocation-free. The
 * combined shake never goes above 1.0 (§F0.4).
 */
export function applyCameraFx(camera: Camera, timeS: number): void {
  const { roll, pitch, shake } = cameraFx;
  if (shake > 0) {
    const k = SHAKE_M * Math.min(shake, Math.max(0, 1 - rig.shake));
    if (k > 0) {
      const t = timeS * 9;
      camera.position.x += noise(t, 11) * k;
      camera.position.y += noise(t, 12) * k;
      camera.position.z += noise(t, 13) * k;
    }
  }
  if (pitch !== 0) camera.rotateX(pitch * DEG);
  if (roll !== 0) camera.rotateZ(roll * DEG);
}
