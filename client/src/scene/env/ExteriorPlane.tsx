import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  type MeshBasicMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  type SpotLight,
  Vector3,
} from "three";
import { EXTERIOR_PLANE } from "../../cinematics/cameraRig";
import type { Side, World } from "../../net/protocol";
import { registerRef } from "../sceneRefs";
import { LANDING_LIGHTS } from "./drivers";
import { makeLightPointsMaterial, pxPerUnit } from "./lightPoints";
import { FireEmitter } from "./WingFire";
import { Propeller } from "./Wings";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// The exterior toy plane (§F9.7) at world (0, 50, −300): capsule fuselage (r 0.9, length 6) along
// Z, 12 m rounded wings with teal tips, two nacelles at x ±2.6 with propellers, a tail fin, a teal
// stripe and round windows. It mirrors the propellers and the wing fire, and shows warm landing
// light cones when `landing_lights` is on. Hidden while the camera is in the cockpit.
//
// SPEC-ASSUMPTION: the visible cones (§F9.9) are drawn on the exterior plane only. From inside
// the cockpit any beam volume covers the whole forward view and tinted the storm windshield
// beige; there the spotlights alone light the way.

const CREAM = "#F2E8D5";
const TEAL = "#2EC4B6";
const SLATE = "#2B2F3A";
const R = 0.55;

/** Nacelle (exterior-plane space): under the wing's leading edge. */
const NACELLE = { x: 2.6, y: -0.05, z: -1.0 };

const applyLights = (w: World, tw: SyncTweens) =>
  tw.to(LANDING_LIGHTS, { on: w.landing_lights ? 1 : 0 }, 1);

function Nacelle({ side }: { side: Side }) {
  const s = side === "left" ? -1 : 1;
  return (
    <group position={[s * NACELLE.x, NACELLE.y, NACELLE.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.36, 1.3, 8, 16]} />
        <meshStandardMaterial color={CREAM} roughness={R} />
      </mesh>
      <mesh position={[0, 0, -0.85]}>
        <torusGeometry args={[0.33, 0.05, 10, 24]} />
        <meshStandardMaterial color={TEAL} roughness={R} />
      </mesh>
      <group position={[0, 0, -1.05]}>
        <Propeller side={side} scale={1.7} />
      </group>
      {/* the fire sits on top of the nacelle, trailing back over the wing */}
      <group position={[0, 0.3, -0.2]}>
        <FireEmitter side={side} scale={1.5} trail={16} />
      </group>
    </group>
  );
}

function Wheel({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <group position={[x, -1.2 + r, z]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        <meshStandardMaterial color={SLATE} roughness={R} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, 0.16, 16]} />
        <meshStandardMaterial color="#1B1E26" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Fixed toy gear: wheel bottoms at y −1.2 (the runway height under each stage). */
function Gear() {
  return (
    <group name="gear">
      <Wheel x={-1.3} z={0.3} r={0.26} />
      <Wheel x={1.3} z={0.3} r={0.26} />
      <Wheel x={0} z={-2.1} r={0.2} />
    </group>
  );
}

const NO_CHILDREN: readonly Object3D[] = [];

function pointGeometry(points: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(points, 3));
  g.setAttribute(
    "aBright",
    new Float32BufferAttribute(new Array<number>(points.length / 3).fill(1), 1),
  );
  return g;
}

