import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  ACESFilmicToneMapping,
  type InstancedMesh,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { EXTERIOR_PLANE as EP } from "../../cinematics/cameraRig";
import { windowClock, type WindowShot } from "../../cinematics/towerWindowClock";
import { Atmosphere } from "../../scene/env/Atmosphere";
import { Clouds } from "../../scene/env/Clouds";
import { CLOUDS, PROPELLERS, RUNWAY, SKY, WEATHER } from "../../scene/env/drivers";
import { ExteriorPlane } from "../../scene/env/ExteriorPlane";
import { Runway } from "../../scene/env/Runway";
import { Sky } from "../../scene/env/Sky";
import { LightRig } from "../../scene/LightRig";
import { getRef } from "../../scene/sceneRefs";
import {
  CRASH_POOF_U,
  LANDING_TOUCH_U,
  LOOK_LAG_U,
  newPose,
  planePose,
  TOWER_CAM,
} from "./windowShots";

// The Tower window's scene (§F12.7): the existing exterior set (sky, clouds, runway, the
// exterior toy plane) seen from the control tower, plus toy hangars and the tower railing. It
// takes only the shot name: no fire side, no world, nothing from the Flyer. Every pose is a pure
// function of the shot clock, so it is seekable and identical for both fire sides.

const scratchLook = new Vector3();
const dummy = new Object3D();
const here = newPose();
const past = newPose();

/** Dusk for the takeoff, dawn for the landing, the moonlit night for the crash (§F0.2). */
const LOOK: Record<WindowShot, { dawn: number; stars: number; moon: number; storm: number }> = {
  takeoff: { dawn: 1, stars: 0.25, moon: 0.2, storm: 0 },
  landing: { dawn: 1, stars: 0, moon: 0, storm: 0 },
  crash: { dawn: 0, stars: 1, moon: 1, storm: 0.35 },
};

function Driver({ shot }: { shot: WindowShot }) {
  useEffect(() => {
    getRef("lightRig")?.setRig(shot === "crash" ? "night_calm" : "dawn", 0.05);
  }, [shot]);

  useFrame(({ camera }) => {
    // The shot owns the scene drivers (the scene's own world sync would snap them to the night
    // rest world on mount), set every frame so nothing can override them.
    const look = LOOK[shot];
    Object.assign(SKY, look);
    SKY.sun = look.dawn;
    CLOUDS.dawn = look.dawn;
    CLOUDS.storm = look.storm;
    CLOUDS.speed = 1.4;
    WEATHER.fog = 0.0016;
    RUNWAY.place.y = -1.2;
    RUNWAY.place.z = 300;
    RUNWAY.place.shown = 1;
    RUNWAY.stream.speed = 0;
    RUNWAY.stream.lights = shot === "landing" ? 0.45 : 1;
    const u = windowClock.u;
    planePose(shot, u, here);
    planePose(shot, Math.max(0, u - LOOK_LAG_U), past);
    const g = getRef("exteriorPlane");
    if (g) {
      g.position.set(EP.x + here.x, EP.y + here.y, EP.z + here.z);
      g.rotation.set(here.pitch, 0, here.roll);
      g.scale.setScalar(here.vis > 0 ? 1 : 0.0001);
    }
    PROPELLERS.left = here.props; // both engines, always the same
    PROPELLERS.right = here.props;
    camera.position.set(EP.x + TOWER_CAM.x, EP.y + TOWER_CAM.y, EP.z + TOWER_CAM.z);
    // A slow follow-pan: the gaze trails the plane a little (a tower camera on a pan head).
    const y = shot === "crash" && here.vis === 0 ? past.y : past.y + 2;
    camera.lookAt(scratchLook.set(EP.x + past.x, EP.y + y, EP.z + past.z));
  });
  return null;
}

const TRAIL_N = 26;

