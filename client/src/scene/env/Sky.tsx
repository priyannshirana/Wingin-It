import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Mesh,
  type MeshBasicMaterial,
  type Points,
  type PointsMaterial,
  ShaderMaterial,
} from "three";
import type { World } from "../../net/protocol";
import { getRef, registerRef, type SkyDrivers } from "../sceneRefs";
import { SKY } from "./drivers";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// Sky (§F9.7, §F0.2): an inverted gradient dome (r 1500), stars, the moon and the dawn sun.
// Night #0B1026 → #2A3A6A, storm #0A0F1A → #1E2633, dawn #FFB36B → #A8D8FF; cross-fade 2 s.

const STAR_COUNT = 2000;
const STAR_RADIUS = 900;
const MOON_POS: [number, number, number] = [-200, 160, -500];
const SUN_POS: [number, number, number] = [0, 20, -900];
const MOON = new Color("#F2F4FF");
const SUN = new Color("#FFB36B");
const scratch = new Color();

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Colors arrive linear (three's Color); postprocessing does the output conversion.
const FRAG = /* glsl */ `
uniform vec3 nightTop; uniform vec3 nightHorizon;
uniform vec3 stormTop; uniform vec3 stormHorizon;
uniform vec3 dawnTop; uniform vec3 dawnHorizon;
uniform vec3 below;
uniform float storm; uniform float dawn; uniform float flash;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  float t = smoothstep(-0.02, 0.55, h);
  vec3 night = mix(nightHorizon, nightTop, t);
  vec3 st = mix(stormHorizon, stormTop, t);
  vec3 dw = mix(dawnHorizon, dawnTop, pow(t, 0.7));
  vec3 c = mix(mix(night, st, storm), dw, dawn);
  // Under the horizon: the haze above the cloud sea, a little darker.
  c = mix(c, c * below, smoothstep(0.0, -0.35, h));
  // Lightning lights the whole dome, strongest near the horizon.
  c += vec3(0.55, 0.62, 0.8) * flash * (1.0 - 0.5 * t);
  gl_FragColor = vec4(c, 1.0);
}`;

function makeSkyMaterial(): ShaderMaterial {
  const c = (hex: string) => ({ value: new Color(hex) });
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      nightTop: c("#0B1026"),
      nightHorizon: c("#2A3A6A"),
      stormTop: c("#0A0F1A"),
      stormHorizon: c("#1E2633"),
      dawnTop: c("#A8D8FF"),
      dawnHorizon: c("#FFB36B"),
      below: { value: new Color(0.55, 0.55, 0.6) },
      storm: { value: 0 },
      dawn: { value: 0 },
      flash: { value: 0 },
    },
  });
}

/** Stars on the upper hemisphere only (the cloud sea and fog own everything below). */
function makeStarGeometry(): BufferGeometry {
  const pos = new Float32Array(STAR_COUNT * 3);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const y = 0.04 + 0.96 * Math.pow(rand(), 0.8);
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * STAR_RADIUS;
    pos[i * 3 + 1] = y * STAR_RADIUS;
    pos[i * 3 + 2] = Math.sin(a) * r * STAR_RADIUS;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

function skyTargets(w: World): SkyDrivers {
  const storm =
    w.weather === "storm" || w.weather === "rain" ? 1 : w.weather === "rain_light" ? 0.7 : 0;
  const dawn = w.weather === "clear_dawn" ? 1 : 0;
  return {
    storm,
    dawn,
    moon: storm > 0 || dawn > 0 ? 0 : 1,
    stars: storm > 0 || dawn > 0 ? 0 : 1,
    sun: dawn,
  };
}

const applySky = (w: World, tw: SyncTweens) => tw.to(SKY, { ...skyTargets(w) });

export function Sky() {
  const material = useMemo(() => makeSkyMaterial(), []);
  const stars = useMemo(() => makeStarGeometry(), []);
  const starMat = useRef<PointsMaterial>(null);
  const starPoints = useRef<Points>(null);
  const moon = useRef<Mesh>(null);
  const moonMat = useRef<MeshBasicMaterial>(null);
  const sun = useRef<Mesh>(null);
  const sunMat = useRef<MeshBasicMaterial>(null);
  const dome = useRef<Mesh>(null);

  useLayoutEffect(() => registerRef("sky", SKY), []);
  useLayoutEffect(
    () => () => {
      material.dispose();
      stars.dispose();
    },
    [material, stars],
  );
  useWorldSync(applySky, 2);

  useFrame(({ camera }) => {
    // The dome follows the camera so both stages (cockpit, exterior plane) sit at its center.
    dome.current?.position.copy(camera.position);
    starPoints.current?.position.copy(camera.position);
    const m = dome.current?.material;
    if (m instanceof ShaderMaterial) {
      const u = m.uniforms;
      if (u.storm) u.storm.value = SKY.storm;
      if (u.dawn) u.dawn.value = SKY.dawn;
      const lightning = getRef("lightRig")?.lightning.intensity ?? 0;
      if (u.flash) u.flash.value = Math.min(1, lightning / 6);
    }
    if (starMat.current) starMat.current.opacity = Math.max(0, Math.min(1, SKY.stars)) * 0.9;
    if (starPoints.current) starPoints.current.visible = SKY.stars > 0.01;
    if (moon.current && moonMat.current) {
      moon.current.visible = SKY.moon > 0.01;
      moon.current.position.set(
        camera.position.x + MOON_POS[0],
        camera.position.y + MOON_POS[1],
        camera.position.z + MOON_POS[2],
      );
      // Just above the bloom threshold so it halos softly.
      moonMat.current.color.copy(scratch.copy(MOON).multiplyScalar(1.15 * SKY.moon));
    }
    if (sun.current && sunMat.current) {
      sun.current.visible = SKY.sun > 0.01;
      // SPEC-ASSUMPTION: on the exterior set the sun rises behind the plane (+Z) instead of
      // ahead of it — the landing hero shot (EXT_FRONT_LOW) looks back at the nose, and the
      // sunrise must be in that frame; the cockpit still sees it ahead (§F9.7: z −900).
      const zSign = stageOf(camera.position) === "exterior" ? -1 : 1;
      sun.current.position.set(
        camera.position.x + SUN_POS[0],
        camera.position.y + SUN_POS[1] * SKY.sun - 30 * (1 - SKY.sun),
        camera.position.z + SUN_POS[2] * zSign,
      );
      sun.current.rotation.y = zSign < 0 ? Math.PI : 0;
      sunMat.current.color.copy(scratch.copy(SUN).multiplyScalar(3.4 * SKY.sun));
    }
  });

  return (
    <group>
      <mesh ref={dome} renderOrder={-10} frustumCulled={false} material={material}>
        <sphereGeometry args={[1500, 32, 16]} />
      </mesh>
      <points ref={starPoints} geometry={stars} renderOrder={-9} frustumCulled={false}>
        <pointsMaterial
          ref={starMat}
          color="#DDE4FF"
          size={1.6}
          sizeAttenuation={false}
          transparent
          depthWrite={false}
          fog={false}
          blending={AdditiveBlending}
        />
      </points>
      <mesh ref={moon} renderOrder={-8}>
        <sphereGeometry args={[18, 24, 16]} />
        <meshBasicMaterial
          ref={moonMat}
          color="#F2F4FF"
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={sun} renderOrder={-8}>
        <circleGeometry args={[70, 48]} />
        <meshBasicMaterial
          ref={sunMat}
          color="#FFB36B"
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
