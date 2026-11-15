import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  CylinderGeometry,
  type Group,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { frame, mergeParts, type PartSpec, useDisposeGeometry, type V3 } from "./env/merge";
import { stageOf } from "./env/worldSync";
import { DEG } from "./parts/kit";
import { registerRef } from "./sceneRefs";

// The cockpit shell (§F9.2): floor, cream walls with window gaps, roof with the slate overhead
// housing, the windshield, glare shield, seats and yokes. Every static block is merged into a few
// vertex-colored meshes (§F21 draw-call budget); the pilot's seat stays its own group because
// p1_seat slides it.

const CREAM = "#F2E8D5";
const SLATE = "#2B2F3A";
const FLOOR = "#3D4352";
const CUSHION = "#E07A5F";
const R = 0.55; // roughness
// SPEC-ASSUMPTION: the roof sits at y 2.3 (not §F9.2's 2.05): the overhead face (§F9.3, center
// y 1.95 tilted 35°) reaches y ≈ 2.16 at its far edge, which would bury row 0 in a 2.05 roof.
const ROOF_Y = 2.3;

const block = (
  size: V3,
  at: V3,
  color = CREAM,
  radius = 0.02,
  parent?: PartSpec["parent"],
): PartSpec => ({
  geo: new RoundedBoxGeometry(
    size[0],
    size[1],
    size[2],
    2,
    Math.min(radius, Math.min(...size) / 2 - 0.001),
  ),
  color,
  at,
  parent,
});

/** One side wall (x = ±1.22) with the side-window opening y 1.2–1.7, z −0.6…0.4. */
function sideWall(side: 1 | -1): PartSpec[] {
  const x = 1.22 * side;
  return [
    block([0.08, 1.14, 2.2], [x, 0.63, 0]),
    block([0.08, ROOF_Y - 1.7, 2.2], [x, (ROOF_Y + 1.7) / 2, 0]),
    block([0.08, 0.5, 0.5], [x, 1.45, -0.85]),
    block([0.08, 0.5, 0.7], [x, 1.45, 0.75]),
    block([0.1, 0.05, 1.04], [x, 1.2, -0.1]),
    block([0.1, 0.05, 1.04], [x, 1.7, -0.1]),
  ];
}

/** Seat parts relative to the seat's own origin (x, 0, 0.3). */
function seat(): PartSpec[] {
  return [
    block([0.4, 0.38, 0.4], [0, 0.25, 0]),
    block([0.5, 0.12, 0.5], [0, 0.5, 0], CUSHION, 0.04),
    block([0.5, 0.7, 0.12], [0, 0.91, 0.25], CUSHION, 0.04),
    block([0.54, 0.06, 0.14], [0, 1.27, 0.25]),
  ];
}

function yoke(x: number): PartSpec[] {
  const base = frame([x, 0, -0.55]);
  return [
    {
      geo: new CylinderGeometry(0.025, 0.025, 0.85, 16),
      color: SLATE,
      at: [0, 0.425, 0],
      parent: base,
    },
    {
      geo: new TorusGeometry(0.12, 0.018, 12, 32, Math.PI),
      color: SLATE,
      at: [0, 0.97, 0],
      rot: [0, 0, Math.PI],
      parent: base,
    },
    { geo: new SphereGeometry(0.026, 16, 12), color: CREAM, at: [-0.12, 0.97, 0], parent: base },
    { geo: new SphereGeometry(0.026, 16, 12), color: CREAM, at: [0.12, 0.97, 0], parent: base },
  ];
}

