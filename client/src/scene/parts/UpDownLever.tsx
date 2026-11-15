import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import type { ObjectState } from "../../net/protocol";
import { useStore } from "../../state/store";
import { DEG, HOVER_LIFT, type PartProps } from "./kit";
import { LeverBody } from "./LeverBody";
import { predictState, useInteractive, usePose, type PoseMotion } from "./useInteractive";

// `up` = +12.5°, `down` = −12.5° about local X (§F9.4)
const pose = (s: ObjectState | undefined) =>
  (s?.kind === "lever" && s.value === "down" ? -12.5 : 12.5) * DEG;
const MOTION: PoseMotion = { duration: 0.3, ease: "power3.inOut" };

// UpDownLever (§F9.4): a shaft in a slot with a ball knob.
export function UpDownLever({ control }: PartProps) {
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

  return <LeverBody control={control} handlers={handlers} shaft={shaft} mat={mat} ticks={false} />;
}
