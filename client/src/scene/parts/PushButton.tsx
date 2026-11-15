import { Outlines, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import {
  BEZEL,
  colorOf,
  DEG,
  HOVER_LIFT,
  LABEL_DARK,
  OUTLINE,
  OUTLINE_W,
  ROUGHNESS,
  type PartProps,
} from "./kit";
import { Label } from "./Label";
import { useInteractive } from "./useInteractive";

// PushButton (§F9.4): bezel + cap; the cap always sinks 0.012 in 80 ms and returns in 120 ms
// locally on press (no server confirmation needed, §F9.6).
export function PushButton({ control }: PartProps) {
  const big = control.size === "big";
  const color = colorOf(control);
  const cap = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const anim = useMemo(() => ({ v: 0 }), []);
  useEffect(() => () => void gsap.killTweensOf(anim), [anim]);

  const { hovered, handlers } = useInteractive(control, () => {
    gsap
      .timeline()
      .to(anim, { v: -0.012, duration: 0.08, ease: "power2.out", overwrite: true })
      .to(anim, { v: 0, duration: 0.12, ease: "power2.out" });
  });

  useFrame(() => {
    if (cap.current) cap.current.position.z = anim.v;
    if (mat.current) mat.current.emissiveIntensity = hovered ? HOVER_LIFT : 0;
  });

  const capDepth = big ? 0.03 : 0.025;
  return (
    <group {...handlers}>
      {big ? (
        <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.006]}>
          <cylinderGeometry args={[0.055, 0.055, 0.012, 32]} />
          <meshStandardMaterial color={BEZEL} roughness={ROUGHNESS} />
        </mesh>
      ) : (
        <RoundedBox args={[0.075, 0.075, 0.012]} radius={0.004} position={[0, 0, 0.006]}>
          <meshStandardMaterial color={BEZEL} roughness={ROUGHNESS} />
        </RoundedBox>
      )}
      <group ref={cap} position={[0, 0, 0]}>
        {big ? (
          <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.012 + capDepth / 2]}>
            <cylinderGeometry args={[0.045, 0.045, capDepth, 32]} />
            <meshStandardMaterial ref={mat} color={color} emissive={color} roughness={ROUGHNESS} />
            <Outlines thickness={OUTLINE_W} color={OUTLINE} />
          </mesh>
        ) : (
          <RoundedBox
            args={[0.06, 0.06, capDepth]}
            radius={0.008}
            position={[0, 0, 0.012 + capDepth / 2]}
          >
            <meshStandardMaterial ref={mat} color={color} emissive={color} roughness={ROUGHNESS} />
            <Outlines thickness={OUTLINE_W} color={OUTLINE} />
          </RoundedBox>
        )}
        <Label
          text={control.label}
          color={LABEL_DARK}
          position={[0, 0, 0.012 + capDepth + 0.001]}
        />
      </group>
    </group>
  );
}