/** Wingtip nav lights (red left, green right) and a white tail strobe. */
function NavLights() {
  const lights = useMemo(
    () => [
      { g: pointGeometry([-6.1, 0.25, -0.4]), m: makeLightPointsMaterial("#FF3B3B", 2.4, 0.16, 3) },
      { g: pointGeometry([6.1, 0.25, -0.4]), m: makeLightPointsMaterial("#30E07C", 2.2, 0.16, 3) },
      { g: pointGeometry([0, 2.05, 3.05]), m: makeLightPointsMaterial("#FFFFFF", 3, 0.14, 3) },
    ],
    [],
  );
  useLayoutEffect(
    () => () => {
      for (const l of lights) {
        l.g.dispose();
        l.m.dispose();
      }
    },
    [lights],
  );
  const group = useRef<Group>(null);
  useFrame(({ clock, size, viewport, camera }) => {
    const px = pxPerUnit(size.height * viewport.dpr, camera);
    const children = group.current?.children ?? NO_CHILDREN;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!(child instanceof Points) || !(child.material instanceof ShaderMaterial)) continue;
      const u = child.material.uniforms;
      if (u.pxPerUnit) u.pxPerUnit.value = px;
      // The tail strobe (the third light) flashes 80 ms every 1.2 s.
      if (i === 2 && u.opacity) u.opacity.value = clock.elapsedTime % 1.2 < 0.08 ? 1 : 0;
    }
  });
  return (
    <group ref={group}>
      {lights.map((l, i) => (
        <points key={i} geometry={l.g} material={l.m} frustumCulled={false} />
      ))}
    </group>
  );
}

const apex = new Vector3();

