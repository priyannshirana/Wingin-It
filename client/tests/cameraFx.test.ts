// The additive camera fx (§A12 fx:shake / fx:yaw / fx:pitch_dip) and the lamp flicker (§F15).
import gsap from "gsap";
import { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCameraFx,
  cameraFx,
  fxPitchDip,
  fxShake,
  fxYaw,
  PITCH_DIP_DEG,
  resetCameraFx,
  YAW_DEG,
} from "../src/cinematics/cameraFx";
import { rig } from "../src/cinematics/cameraRig";
import { flickerLamp, isFlickering, stopFlickers } from "../src/scene/lampFlicker";
import { registerLamp } from "../src/scene/sceneRefs";

/** Jump every live tween on `target` to time `t` seconds. */
function seek(target: object, t: number): void {
  for (const tw of gsap.getTweensOf(target)) {
    const tl = tw.parent && tw.parent !== gsap.globalTimeline ? tw.parent : tw;
    tl.time(t);
  }
}

afterEach(() => {
  resetCameraFx();
  stopFlickers();
  rig.shake = 0;
});

describe("cameraFx", () => {
  it("yaw rolls 4° toward the side, then back to 0", () => {
    fxYaw("left");
    seek(cameraFx, 0.4);
    expect(cameraFx.roll).toBeCloseTo(YAW_DEG, 5);
    seek(cameraFx, 1.9);
    expect(cameraFx.roll).toBeCloseTo(0, 5);
    fxYaw("right");
    seek(cameraFx, 0.4);
    expect(cameraFx.roll).toBeCloseTo(-YAW_DEG, 5);
  });

  it("pitch_dip goes to −3° and eases back over 2 s", () => {
    fxPitchDip();
    seek(cameraFx, 0.3);
    expect(cameraFx.pitch).toBeCloseTo(PITCH_DIP_DEG, 5);
    seek(cameraFx, 2.3);
    expect(cameraFx.pitch).toBeCloseTo(0, 5);
  });

  it("shake jumps to the amount (capped at 1) and decays to 0", () => {
    fxShake(1.6, 0.5);
    expect(cameraFx.shake).toBe(1);
    seek(cameraFx, 0.5);
    expect(cameraFx.shake).toBeCloseTo(0, 5);
  });

  it("adds roll and pitch to the pose the rig already set", () => {
    const cam = new PerspectiveCamera();
    cameraFx.roll = 4;
    cameraFx.pitch = -3;
    applyCameraFx(cam, 0);
    expect(cam.rotation.z).not.toBe(0);
    expect(cam.rotation.x).toBeLessThan(0);
  });

  it("never stacks shake above 1.0 with the rig's own shake", () => {
    const cam = new PerspectiveCamera();
    cameraFx.shake = 1;
    rig.shake = 1;
    applyCameraFx(cam, 1.234);
    expect(cam.position.toArray()).toEqual([0, 0, 0]);
    rig.shake = 0;
    applyCameraFx(cam, 1.234);
    expect(cam.position.length()).toBeGreaterThan(0);
  });

  it("is a no-op at rest", () => {
    const cam = new PerspectiveCamera();
    applyCameraFx(cam, 3);
    expect(cam.position.toArray()).toEqual([0, 0, 0]);
    expect(cam.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });
});

describe("lampFlicker", () => {
  it("overrides the lamp's emissive while flickering and hands it back on stop", () => {
    const seen: (number | null)[] = [];
    const off = registerLamp("PD_FIRE_LAMP_R", { setOverride: (i) => seen.push(i) });
    flickerLamp("PD_FIRE_LAMP_R");
    expect(isFlickering("PD_FIRE_LAMP_R")).toBe(true);
    stopFlickers();
    expect(isFlickering("PD_FIRE_LAMP_R")).toBe(false);
    expect(seen.at(-1)).toBeNull();
    off();
  });

  it("releases the lamp by itself after 0.6 s", () => {
    const seen: (number | null)[] = [];
    const off = registerLamp("PD_FIRE_LAMP_L", { setOverride: (i) => seen.push(i) });
    flickerLamp("PD_FIRE_LAMP_L");
    for (const tl of gsap.globalTimeline.getChildren(false, false, true)) tl.progress(1);
    expect(seen.some((i) => i !== null && i > 0)).toBe(true);
    expect(seen.at(-1)).toBeNull();
    expect(isFlickering("PD_FIRE_LAMP_L")).toBe(false);
    off();
  });

  it("ignores unknown lamps", () => {
    flickerLamp("NOPE");
    expect(isFlickering("NOPE")).toBe(false);
  });
});