function shellParts(): PartSpec[] {
  // Windshield frame: panes x −1.1…0 and 0…1.1, y 1.2–1.9 at z −1.15, tilted 20° back.
  const ws = frame([0, 1.2, -1.15], [20 * DEG, 0, 0]);
  const rightSeat = frame([0.5, 0, 0.3]);
  return [
    block([2.4, 0.06, 2.2], [0, 0.03, 0], FLOOR),
    ...sideWall(1),
    ...sideWall(-1),
    block([2.4, 0.08, 1.6], [0, ROOF_Y, -0.3]),
    block([2.4, 0.08, 0.6], [0, ROOF_Y, 0.8]),
    block([1.3, ROOF_Y - 2.18, 0.6], [0, (ROOF_Y + 2.18) / 2, -0.3], SLATE),
    block([2.4, ROOF_Y - 1.86, 0.08], [0, (ROOF_Y + 1.86) / 2, -0.95]),
    // rear bulkhead with a doorway (WIDE_INTERIOR looks in through it)
    block([0.7, ROOF_Y, 0.08], [-0.85, ROOF_Y / 2, 1.1]),
    block([0.7, ROOF_Y, 0.08], [0.85, ROOF_Y / 2, 1.1]),
    block([1.0, ROOF_Y - 1.85, 0.08], [0, (ROOF_Y + 1.85) / 2, 1.1]),
    block([2.4, 1.14, 0.06], [0, 0.63, -1.18]),
    block([2.1, 0.79, 0.25], [0, 0.455, -1.025], SLATE),
    block([2.1, 0.05, 0.15], [0, 1.17, -0.925], SLATE), // glare shield
    block([0.56, 0.36, 0.66], [0, 0.24, -0.47], SLATE), // pedestal body (tucked under the face)
    block([2.32, 0.06, 0.06], [0, 0, 0], CREAM, 0.02, ws),
    block([2.32, 0.06, 0.06], [0, 0.7, 0], CREAM, 0.02, ws),
    ...[-1.13, 0, 1.13].map((x) => block([0.06, 0.76, 0.06], [x, 0.35, 0], CREAM, 0.02, ws)),
    ...seat().map((p) => ({ ...p, parent: rightSeat })),
    ...yoke(-0.5),
    ...yoke(0.5),
  ];
}

function glassParts(): PartSpec[] {
  const ws = frame([0, 1.2, -1.15], [20 * DEG, 0, 0]);
  return [
    { geo: new PlaneGeometry(1.1, 0.7), color: "#ffffff", at: [-0.55, 0.35, 0], parent: ws },
    { geo: new PlaneGeometry(1.1, 0.7), color: "#ffffff", at: [0.55, 0.35, 0], parent: ws },
    {
      geo: new PlaneGeometry(1.0, 0.5),
      color: "#ffffff",
      at: [1.2, 1.45, -0.1],
      rot: [0, 90 * DEG, 0],
    },
    {
      geo: new PlaneGeometry(1.0, 0.5),
      color: "#ffffff",
      at: [-1.2, 1.45, -0.1],
      rot: [0, 90 * DEG, 0],
    },
  ];
}

/** The captain's seat: its own group, registered as `pilotSeat` (p1_seat slides it +0.4 m Z). */
function PilotSeat() {
  const ref = useRef<Group>(null);
  const geo = useMemo(() => mergeParts(seat()), []);
  useDisposeGeometry(geo);
  useLayoutEffect(() => {
    const g = ref.current;
    return g ? registerRef("pilotSeat", g) : undefined;
  }, []);
  return (
    <group ref={ref} position={[-0.5, 0, 0.3]}>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={R} />
      </mesh>
    </group>
  );
}

const STATIONS = ["station-overhead", "station-pedestal", "station-front"];

export function Cockpit() {
  const shell = useRef<Group>(null);
  const stations = useRef<Object3D[]>([]);
  const lookups = useRef(0);
  const shellGeo = useMemo(() => mergeParts(shellParts()), []);
  const glassGeo = useMemo(() => mergeParts(glassParts()), []);
  useDisposeGeometry(shellGeo);
  useDisposeGeometry(glassGeo);
  useLayoutEffect(() => {
    const g = shell.current;
    return g ? registerRef("cockpit", g) : undefined;
  }, []);
  // Stage culling: on the exterior-plane set the whole cockpit (shell + the three stations) is
  // hidden, so exterior shots never see the cabin box 300 m behind the plane.
  useFrame(({ camera, scene }) => {
    const on = stageOf(camera.position) === "cockpit";
    if (shell.current) shell.current.visible = on;
    // Look the stations up once (retrying only every 30 frames until all three are mounted).
    if (stations.current.length < STATIONS.length && lookups.current++ % 30 === 0) {
      stations.current = STATIONS.map((n) => scene.getObjectByName(n)).filter(
        (o): o is Object3D => o !== undefined,
      );
    }
    const list = stations.current;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s) s.visible = on;
    }
  });
  return (
    <group ref={shell} name="cockpit">
      <mesh geometry={shellGeo}>
        <meshStandardMaterial vertexColors roughness={R} />
      </mesh>
      <mesh geometry={glassGeo} renderOrder={1}>
        <meshStandardMaterial
          transparent
          opacity={0.12}
          color="#cfe8ff"
          roughness={0.3}
          depthWrite={false}
          side={2}
        />
      </mesh>
      <PilotSeat />
    </group>
  );
}