/** Two warm, additive landing-light cones pointing forward-down from a nose point. */
function LandingCones({
  length,
  radius,
  opacity = 0.08,
  tilt = 0.09,
}: {
  length: number;
  radius: number;
  opacity?: number;
  /** Downward tip of the beams (rad). */
  tilt?: number;
}) {
  const group = useRef<Group>(null);
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    // From inside a beam (a camera in front of the nose) the cone would wash the whole frame:
    // fade it out as the camera comes round in front of the lights.
    g.getWorldPosition(apex);
    const ahead = apex.z - camera.position.z; // > 0: the camera is in front of the nose
    const fade = Math.min(1, Math.max(0, 1 - ahead / 4));
    const on = LANDING_LIGHTS.on * fade;
    g.visible = on > 0.01;
    const list = mats.current;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m) m.opacity = opacity * on;
    }
  });
  return (
    <group ref={group} visible={false}>
      {[-1, 1].map((s, i) => (
        // A cone's apex is at +Y; rotate so it opens toward −Z, tipped 5° down.
        <mesh
          key={s}
          position={[s * radius * 0.35, -length * 0.04, -length / 2]}
          rotation={[-Math.PI / 2 - tilt, 0, 0]}
        >
          <coneGeometry args={[radius, length, 24, 1, true]} />
          <meshBasicMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color="#FFE7B0"
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** A landing light at the nose point (ox + dx, oy, oz), aimed ahead and slightly outward/down. */
function aimSpot(
  spot: SpotLight | null,
  target: Object3D,
  ox: number,
  dx: number,
  oy: number,
  oz: number,
): void {
  if (!spot) return;
  spot.intensity = 6 * LANDING_LIGHTS.on;
  spot.position.set(ox + dx, oy, oz);
  target.position.set(ox + dx * 3, oy - 6, oz - 60);
  target.updateMatrixWorld();
}

/**
 * The two landing spotlights (#FFE7B0, angle 0.35, intensity 6). One pair serves both stages: it
 * moves to whichever stage the camera is on, so the light count never changes. Reach is 140 m
 * with decay 1.5 rather than §F9.9's 300 m: the full reach lit the storm cloud deck beige and
 * hid the far runway lights the reveal is about.
 */
function LandingSpots() {
  const spotA = useRef<SpotLight>(null);
  const spotB = useRef<SpotLight>(null);
  const targetA = useMemo(() => new Object3D(), []);
  const targetB = useMemo(() => new Object3D(), []);
  useFrame(({ camera }) => {
    const ext = stageOf(camera.position) === "exterior";
    const ox = ext ? EXTERIOR_PLANE.x : 0;
    const oy = ext ? EXTERIOR_PLANE.y - 0.4 : 0.35;
    const oz = ext ? EXTERIOR_PLANE.z - 3 : -1.4;
    aimSpot(spotA.current, targetA, ox, -0.6, oy, oz);
    aimSpot(spotB.current, targetB, ox, 0.6, oy, oz);
  });
  return (
    <>
      <spotLight
        ref={spotA}
        color="#FFE7B0"
        angle={0.35}
        penumbra={0.5}
        distance={140}
        decay={1.5}
        intensity={0}
        target={targetA}
      />
      <spotLight
        ref={spotB}
        color="#FFE7B0"
        angle={0.35}
        penumbra={0.5}
        distance={140}
        decay={1.5}
        intensity={0}
        target={targetB}
      />
    </>
  );
}

export function ExteriorPlane() {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  useLayoutEffect(() => {
    const g = root.current;
    return g ? registerRef("exteriorPlane", g) : undefined;
  }, []);
  useWorldSync(applyLights, 1);
  useFrame(({ camera }) => {
    if (body.current) body.current.visible = stageOf(camera.position) === "exterior";
  });

  return (
    <>
      <group
        ref={root}
        position={[EXTERIOR_PLANE.x, EXTERIOR_PLANE.y, EXTERIOR_PLANE.z]}
        name="exterior-plane"
      >
        <group ref={body}>
          {/* fuselage */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.9, 4.2, 12, 24]} />
            <meshStandardMaterial color={CREAM} roughness={R} />
          </mesh>
          {/* windshield */}
          <mesh position={[0, 0.42, -2.05]} rotation={[-0.7, 0, 0]} scale={[1, 0.55, 1]}>
            <sphereGeometry args={[0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color="#1B2A4A"
              roughness={0.15}
              emissive="#2A3A6A"
              emissiveIntensity={0.25}
            />
          </mesh>
          {/* teal stripe + round windows */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.86, -0.12, 0.1]}>
                <boxGeometry args={[0.06, 0.16, 4.6]} />
                <meshStandardMaterial color={TEAL} roughness={R} />
              </mesh>
              {[-1.1, -0.35, 0.4, 1.15].map((z) => (
                <mesh key={z} position={[s * 0.82, 0.22, z]} scale={[0.4, 1, 1]}>
                  <sphereGeometry args={[0.17, 12, 10]} />
                  <meshStandardMaterial
                    color="#1B2A4A"
                    roughness={0.2}
                    emissive="#FFD8A8"
                    emissiveIntensity={0.35}
                  />
                </mesh>
              ))}
            </group>
          ))}
          {/* wings with teal tips */}
          <RoundedBox args={[12, 0.15, 1.6]} radius={0.07} position={[0, 0.25, -0.4]}>
            <meshStandardMaterial color={CREAM} roughness={R} />
          </RoundedBox>
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.7, 0.17, 1.62]}
              radius={0.07}
              position={[s * 5.7, 0.25, -0.4]}
            >
              <meshStandardMaterial color={TEAL} roughness={R} />
            </RoundedBox>
          ))}
          {/* tail: fin + stabilizer */}
          <RoundedBox
            args={[0.14, 1.5, 1.3]}
            radius={0.06}
            position={[0, 1.2, 2.55]}
            rotation={[0.35, 0, 0]}
          >
            <meshStandardMaterial color={CREAM} roughness={R} />
          </RoundedBox>
          <RoundedBox
            args={[0.16, 0.5, 0.9]}
            radius={0.06}
            position={[0, 1.75, 2.85]}
            rotation={[0.35, 0, 0]}
          >
            <meshStandardMaterial color={TEAL} roughness={R} />
          </RoundedBox>
          <RoundedBox args={[4, 0.12, 1]} radius={0.05} position={[0, 0.3, 2.8]}>
            <meshStandardMaterial color={CREAM} roughness={R} />
          </RoundedBox>
          <Nacelle side="left" />
          <Nacelle side="right" />
          <Gear />
          <NavLights />
          <group position={[0, -0.4, -3]}>
            <LandingCones length={14} radius={2.6} />
          </group>
        </group>
      </group>
      <LandingSpots />
    </>
  );
}
