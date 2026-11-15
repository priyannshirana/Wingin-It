import { Outlines, RoundedBox } from "@react-three/drei";
import type { RefObject } from "react";
import type { Group, MeshStandardMaterial } from "three";
import { DEG, OUTLINE, OUTLINE_W, ROUGHNESS, SLOT, type PartProps } from "./kit";
import { Label } from "./Label";

interface BodyProps extends PartProps {
  handlers: object;
  shaft: RefObject<Group | null>;
  mat: RefObject<MeshStandardMaterial | null>;
  ticks: boolean;
}

/** Shared lever geometry (slot, shaft, knob, optional notch ticks, label). */
export function LeverBody({ control, handlers, shaft, mat, ticks }: BodyProps) {
  return (
    <group {...handlers}>
      <RoundedBox args={[0.03, 0.09, 0.01]} radius={0.004} position={[0, 0, 0.005]}>
        <meshStandardMaterial color={SLOT} roughness={ROUGHNESS} />
      </RoundedBox>
      {ticks &&
        [0.03, 0, -0.03].map((y) => (
          <mesh key={y} position={[0.026, y, 0.004]}>
            <boxGeometry args={[0.012, 0.002, 0.002]} />
            <meshStandardMaterial color="#D9D9E0" roughness={ROUGHNESS} />
          </mesh>
        ))}
      <group ref={shaft} position={[0, 0, 0.008]}>
        <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.035]}>
          <cylinderGeometry args={[0.006, 0.006, 0.07, 12]} />
          <meshStandardMaterial color="#8B8D98" roughness={ROUGHNESS} />
        </mesh>
        <mesh position={[0, 0, 0.072]}>
          <sphereGeometry args={[0.016, 20, 14]} />
          <meshStandardMaterial
            ref={mat}
            color="#D9D9E0"
            emissive="#ffffff"
            roughness={ROUGHNESS}
          />
          <Outlines thickness={OUTLINE_W} color={OUTLINE} />
        </mesh>
      </group>
      <Label text={control.label} position={[-0.032, 0, 0.002]} />
    </group>
  );
}
