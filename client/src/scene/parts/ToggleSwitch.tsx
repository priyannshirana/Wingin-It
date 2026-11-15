import { Outlines, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import type { ObjectState } from "../../net/protocol";
import { useStore } from "../../state/store";
import {
  colorOf,
  DEG,
  HOVER_LIFT,
  LAMP_OFF,
  OUTLINE,
  OUTLINE_W,
  ROUGHNESS,
  type PartProps,
} from "./kit";
import { Label } from "./Label";
import { predictState, useInteractive, usePose, type PoseMotion } from "./useInteractive";

const isOn = (s: ObjectState | undefined) => s?.kind === "toggle" && s.value === "on";
// `on` = bat +25° (up), `off` = −25° (§F9.4)
const pose = (s: ObjectState | undefined) => (isOn(s) ? 25 : -25) * DEG;
const MOTION: PoseMotion = { duration: 0.12, ease: "back.out(2)" };
const GREEN = "#30A46C";

// ToggleSwitch (§F9.4): plate + bat with a status lamp; `mushroom` (round lit cap) and
// `guarded` (big, red hinged cover) styles.
export function ToggleSwitch({ control }: PartProps) {
  const color = colorOf(control);
  const mushroom = control.style === "mushroom";
  const guarded = control.style === "guarded";
  const scale = guarded ? 1.4 : 1;
  const on = useStore((s) => isOn(s.flyer.objects[control.id]));
  const bat = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const { anim, predict } = usePose(control.id, pose, MOTION);
  const { hovered, handlers } = useInteractive(control, (verb) =>
    predict(predictState(useStore.getState().flyer.objects[control.id], verb)),
  );

  useFrame(() => {
    if (bat.current) {
      // Mushroom caps pop out 4 mm when on; bats rotate about local X.
      if (mushroom) bat.current.position.z = (anim.v / (25 * DEG)) * 0.004;
      else bat.current.rotation.x = -anim.v;
    }
    if (mat.current) {
      const lit = mushroom && anim.v > 0 ? 2.0 : 0;
      mat.current.emissiveIntensity = Math.max(lit, hovered ? HOVER_LIFT : 0);
    }
  });

  if (mushroom) {
    // Mushroom pump: the cap pops out (+Z) when on and glows.
    return (
      <group {...handlers}>
        <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.006]}>
          <cylinderGeometry args={[0.032, 0.032, 0.012, 32]} />
          <meshStandardMaterial color="#3D4352" roughness={ROUGHNESS} />
        </mesh>
        <group ref={bat}>
          <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.02]}>
            <cylinderGeometry args={[0.008, 0.008, 0.02, 16]} />
            <meshStandardMaterial color="#8B8D98" roughness={ROUGHNESS} />
          </mesh>
          <mesh position={[0, 0, 0.032]} scale={[1, 1, 0.7]}>
            <sphereGeometry args={[0.025, 24, 16]} />
            <meshStandardMaterial
              ref={mat}
              color={color}
              emissive={color}
              roughness={ROUGHNESS}
              toneMapped={false}
            />
            <Outlines thickness={OUTLINE_W} color={OUTLINE} />
          </mesh>
        </group>
        <Label text={control.label} position={[0, -0.045, 0.002]} />
      </group>
    );
  }

  return (
    <group {...handlers} scale={scale}>
      <RoundedBox args={[0.05, 0.07, 0.008]} radius={0.003} position={[0, 0, 0.004]}>
        <meshStandardMaterial
          color={control.color === "grey" ? "#D9D9E0" : color}
          roughness={ROUGHNESS}
        />
      </RoundedBox>
      <mesh position={[0, 0.045, 0.01]}>
        <sphereGeometry args={[0.007, 12, 8]} />
        <meshStandardMaterial
          color={on ? GREEN : LAMP_OFF}
          emissive={GREEN}
          emissiveIntensity={on ? 2.5 : 0}
          toneMapped={!on}
        />
      </mesh>
      <group ref={bat} position={[0, 0, 0.008]}>
        <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.0225]}>
          <cylinderGeometry args={[0.006, 0.006, 0.045, 12]} />
          <meshStandardMaterial
            ref={mat}
            color="#8B8D98"
            emissive="#ffffff"
            roughness={ROUGHNESS}
          />
          <Outlines thickness={OUTLINE_W} color={OUTLINE} />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <sphereGeometry args={[0.009, 16, 12]} />
          <meshStandardMaterial color="#8B8D98" roughness={ROUGHNESS} />
        </mesh>
      </group>
      {guarded && (
        // Red translucent hinged cover, propped open 70° on its top hinge.
        <group position={[0, 0.04, 0.008]} rotation={[-70 * DEG, 0, 0]}>
          <RoundedBox args={[0.06, 0.08, 0.05]} radius={0.006} position={[0, -0.04, 0.025]}>
            <meshStandardMaterial color="#E5484D" transparent opacity={0.5} roughness={0.3} />
          </RoundedBox>
        </group>
      )}
      <Label text={control.label} position={[0, -0.05, 0.002]} />
    </group>
  );
}
