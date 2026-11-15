import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  type Group,
  type MeshBasicMaterial,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Side, World } from "../../net/protocol";
import { registerRef } from "../sceneRefs";
import { PROPELLERS, WING } from "./drivers";
import { frame, mergeParts, type PartSpec, useDisposeGeometry } from "./merge";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// The wings seen through the side windows (§F9.7): cream wing x ±1.3 → ±4.0 at y 1.0 with a teal
// tip, an engine nacelle at x ±2.6 and a 3-blade propeller spinning at 30 rad/s. A stopped
// propeller spins down over 2.5 s. PROPELLERS is shared with the exterior plane.

const CREAM = "#F2E8D5";
const TEAL = "#2EC4B6";
const SLATE = "#2B2F3A";
const R = 0.55;
const PROP_RAD_S = 30;
const NACELLE_Y = -0.16;

const applyProps = (w: World, tw: SyncTweens) =>
  tw.to(
    PROPELLERS,
    {
      left: w.propeller_stopped === "left" ? 0 : 1,
      right: w.propeller_stopped === "right" ? 0 : 1,
    },
    2.5,
  );

function propParts(): PartSpec[] {
  return [
    ...[0, 1, 2].map((i): PartSpec => ({
      geo: new BoxGeometry(0.06, 0.5, 0.02),
      color: SLATE,
      at: [-Math.sin((i * Math.PI * 2) / 3) * 0.25, Math.cos((i * Math.PI * 2) / 3) * 0.25, 0],
      rot: [0, 0, (i * Math.PI * 2) / 3],
    })),
    {
      geo: new ConeGeometry(0.07, 0.16, 16),
      color: CREAM,
      at: [0, 0, -0.05],
      rot: [-Math.PI / 2, 0, 0],
    },
  ];
}

/** A 3-blade toy propeller + a faint motion disc; spin 0..1 of 30 rad/s from PROPELLERS. */
export function Propeller({ side, scale = 1 }: { side: Side; scale?: number }) {
  const hub = useRef<Group>(null);
  const disc = useRef<MeshBasicMaterial>(null);
  const geo = useMemo(() => mergeParts(propParts()), []);
  useDisposeGeometry(geo);
  useFrame((_, dt) => {
    const spin = PROPELLERS[side];
    if (hub.current) hub.current.rotation.z += PROP_RAD_S * spin * dt * (side === "left" ? 1 : -1);
    if (disc.current) disc.current.opacity = 0.05 * spin;
  });
  return (
    <group scale={scale}>
      <group ref={hub}>
        <mesh geometry={geo}>
          <meshStandardMaterial vertexColors roughness={R} />
        </mesh>
      </group>
      <mesh>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial
          ref={disc}
          color="#8C93A3"
          transparent
          opacity={0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function wingParts(side: Side): PartSpec[] {
  const s = side === "left" ? -1 : 1;
  const base = frame([s * WING.nacelleX, WING.y, 0]);
  return [
    // wing: x ±1.3 → ±4.0 (centered on ±2.65)
    {
      geo: new RoundedBoxGeometry(2.7, 0.08, 0.8, 2, 0.035),
      color: CREAM,
      at: [s * 0.05, 0, WING.z],
      parent: base,
    },
    {
      geo: new RoundedBoxGeometry(0.32, 0.09, 0.82, 2, 0.035),
      color: TEAL,
      at: [s * 1.25, 0, WING.z],
      parent: base,
    },
    // nacelle hanging under the wing's leading edge, pointing −Z, with a teal cowl ring
    {
      geo: new CapsuleGeometry(0.22, 0.9, 8, 16),
      color: CREAM,
      at: [0, NACELLE_Y, WING.nacelleZ],
      rot: [Math.PI / 2, 0, 0],
      parent: base,
    },
    {
      geo: new TorusGeometry(0.2, 0.035, 10, 24),
      color: TEAL,
      at: [0, NACELLE_Y, WING.nacelleZ - 0.5],
      parent: base,
    },
  ];
}

export function Wings() {
  const group = useRef<Group>(null);
  const geo = useMemo(() => mergeParts([...wingParts("left"), ...wingParts("right")]), []);
  useDisposeGeometry(geo);
  useLayoutEffect(() => registerRef("propellers", PROPELLERS), []);
  useWorldSync(applyProps, 2.5);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = stageOf(camera.position) === "cockpit";
  });
  return (
    <group ref={group} name="wings">
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={R} />
      </mesh>
      {(["left", "right"] as const).map((side) => (
        <group
          key={side}
          position={[
            (side === "left" ? -1 : 1) * WING.nacelleX,
            WING.y + NACELLE_Y,
            WING.nacelleZ - 0.72,
          ]}
        >
          <Propeller side={side} />
        </group>
      ))}
    </group>
  );
}
