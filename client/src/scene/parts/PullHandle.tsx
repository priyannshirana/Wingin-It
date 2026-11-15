import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import type { ObjectState } from "../../net/protocol";
import { useStore } from "../../state/store";
import {
  BEZEL,
  colorOf,
  DEG,
  HOVER_LIFT,
  OUTLINE,
  OUTLINE_W,
  ROUGHNESS,
  type PartProps,
} from "./kit";
import { Label } from "./Label";
import { predictState, useInteractive, usePose, type PoseMotion } from "./useInteractive";

// `in` = z 0; `out` = z +0.06 (§F9.4)
const pose = (s: ObjectState | undefined) => (s?.kind === "handle" && s.value === "out" ? 0.06 : 0);
const MOTION: PoseMotion = { duration: 0.25, ease: "power2.out" };

// PullHandle (§F9.4): a stem with a T-bar that slides toward the Flyer and stays out.
export function PullHandle({ control }: PartProps) {
  const color = colorOf(control);
  const scale = control.size === "big" ? 1.5 : 1;
  const handle = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const { anim, predict } = usePose(control.id, pose, MOTION);
  const { hovered, handlers } = useInteractive(control, (verb) =>
    predict(predictState(useStore.getState().flyer.objects[control.id], verb)),
  );

  useFrame(() => {
    if (handle.current) handle.current.position.z = anim.v;
    if (mat.current) mat.current.emissiveIntensity = hovered ? HOVER_LIFT : 0;
  });

  return (
    <group {...handlers}>
      <group scale={scale}>
        <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.003]}>
          <cylinderGeometry args={[0.02, 0.02, 0.006, 24]} />
          <meshStandardMaterial color={BEZEL} roughness={ROUGHNESS} />
        </mesh>
        <group ref={handle}>
          <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.025]}>
            <cylinderGeometry args={[0.008, 0.008, 0.05, 12]} />
            <meshStandardMaterial color="#8B8D98" roughness={ROUGHNESS} />
          </mesh>
          <mesh rotation={[0, 0, 90 * DEG]} position={[0, 0, 0.052]}>
            <capsuleGeometry args={[0.012, 0.07, 6, 16]} />
            <meshStandardMaterial ref={mat} color={color} emissive={color} roughness={ROUGHNESS} />
            <Outlines thickness={OUTLINE_W} color={OUTLINE} />
          </mesh>
        </group>
      </group>
      <Label text={control.label} position={[0, -0.045 * scale, 0.002]} />
    </group>
  );
}
