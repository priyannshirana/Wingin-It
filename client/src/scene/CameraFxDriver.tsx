import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { applyCameraFx, resetCameraFx } from "../cinematics/cameraFx";

// Applies the server's one-shot camera fx (cinematics/cameraFx.ts) on top of the rig's pose.
// CameraRigDriver rewrites the whole pose every frame, so this only adds; it must be mounted right
// after CameraRigDriver (same priority runs in subscription order).
export function CameraFxDriver() {
  useEffect(() => resetCameraFx, []);
  useFrame(({ camera, clock }) => applyCameraFx(camera, clock.elapsedTime));
  return null;
}
