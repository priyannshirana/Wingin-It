import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { MathUtils, Vector3 } from "three";
import { rig } from "../cinematics/cameraRig";
import { applyFreeLook } from "./freeLookHead";
import { DEG } from "./parts/kit";

const look = new Vector3();

/** Smooth pseudo-noise in [-1, 1] (layered sines; allocation-free). */
function noise(t: number, seed: number): number {
  return (
    (Math.sin(t * 1.3 + seed) +
      Math.sin(t * 2.7 + seed * 1.7) * 0.6 +
      Math.sin(t * 4.1 + seed * 2.3) * 0.3) /
    1.9
  );
}

// Applies the camera rig every frame (§F10.1): position + noise shake, look-at with the pitch
// offset, then roll. Shake decays toward the resting shake when no tween is driving it.
export function CameraRigDriver() {
  useFrame(({ camera, clock }, dt) => {
    const t = clock.elapsedTime * 9;
    const k = 0.03 * rig.shake;
    camera.position.set(
      rig.position.x + noise(t, 1) * k,
      rig.position.y + noise(t, 2) * k,
      rig.position.z + noise(t, 3) * k,
    );
    const dist = camera.position.distanceTo(rig.target);
    look.copy(rig.target);
    look.y += Math.tan(rig.pitchOffset * DEG) * dist;
    applyFreeLook(camera.position, look, dt); // §F10.3: blends toward the head pose (no-op when off)
    camera.lookAt(look);
    camera.rotateZ(rig.roll * DEG);
    if (!gsap.isTweening(rig)) rig.shake = MathUtils.damp(rig.shake, rig.restShake, 3, dt);
  });
  return null;
}
