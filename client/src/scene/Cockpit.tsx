import { RoundedBox } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";
import type { Group } from "three";
import { DEG } from "./parts/kit";
import { registerRef } from "./sceneRefs";

const CREAM = "#F2E8D5";
const SLATE = "#2B2F3A";
const FLOOR = "#3D4352";
const CUSHION = "#E07A5F";
const R = 0.55; // roughness
// SPEC-ASSUMPTION: the roof sits at y 2.3 (not §F9.2's 2.05): the overhead face (§F9.3, center
// y 1.95 tilted 35°) reaches y ≈ 2.16 at its far edge, which would bury row 0 in a 2.05 roof.
const ROOF_Y = 2.3;

type V3 = [number, number, number];

function Block({
  size,
  at,
  color = CREAM,
  radius = 0.02,
}: {
  size: V3;
  at: V3;
  color?: string;
  radius?: number;
}) {
  return (
    <RoundedBox args={size} radius={radius} position={at}>
      <meshStandardMaterial color={color} roughness={R} />
    </RoundedBox>
  );
}

function Glass({ size, at, rotation }: { size: [number, number]; at: V3; rotation?: V3 }) {
  return (
    <mesh position={at} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        transparent
        opacity={0.12}
        color="#cfe8ff"
        roughness={0.05}
        depthWrite={false}
      />
    </mesh>
  );
}

/** One side wall (x = ±1.22) with the side-window opening y 1.2–1.7, z −0.6…0.4 (§F9.2). */
function SideWall({ side }: { side: 1 | -1 }) {
  const x = 1.22 * side;
  return (
    <group>
      <Block size={[0.08, 1.14, 2.2]} at={[x, 0.63, 0]} />
      <Block size={[0.08, ROOF_Y - 1.7, 2.2]} at={[x, (ROOF_Y + 1.7) / 2, 0]} />
      <Block size={[0.08, 0.5, 0.5]} at={[x, 1.45, -0.85]} />
      <Block size={[0.08, 0.5, 0.7]} at={[x, 1.45, 0.75]} />
      {/* rounded cream window frame */}
      <Block size={[0.1, 0.05, 1.04]} at={[x, 1.2, -0.1]} radius={0.02} />
      <Block size={[0.1, 0.05, 1.04]} at={[x, 1.7, -0.1]} radius={0.02} />
      <Glass size={[1.0, 0.5]} at={[1.2 * side, 1.45, -0.1]} rotation={[0, 90 * DEG, 0]} />
    </group>
  );
}

function Seat({ x, registerPilot = false }: { x: number; registerPilot?: boolean }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    if (!registerPilot || !ref.current) return;
    return registerRef("pilotSeat", ref.current);
  }, [registerPilot]);
  return (
    <group ref={ref} position={[x, 0, 0.3]}>
      <Block size={[0.4, 0.38, 0.4]} at={[0, 0.25, 0]} />
      <Block size={[0.5, 0.12, 0.5]} at={[0, 0.5, 0]} color={CUSHION} radius={0.04} />
      <Block size={[0.5, 0.7, 0.12]} at={[0, 0.91, 0.25]} color={CUSHION} radius={0.04} />
      <Block size={[0.54, 0.06, 0.14]} at={[0, 1.27, 0.25]} />
    </group>
  );
}

function Yoke({ x }: { x: number }) {
  return (
    <group position={[x, 0, -0.55]}>
      <mesh position={[0, 0.425, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.85, 16]} />
        <meshStandardMaterial color={SLATE} roughness={R} />
      </mesh>
      {/* the grip: a half torus opening upward */}
      <mesh position={[0, 0.97, 0]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.12, 0.018, 12, 32, Math.PI]} />
        <meshStandardMaterial color={SLATE} roughness={R} />
      </mesh>
      {[-0.12, 0.12].map((dx) => (
        <mesh key={dx} position={[dx, 0.97, 0]}>
          <sphereGeometry args={[0.026, 16, 12]} />
          <meshStandardMaterial color={CREAM} roughness={R} />
        </mesh>
      ))}
    </group>
  );
}

/** Windshield: two panes x −1.1…0 and 0…1.1, y 1.2–1.9 at z −1.15, tilted 20° back (§F9.2). */
function Windshield() {
  return (
    <group position={[0, 1.2, -1.15]} rotation={[20 * DEG, 0, 0]}>
      <Glass size={[1.1, 0.7]} at={[-0.55, 0.35, 0]} />
      <Glass size={[1.1, 0.7]} at={[0.55, 0.35, 0]} />
      <Block size={[2.32, 0.06, 0.06]} at={[0, 0, 0]} />
      <Block size={[2.32, 0.06, 0.06]} at={[0, 0.7, 0]} />
      {[-1.13, 0, 1.13].map((x) => (
        <Block key={x} size={[0.06, 0.76, 0.06]} at={[x, 0.35, 0]} />
      ))}
    </group>
  );
}

// The cockpit shell (§F9.2): floor, cream walls with window gaps, roof, rear bulkhead,
// windshield, glare shield, seats, yokes, and the console bodies under the station faces.
export function Cockpit() {
  return (
    <group name="cockpit">
      <Block size={[2.4, 0.06, 2.2]} at={[0, 0.03, 0]} color={FLOOR} />
      <SideWall side={1} />
      <SideWall side={-1} />
      <Block size={[2.4, 0.08, 1.6]} at={[0, ROOF_Y, -0.3]} />
      <Block size={[2.4, 0.08, 0.6]} at={[0, ROOF_Y, 0.8]} />
      {/* slate housing that hangs the overhead panel from the roof */}
      <Block size={[1.3, ROOF_Y - 2.18, 0.6]} at={[0, (ROOF_Y + 2.18) / 2, -0.3]} color={SLATE} />
      {/* the brow between the windshield top and the roof */}
      <Block size={[2.4, ROOF_Y - 1.86, 0.08]} at={[0, (ROOF_Y + 1.86) / 2, -0.95]} />
      {/* rear bulkhead with a doorway, so the WIDE_INTERIOR shot can look in */}
      <Block size={[0.7, ROOF_Y, 0.08]} at={[-0.85, ROOF_Y / 2, 1.1]} />
      <Block size={[0.7, ROOF_Y, 0.08]} at={[0.85, ROOF_Y / 2, 1.1]} />
      <Block size={[1.0, ROOF_Y - 1.85, 0.08]} at={[0, (ROOF_Y + 1.85) / 2, 1.1]} />
      {/* nose wall under the windshield and the front-panel housing */}
      <Block size={[2.4, 1.14, 0.06]} at={[0, 0.63, -1.18]} />
      <Block size={[2.1, 0.79, 0.25]} at={[0, 0.455, -1.025]} color={SLATE} />
      {/* glare shield above the front panel */}
      <Block size={[2.1, 0.05, 0.15]} at={[0, 1.17, -0.925]} color={SLATE} />
      {/* pedestal console under its sloped face */}
      <Block size={[0.56, 0.54, 0.7]} at={[0, 0.33, -0.45]} color={SLATE} />
      <Windshield />
      <Seat x={-0.5} registerPilot />
      <Seat x={0.5} />
      <Yoke x={-0.5} />
      <Yoke x={0.5} />
    </group>
  );
}
