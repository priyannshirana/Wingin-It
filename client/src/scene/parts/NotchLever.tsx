import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import type { ObjectState } from "../../net/protocol";
import { useStore } from "../../state/store";
import { DEG, HOVER_LIFT, type PartProps } from "./kit";
import { LeverBody } from "./LeverBody";
import { predictState, useInteractive, usePose, type PoseMotion } from "./useInteractive";

const NOTCH_DEG = [15, 0, -15] as const;
// notch 0 = +15°, 1 = 0°, 2 = −15° (§F9.4)
const pose = (s: ObjectState | undefined) => (s?.kind === "notch" ? NOTCH_DEG[s.value] : 15) * DEG;
const MOTION: PoseMotion = { duration: 0.15, ease: "power2.out" };

// NotchLever (§F9.4): click = move_down one notch, shift-click = move_up.
export function NotchLever({ control }: PartProps) {
  const shaft = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const { anim, predict } = usePose(control.id, pose, MOTION);
  const { hovered, handlers } = useInteractive(control, (verb) =>
    predict(predictState(useStore.getState().flyer.objects[control.id], verb)),
  );

  useFrame(() => {
    if (shaft.current) shaft.current.rotation.x = -anim.v;
    if (mat.current) mat.current.emissiveIntensity = hovered ? HOVER_LIFT : 0;
  });

  return <LeverBody control={control} handlers={handlers} shaft={shaft} mat={mat} ticks />;
}
