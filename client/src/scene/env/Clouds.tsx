import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  type InstancedMesh,
  type MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { EXTERIOR_PLANE } from "../../cinematics/cameraRig";
import type { World } from "../../net/protocol";
import { registerRef } from "../sceneRefs";
import { CLOUDS } from "./drivers";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// Toy clouds (§F9.7): puffs of 6 white spheres in one InstancedMesh per stage (the cockpit and
// the exterior plane each get their own field, since the camera is only ever on one of them).
// They scroll +Z at 30 m/s and wrap at z +80 → −600. Storm: #59607A, density ×2, pulled close
// (y −6…+6). Dawn: #FFE2C4.

const MAX_PUFFS = 80; // density 2
const BASE_PUFFS = 40;
const SPHERES = 6;
const Z_NEAR = 80;
const Z_FAR = -600;
const SPAN = Z_NEAR - Z_FAR;
const SPEED = 30;

const WHITE = new Color("#EEF1FF");
const STORM = new Color("#59607A");
const DAWN = new Color("#FFE2C4");
const tint = new Color();
const dummy = new Object3D();

interface Puff {
  x: number;
  yCalm: number;
  yStorm: number;
  z: number;
  size: number;
  /** Sphere offsets and radii relative to the puff, in puff units. */
  parts: { x: number; y: number; z: number; r: number }[];
}

function makePuffs(seed: number, levelMinX: number): Puff[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const puffs: Puff[] = [];
  for (let i = 0; i < MAX_PUFFS; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    // Every 6th puff floats at plane level, well off to the side (window / exterior parallax).
    const level = i % 6 === 2;
    // Plane-level puffs are small and kept clear of the plane by their own extent (a puff's
    // spheres reach ~2.6 × its size from its center).
    const size = level ? 2.5 + rand() * 3.5 : 5 + rand() * 9;
    const x = level ? side * (levelMinX + size * 2.6 + rand() * 50) : (rand() * 2 - 1) * 260;
    const yCalm = level ? -2 + rand() * 7 : -25 + rand() * 17;
    const yStorm = -6 + rand() * 12;
    const parts = [];
    for (let k = 0; k < SPHERES; k++) {
      const a = (k / SPHERES) * Math.PI * 2 + rand();
      const ring = k === 0 ? 0 : 0.9 + rand() * 0.5;
      parts.push({
        x: Math.cos(a) * ring,
        y: k === 0 ? 0.25 : rand() * 0.35,
        z: Math.sin(a) * ring * 0.7,
        r: k === 0 ? 1.15 : 0.6 + rand() * 0.35,
      });
    }
    puffs.push({ x, yCalm, yStorm, z: Z_FAR + rand() * SPAN, size, parts });
  }
  return puffs;
}

function cloudTargets(w: World): Partial<typeof CLOUDS> {
  const storm =
    w.weather === "storm" ? 1 : w.weather === "rain" ? 0.85 : w.weather === "rain_light" ? 0.5 : 0;
  return { storm, density: 1 + storm, dawn: w.weather === "clear_dawn" ? 1 : 0 };
}

const applyClouds = (w: World, tw: SyncTweens) => tw.to(CLOUDS, cloudTargets(w));

interface FieldProps {
  origin: readonly [number, number, number];
  seed: number;
  stage: "cockpit" | "exterior";
  /** Plane-level puffs keep at least this far off to the side (m). */
  levelMinX: number;
}

function CloudField({ origin, seed, stage, levelMinX }: FieldProps) {
  const mesh = useRef<InstancedMesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const puffs = useMemo(() => makePuffs(seed, levelMinX), [seed, levelMinX]);
  const geometry = useMemo(() => new SphereGeometry(1, 14, 10), []);
  const offset = useRef(0);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const on = stageOf(camera.position) === stage;
    m.visible = on;
    offset.current = (offset.current + SPEED * CLOUDS.speed * dt) % SPAN;
    if (!on) return;
    const count = Math.min(MAX_PUFFS, Math.round(BASE_PUFFS * Math.max(0, CLOUDS.density)));
    const st = Math.min(1, Math.max(0, CLOUDS.storm));
    let n = 0;
    for (let i = 0; i < count; i++) {
      const p = puffs[i];
      if (!p) continue;
      let z = p.z + offset.current;
      if (z > Z_NEAR) z -= SPAN;
      const y = p.yCalm + (p.yStorm - p.yCalm) * st;
      const size = p.size * (1 + 0.25 * st);
      // Any puff tall enough to reach the plane is kept clear of it sideways by its own extent,
      // so no sphere ever passes through the cabin (storm puffs crowd in, but around it).
      let x = p.x;
      if (y + 1.2 * size > -2) {
        const minX = size * 2.6 + 4;
        if (Math.abs(x) < minX) x = (x < 0 ? -1 : 1) * minX;
      }
      for (let j = 0; j < p.parts.length; j++) {
        const part = p.parts[j];
        if (!part) continue;
        dummy.position.set(
          origin[0] + x + part.x * size,
          origin[1] + y + part.y * size,
          origin[2] + z + part.z * size,
        );
        const r = part.r * size;
        dummy.scale.set(r, r * 0.72, r);
        dummy.updateMatrix();
        m.setMatrixAt(n++, dummy.matrix);
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (mat.current) {
      tint
        .copy(WHITE)
        .lerp(STORM, st)
        .lerp(DAWN, Math.min(1, Math.max(0, CLOUDS.dawn)));
      mat.current.color.copy(tint);
      mat.current.emissive.copy(tint);
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, MAX_PUFFS * SPHERES]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        ref={mat}
        color="#EEF1FF"
        emissive="#EEF1FF"
        emissiveIntensity={0.12}
        roughness={1}
        metalness={0}
      />
    </instancedMesh>
  );
}

const COCKPIT_ORIGIN = [0, 0, 0] as const;
const EXTERIOR_ORIGIN = [EXTERIOR_PLANE.x, EXTERIOR_PLANE.y, EXTERIOR_PLANE.z + 300] as const;

export function Clouds() {
  useLayoutEffect(() => registerRef("clouds", CLOUDS), []);
  useWorldSync(applyClouds, 2);
  return (
    <>
      <CloudField origin={COCKPIT_ORIGIN} seed={11} stage="cockpit" levelMinX={14} />
      <CloudField origin={EXTERIOR_ORIGIN} seed={23} stage="exterior" levelMinX={24} />
    </>
  );
}
