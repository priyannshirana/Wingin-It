import { useFreeLook } from "./useFreeLook";

// Free look and interact mode (§F10.3), mounted inside the cockpit <Canvas>. The pose itself is
// applied by the CameraRigDriver (applyFreeLook) so shake and roll compose on top of it.
export function FreeLook({ enabled }: { enabled: boolean }) {
  useFreeLook(enabled);
  return null;
}
