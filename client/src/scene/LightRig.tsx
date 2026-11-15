import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  Color,
  MathUtils,
  type DirectionalLight,
  type HemisphereLight,
  type PointLight,
} from "three";
import type { LightRig as RigName } from "../net/protocol";
import { useStore } from "../state/store";

interface RigParams {
  hemi: number;
  sky: string;
  ground: string;
  cabin: number;
  alarm: number; // peak of the red pulse
  alarmHz: number;
  amber: number;
  moon: number;
  fire: number;
  sun: number;
}

const BASE = { sky: "#2A3A6A", ground: "#10121A" };

// §F10.2 rigs as numbers. M1: rig changes damp over ~1 s; M3a adds timeline control and noise.
const RIGS: Record<RigName, RigParams> = {
  night_alarm: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    alarm: 2.5,
    alarmHz: 1.2,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 0,
  },
  night_calm: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    alarm: 0,
    alarmHz: 1.2,
    amber: 0.8,
    moon: 0.6,
    fire: 0,
    sun: 0,
  },
  fire: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    alarm: 0.8,
    alarmHz: 0.5,
    amber: 0.8,
    moon: 0.6,
    fire: 1.7,
    sun: 0,
  },
  storm: {
    hemi: 0.3,
    sky: "#1B2440",
    ground: "#05070C",
    cabin: 0.4,
    alarm: 0,
    alarmHz: 1,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 0,
  },
  dawn: {
    hemi: 0.6,
    sky: "#FFD9B0",
    ground: "#3A3A4A",
    cabin: 0.3,
    alarm: 0,
    alarmHz: 1,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 1.2,
  },
};

const RATE = 4; // damp rate: ~1 s to settle
const hemiSky = new Color();
const hemiGround = new Color();

// The cockpit lights (§F10.2), driven by `world.light_rig` and `world.fire.side`.
export function LightRig() {
  const hemi = useRef<HemisphereLight>(null);
  const cabin = useRef<PointLight>(null);
  const alarm = useRef<PointLight>(null);
  const amber = useRef<PointLight>(null);
  const moon = useRef<DirectionalLight>(null);
  const fire = useRef<PointLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const alarmPeak = useRef(0);

  useFrame(({ clock }, dt) => {
    const world = useStore.getState().flyer.world;
    const p = RIGS[world?.light_rig ?? "night_calm"];
    const t = clock.elapsedTime;
    if (hemi.current) {
      hemi.current.intensity = MathUtils.damp(hemi.current.intensity, p.hemi, RATE, dt);
      hemi.current.color.lerp(hemiSky.set(p.sky), 1 - Math.exp(-RATE * dt));
      hemi.current.groundColor.lerp(hemiGround.set(p.ground), 1 - Math.exp(-RATE * dt));
    }
    if (cabin.current)
      cabin.current.intensity = MathUtils.damp(cabin.current.intensity, p.cabin, RATE, dt);
    alarmPeak.current = MathUtils.damp(alarmPeak.current, p.alarm, RATE, dt);
    if (alarm.current) {
      alarm.current.intensity =
        alarmPeak.current * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * p.alarmHz));
    }
    if (amber.current)
      amber.current.intensity = MathUtils.damp(amber.current.intensity, p.amber, RATE, dt);
    if (moon.current)
      moon.current.intensity = MathUtils.damp(moon.current.intensity, p.moon, RATE, dt);
    if (sun.current) sun.current.intensity = MathUtils.damp(sun.current.intensity, p.sun, RATE, dt);
    if (fire.current) {
      const side = world?.fire.side === "left" ? -1 : 1;
      fire.current.position.x = 1.1 * side;
      const flicker = p.fire > 0 ? p.fire + 0.5 * Math.sin(t * 13) * Math.sin(t * 7.3) : 0;
      fire.current.intensity = MathUtils.damp(fire.current.intensity, flicker, 8, dt);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[BASE.sky, BASE.ground, 0.5]} />
      <pointLight
        ref={cabin}
        color="#FFD8A8"
        intensity={0.6}
        position={[0, 1.9, 0]}
        distance={4}
        decay={1}
      />
      <pointLight
        ref={alarm}
        color="#FF3B3B"
        intensity={0}
        position={[0, 1.8, -0.4]}
        distance={4}
        decay={1}
      />
      <pointLight
        ref={amber}
        color="#FFB347"
        intensity={0}
        position={[0.3, 1.6, -0.2]}
        distance={4}
        decay={1}
      />
      <directionalLight ref={moon} color="#9FB4FF" intensity={0} position={[-1, 2, -1]} />
      <pointLight
        ref={fire}
        color="#FF7A1A"
        intensity={0}
        position={[1.1, 1.3, -0.1]}
        distance={4}
        decay={1}
      />
      <directionalLight ref={sun} color="#FFB36B" intensity={0} position={[0, 0.3, -1]} />
    </>
  );
}