/** Smoke puffs strung along the plane's path: symmetric (centre line, or both nacelles). */
function Trail({
  shot,
  from,
  to,
  offsets,
}: {
  shot: WindowShot;
  from: number;
  to: number;
  offsets: readonly number[];
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(1, 8, 6), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const u = windowClock.u;
    let k = 0;
    for (const dx of offsets) {
      for (let i = 0; i < TRAIL_N; i++) {
        const age = i * 0.012;
        const uu = u - age;
        const live = uu >= from && uu <= to && u <= to + 0.02;
        planePose(shot, uu, past);
        const grow = shot === "crash" ? 0.9 + i * 0.1 : 0.5 + i * 0.09;
        dummy.position.set(
          EP.x + past.x + dx,
          EP.y + past.y + (shot === "crash" ? 0.6 : 0.2) + i * 0.05,
          EP.z + past.z + 2.4,
        );
        dummy.scale.setScalar(live ? grow : 0.0001);
        dummy.updateMatrix();
        m.setMatrixAt(k++, dummy.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, TRAIL_N * offsets.length]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#D9D6D0"
        transparent
        opacity={0.38}
        depthWrite={false}
        fog={false}
      />
    </instancedMesh>
  );
}

const PUFFS = 14;
const SPREAD = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: PUFFS }, () => ({
    x: rand() * 2 - 1,
    y: rand() * 2 - 1,
    z: rand() * 2 - 1,
    s: 0.5 + rand() * 0.6,
  }));
})();
const backOut = (t: number) => {
  const c = 1.7;
  const k = t - 1;
  return 1 + (c + 1) * k * k * k + c * k * k;
};

/** The big cartoon POOF where the plane vanishes (white spheres puffing out with back.out). */
function Poof() {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(1, 12, 8), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const p = (windowClock.u - CRASH_POOF_U) / 0.14;
    planePose("crash", CRASH_POOF_U, past);
    for (let i = 0; i < PUFFS; i++) {
      const s = SPREAD[i];
      if (!s) continue;
      const e = p <= 0 ? 0 : backOut(Math.min(1, p));
      dummy.position.set(
        EP.x + past.x + s.x * 14 * e,
        EP.y + past.y + s.y * 12 * e,
        EP.z + past.z + s.z * 8 * e,
      );
      dummy.scale.setScalar(Math.max(0.0001, 11 * s.s * e));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, PUFFS]} frustumCulled={false}>
      <meshBasicMaterial color="#FFFFFF" fog={false} toneMapped={false} />
    </instancedMesh>
  );
}

const HANGARS: readonly (readonly [number, number, number, string])[] = [
  [-62, -180, 1.5, "#C96F4A"],
  [-66, -400, 1.7, "#4F9DA6"],
  [-60, -470, 1.4, "#D9A441"],
];

/** Toy hangars on the near side of the strip: a box with a rounded roof and a dark door. */
function Hangars() {
  return (
    <group>
      {HANGARS.map(([x, z, s, color]) => (
        <group key={z} position={[EP.x + x, EP.y - 1.26, EP.z + z]} scale={s}>
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[14, 6, 20]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.5]}>
            <cylinderGeometry args={[7, 7, 20, 20, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#E8E4DC" roughness={0.7} />
          </mesh>
          <mesh position={[7.05, 2.2, 0]}>
            <boxGeometry args={[0.2, 4.4, 9]} />
            <meshStandardMaterial color="#2B2F3A" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The tower's own railing in the foreground: a thick rounded top rail on posts. */
function Railing() {
  const x = EP.x + TOWER_CAM.x - 1.0;
  const y = EP.y + TOWER_CAM.y;
  return (
    <group position={[x, y - 0.36, EP.z + TOWER_CAM.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.022, 14, 6, 12]} />
        <meshStandardMaterial color="#2B2F3A" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.014, 14, 4, 8]} />
        <meshStandardMaterial color="#2B2F3A" roughness={0.6} />
      </mesh>
      {[-2.6, -1.3, 0, 1.3, 2.6].map((z) => (
        <mesh key={z} position={[0, -0.6, z]}>
          <cylinderGeometry args={[0.018, 0.018, 1.3, 8]} />
          <meshStandardMaterial color="#2B2F3A" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

const NACELLES = [-2.6, 2.6] as const;
const CENTRE = [0] as const;

/**
 * The Tower window canvas. Props: the shot name, nothing else (§F12.7 privacy rule).
 */
export function TowerWindow({ shot }: { shot: WindowShot }) {
  return (
    <Canvas
      dpr={[1, 1.25]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{
        fov: 38,
        near: 0.3,
        far: 3000,
        position: [EP.x + TOWER_CAM.x, EP.y + TOWER_CAM.y, EP.z + TOWER_CAM.z],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
      }}
    >
      <Atmosphere />
      <LightRig />
      <Sky />
      <Clouds />
      <Runway />
      <ExteriorPlane />
      <group>
        <Hangars />
        <Railing />
        {shot === "landing" && (
          <Trail shot="landing" from={LANDING_TOUCH_U} to={1} offsets={NACELLES} />
        )}
        {shot === "crash" && (
          <>
            <Trail shot="crash" from={0.02} to={CRASH_POOF_U} offsets={CENTRE} />
            <Poof />
          </>
        )}
      </group>
      <Driver shot={shot} />
    </Canvas>
  );
}
