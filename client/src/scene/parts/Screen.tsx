import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, MeshStandardMaterial } from "three";
import { useStore } from "../../state/store";
import { ROUGHNESS, type PartProps } from "./kit";

const TEAL = "#2EC4B6";
const BOOT_MS = 400;

// Screen (§F9.4): a small display; on = emissive teal (1.2) with a little plane icon. Turning on
// flickers 3× over 400 ms, then stays steady.
export function Screen({ control }: PartProps) {
  const on = useStore((s) => {
    const st = s.flyer.objects[control.id];
    return st?.kind === "screen" && st.on;
  });
  const mat = useRef<MeshStandardMaterial>(null);
  const icon = useRef<Group>(null);
  const bootStart = useRef<number | null>(null);
  const wasOn = useRef(on);

  useFrame(() => {
    if (on && !wasOn.current) bootStart.current = performance.now();
    wasOn.current = on;
    let level = on ? 1 : 0;
    if (on && bootStart.current !== null) {
      const t = performance.now() - bootStart.current;
      if (t < BOOT_MS) level = Math.floor(t / (BOOT_MS / 6)) % 2 === 0 ? 1 : 0.15;
      else bootStart.current = null;
    }
    if (mat.current) mat.current.emissiveIntensity = 1.2 * level;
    if (icon.current) icon.current.visible = level > 0.5;
  });

  return (
    <group>
      <RoundedBox args={[0.12, 0.08, 0.01]} radius={0.004} position={[0, 0, 0.005]}>
        <meshStandardMaterial
          ref={mat}
          color="#10141c"
          emissive={TEAL}
          emissiveIntensity={0}
          roughness={ROUGHNESS}
          toneMapped={false}
        />
      </RoundedBox>
      <group ref={icon} position={[0, 0, 0.0105]} visible={false}>
        <mesh>
          <boxGeometry args={[0.05, 0.008, 0.001]} />
          <meshBasicMaterial color="#0B1026" />
        </mesh>
        <mesh position={[0.004, 0, 0]}>
          <boxGeometry args={[0.012, 0.04, 0.001]} />
          <meshBasicMaterial color="#0B1026" />
        </mesh>
        <mesh position={[-0.022, 0, 0]}>
          <boxGeometry args={[0.006, 0.018, 0.001]} />
          <meshBasicMaterial color="#0B1026" />
        </mesh>
      </group>
    </group>
  );
}
