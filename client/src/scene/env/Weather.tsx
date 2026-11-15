import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, type InstancedMesh, Matrix4, Object3D, SphereGeometry } from "three";
import type { World } from "../../net/protocol";
import { DEG } from "../parts/kit";
import { registerRef } from "../sceneRefs";
import { WEATHER } from "./drivers";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// Weather (§F9.7): rain (rain / storm / rain_light) = 2,000 instanced streaks in a 40 × 20 × 60
// box around the camera, falling at 25 m/s and streaking back with the airflow (rain_light = 40%);
// windshield droplets (60 small spheres sliding up and outward); fog density (Atmosphere applies
// WEATHER.fog, synced to world.fog over 2 s). The lightning light lives in LightRig.

const RAIN_N = 2000;
const BOX = { x: 40, y: 20, z: 60 };
const FALL = 25;
const BLOW = 30; // the plane flies −Z, so the rain streams back +Z
const DROPS_N = 60;

// The cabin interior (cockpit space): no rain inside it.
const CABIN = { x: 1.3, yMax: 2.45, zMin: -1.3, zMax: 1.2 };

// Each streak is tilted along its velocity (0, −25, +30).
const STREAK = new Matrix4().makeRotationX(Math.atan2(BLOW, FALL));
const dummy = new Object3D();

function rainTargets(w: World): Partial<typeof WEATHER> {
  const rain =
    w.weather === "rain" || w.weather === "storm" ? 1 : w.weather === "rain_light" ? 0.4 : 0;
  const droplets =
    w.weather === "storm" || w.weather === "rain" ? 40 : w.weather === "rain_light" ? 20 : 0;
  return { rain, droplets, fog: w.fog };
}

const applyWeather = (w: World, tw: SyncTweens) => tw.to(WEATHER, rainTargets(w));

function hash(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function Rain() {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(0.012, 0.55, 0.012), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    const n = Math.round(RAIN_N * Math.min(1, Math.max(0, WEATHER.rain)));
    m.visible = n > 0;
    if (!m.visible) return;
    const t = clock.elapsedTime;
    const cam = camera.position;
    const inCockpit = stageOf(cam) === "cockpit";
    const arr = m.instanceMatrix.array;
    const rot = STREAK.elements;
    for (let i = 0; i < n; i++) {
      // Position = a fixed seed point advected by the wind, wrapped into the box around the camera.
      const fx = hash(i, 1) * BOX.x;
      const fy = (hash(i, 2) * BOX.y - t * FALL) % BOX.y;
      const fz = (hash(i, 3) * BOX.z + t * BLOW) % BOX.z;
      const x = cam.x - BOX.x / 2 + ((((fx - cam.x) % BOX.x) + BOX.x) % BOX.x);
      const y = cam.y - BOX.y / 2 + ((((fy - cam.y) % BOX.y) + BOX.y) % BOX.y);
      const z = cam.z - BOX.z / 2 + ((((fz - cam.z) % BOX.z) + BOX.z) % BOX.z);
      const o = i * 16;
      for (let k = 0; k < 16; k++) arr[o + k] = rot[k] ?? 0;
      const hidden =
        inCockpit && Math.abs(x) < CABIN.x && y < CABIN.yMax && z > CABIN.zMin && z < CABIN.zMax;
      arr[o + 12] = x;
      arr[o + 13] = hidden ? -1000 : y;
      arr[o + 14] = z;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, RAIN_N]}
      frustumCulled={false}
      renderOrder={1}
    >
      <meshBasicMaterial color="#B8C7E0" transparent opacity={0.5} depthWrite={false} />
    </instancedMesh>
  );
}

/** Droplets on the two windshield panes (the Cockpit windshield group's frame, §F9.2). */
function Droplets() {
  const mesh = useRef<InstancedMesh>(null);
  const group = useRef<Object3D>(null);
  const geometry = useMemo(() => new SphereGeometry(1, 10, 8), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    const n = Math.round(Math.min(DROPS_N, Math.max(0, WEATHER.droplets)));
    m.visible = n > 0 && stageOf(camera.position) === "cockpit";
    if (!m.visible) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const life = 1.6 + hash(i, 4) * 1.6;
      const age = (t / life + hash(i, 5)) % 1;
      const x0 = (hash(i, 6) * 2 - 1) * 1.05;
      // Slide up the glass and outward with the airflow.
      dummy.position.set(
        x0 + Math.sign(x0) * age * 0.25,
        0.05 + hash(i, 7) * 0.3 + age * 0.35,
        -0.012,
      );
      const r = 0.0035 + hash(i, 8) * 0.0045;
      dummy.scale.set(r, r * (1.15 + age * 0.8), r * 0.4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={group} position={[0, 1.2, -1.15]} rotation={[20 * DEG, 0, 0]}>
      <instancedMesh
        ref={mesh}
        args={[geometry, undefined, DROPS_N]}
        frustumCulled={false}
        renderOrder={1}
      >
        <meshStandardMaterial
          color="#d8ecff"
          emissive="#9fb4ff"
          emissiveIntensity={0.2}
          roughness={0.05}
          transparent
          opacity={0.38}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

export function Weather() {
  useLayoutEffect(() => registerRef("weather", WEATHER), []);
  useWorldSync(applyWeather, 2);
  return (
    <>
      <Rain />
      <Droplets />
    </>
  );
}
