import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, type Group, type MeshStandardMaterial } from "three";
import { LOW_FUEL_S } from "../../config";
import { useStore } from "../../state/store";
import { DEG, ROUGHNESS, type PartProps } from "./kit";

const R = 0.05;

// FuelGauge (§F9.4): cream dial, red zone over the first 20%, needle angle
// −120° + 240° × fuel / max (clockwise from up), eased (damp 4/s), pulsing red when low.
export function FuelGauge(_props: PartProps) {
  const needle = useRef<Group>(null);
  const zone = useRef<MeshStandardMaterial>(null);
  const angle = useRef(-120 * DEG);

  useFrame((_, dt) => {
    const g = useStore.getState().game;
    const frac = g && g.fuel_max_s > 0 ? MathUtils.clamp(g.fuel_s / g.fuel_max_s, 0, 1) : 1;
    const target = (-120 + 240 * frac) * DEG;
    angle.current = MathUtils.damp(angle.current, target, 4, dt);
    if (needle.current) needle.current.rotation.z = -angle.current;
    if (zone.current) {
      const low = g !== null && g.fuel_draining && g.fuel_s < LOW_FUEL_S;
      zone.current.emissiveIntensity = low ? 1.2 + Math.sin(performance.now() / 120) : 0;
    }
  });

  return (
    <group>
      <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.006]}>
        <cylinderGeometry args={[R + 0.008, R + 0.008, 0.012, 40]} />
        <meshStandardMaterial color="#3D4352" roughness={ROUGHNESS} />
      </mesh>
      <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.013]}>
        <cylinderGeometry args={[R, R, 0.002, 40]} />
        <meshStandardMaterial color="#F2E8D5" roughness={ROUGHNESS} />
      </mesh>
      {/* Red zone: the first 20% of the sweep (−120° … −72° clockwise from up). */}
      <mesh position={[0, 0, 0.0145]}>
        <ringGeometry args={[R * 0.72, R * 0.92, 24, 1, (90 + 72) * DEG, 48 * DEG]} />
        <meshStandardMaterial ref={zone} color="#E5484D" emissive="#E5484D" toneMapped={false} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.016]}>
        <mesh position={[0, 0.018, 0]}>
          <boxGeometry args={[0.004, 0.04, 0.002]} />
          <meshStandardMaterial color="#111111" roughness={ROUGHNESS} />
        </mesh>
      </group>
    </group>
  );
}
