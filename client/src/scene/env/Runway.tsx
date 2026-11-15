import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  type InstancedMesh,
  type MeshStandardMaterial,
  Object3D,
  type Points,
  ShaderMaterial,
} from "three";
import { EXTERIOR_PLANE } from "../../cinematics/cameraRig";
import type { World } from "../../net/protocol";
import { assertNever } from "../../util/assertNever";
import { registerRef } from "../sceneRefs";
import { RUNWAY } from "./drivers";
import { makeLightPointsMaterial, pxPerUnit } from "./lightPoints";
import { stageOf, useWorldSync, type Stage, type SyncTweens } from "./worldSync";

// The runway (§F9.7): a 60 × 1200 strip, center dashes every 30 m, two rows of edge lights at
// x ±28 and an approach light bar before the threshold. States: hidden; far (threshold at
// z −600, y −40, lights fade in); rolling (under the plane at y −1.2, dashes and lights stream
// past +Z at 60 m/s); stopped (stream 0). One copy per stage, both driven by RUNWAY.

const LENGTH = 1200;
const STEP = 30;
const N = LENGTH / STEP;
const EDGE_X = 28;
const APPROACH = 10;
const dummy = new Object3D();

function targets(state: World["runway"]): {
  stream: typeof RUNWAY.stream;
  place: typeof RUNWAY.place;
} {
  switch (state) {
    case "hidden":
      return { stream: { speed: 0, lights: 0 }, place: { y: -40, z: -600, shown: 0 } };
    case "far":
      return { stream: { speed: 0, lights: 1 }, place: { y: -40, z: -600, shown: 1 } };
    case "rolling":
      return { stream: { speed: 60, lights: 1 }, place: { y: -1.2, z: 300, shown: 1 } };
    case "stopped":
      // Dawn: the runway lights fade (§F0.2) but stay visible.
      return { stream: { speed: 0, lights: 0.45 }, place: { y: -1.2, z: 300, shown: 1 } };
    default:
      return assertNever(state);
  }
}

const applyRunway = (w: World, tw: SyncTweens) => {
  const t = targets(w.runway);
  tw.to(RUNWAY.stream, t.stream);
  tw.to(RUNWAY.place, t.place);
};

/** Stream offset (m), shared by both copies so a cut between stages doesn't jump. */
const stream = { offset: 0 };

function makeLightGeometry(): BufferGeometry {
  const pos = new Float32Array((N * 2 + APPROACH) * 3);
  const bright = new Float32Array(N * 2 + APPROACH).fill(1);
  for (let i = 0; i < APPROACH; i++) {
    pos[(N * 2 + i) * 3] = (i - (APPROACH - 1) / 2) * 3;
    pos[(N * 2 + i) * 3 + 1] = 0.4;
    pos[(N * 2 + i) * 3 + 2] = 30;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("aBright", new Float32BufferAttribute(bright, 1));
  return g;
}

function RunwayCopy({
  base,
  stage,
  onGroup,
}: {
  base: readonly [number, number, number];
  stage: Stage;
  onGroup?: (g: Group) => () => void;
}) {
  const group = useRef<Group>(null);
  const strip = useRef<MeshStandardMaterial>(null);
  const dashes = useRef<InstancedMesh>(null);
  const dashGeometry = useMemo(() => new BoxGeometry(1, 0.02, 12), []);
  const lights = useMemo(() => makeLightGeometry(), []);
  const lightPoints = useRef<Points>(null);
  const lightMat = useMemo(() => makeLightPointsMaterial("#FFF4D6", 2.6, 1.6, 2.5), []);

  useLayoutEffect(() => {
    const g = group.current;
    return g && onGroup ? onGroup(g) : undefined;
  }, [onGroup]);
  useLayoutEffect(
    () => () => {
      dashGeometry.dispose();
      lights.dispose();
      lightMat.dispose();
    },
    [dashGeometry, lights, lightMat],
  );

  useFrame(({ camera, size, viewport }) => {
    const g = group.current;
    if (!g) return;
    const p = RUNWAY.place;
    g.visible = p.shown > 0.01 && stageOf(camera.position) === stage;
    if (!g.visible) return;
    g.position.set(base[0], base[1] + p.y, base[2] + p.z);
    if (strip.current) {
      strip.current.opacity = Math.min(1, p.shown);
      strip.current.transparent = p.shown < 0.999;
    }
    const off = stream.offset;
    const m = dashes.current;
    if (m) {
      for (let k = 0; k < N; k++) {
        dummy.position.set(0, 0.02, -k * STEP + off - 6);
        dummy.updateMatrix();
        m.setMatrixAt(k, dummy.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    }
    const pts = lightPoints.current;
    if (pts) {
      const pos = pts.geometry.getAttribute("position");
      for (let k = 0; k < N; k++) {
        const z = -k * STEP + off;
        pos.setXYZ(k * 2, -EDGE_X, 0.4, z);
        pos.setXYZ(k * 2 + 1, EDGE_X, 0.4, z);
      }
      pos.needsUpdate = true;
      const m = pts.material;
      if (m instanceof ShaderMaterial) {
        const u = m.uniforms;
        if (u.opacity)
          u.opacity.value = Math.min(1, RUNWAY.stream.lights) * Math.min(1, p.shown * 2);
        if (u.pxPerUnit) u.pxPerUnit.value = pxPerUnit(size.height * viewport.dpr, camera);
      }
    }
  });

  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -LENGTH / 2]}>
        <planeGeometry args={[60, LENGTH]} />
        <meshStandardMaterial ref={strip} color="#2A2A2E" roughness={0.9} metalness={0} />
      </mesh>
      {/* threshold bar */}
      <mesh position={[0, 0.02, -2]}>
        <boxGeometry args={[50, 0.02, 2]} />
        <meshStandardMaterial color="#D9D9E0" roughness={0.8} />
      </mesh>
      <instancedMesh ref={dashes} args={[dashGeometry, undefined, N]} frustumCulled={false}>
        <meshStandardMaterial color="#E8E8E8" roughness={0.8} />
      </instancedMesh>
      <points
        ref={lightPoints}
        geometry={lights}
        material={lightMat}
        frustumCulled={false}
        renderOrder={6}
      />
    </group>
  );
}

const COCKPIT_BASE = [0, 0, 0] as const;
// The exterior plane's wheels touch y −1.2 relative to its center, like the cockpit floor's.
const EXTERIOR_BASE = [EXTERIOR_PLANE.x, EXTERIOR_PLANE.y, EXTERIOR_PLANE.z] as const;

export function Runway() {
  useWorldSync(applyRunway, 2);
  useFrame((_, dt) => {
    stream.offset = (stream.offset + RUNWAY.stream.speed * dt) % STEP;
  });
  const registerCockpit = useMemo(
    () => (group: Group) =>
      registerRef("runway", { group, stream: RUNWAY.stream, place: RUNWAY.place }),
    [],
  );
  return (
    <>
      <RunwayCopy base={COCKPIT_BASE} stage="cockpit" onGroup={registerCockpit} />
      <RunwayCopy base={EXTERIOR_BASE} stage="exterior" />
    </>
  );
}
