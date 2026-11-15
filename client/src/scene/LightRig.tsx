import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  Color,
  MathUtils,
  type DirectionalLight,
  type HemisphereLight,
  type PointLight,
} from "three";
import type { LightRig as RigName, World } from "../net/protocol";
import { FIRE } from "./env/drivers";
import { currentWorld, dampK, stageOf, useWorldSync, worldSync } from "./env/worldSync";
import { registerRef } from "./sceneRefs";

// The five light rigs (§F10.2, colors per the §F0.2 color script), cross-faded over ~1 s.
// Lamps and fire are the only things above the bloom threshold; the rigs keep every lit surface
// below it. The cabin and alarm point lights sit lower than §F10.2's (0, 1.9, 0) / (0, 1.8, −0.4):
// 20 cm under the overhead they painted specular hot spots on the panel that read as lit lamps.

interface RigParams {
  hemi: number;
  sky: string;
  ground: string;
  cabin: number;
  cabinColor: string;
  alarm: number; // peak of the red pulse
  alarmHz: number;
  amber: number;
  moon: number;
  fire: number;
  sun: number;
  /** Soft key on the instrument faces so labels stay readable in the dark rigs. */
  panel: number;
  /** Exterior-plane key (moon / storm / low sun), only while the camera is on the exterior set. */
  ext: number;
  extColor: string;
}

const BASE = { sky: "#2A3A6A", ground: "#10121A" };

const RIGS: Record<RigName, RigParams> = {
  night_alarm: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    cabinColor: "#FFD8A8",
    alarm: 2.5,
    alarmHz: 1.2,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 0,
    panel: 0.25,
    ext: 1.4,
    extColor: "#9FB4FF",
  },
  night_calm: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    cabinColor: "#FFD8A8",
    alarm: 0,
    alarmHz: 1.2,
    amber: 0.8,
    moon: 0.6,
    fire: 0,
    sun: 0,
    panel: 0.3,
    ext: 1.4,
    extColor: "#9FB4FF",
  },
  fire: {
    hemi: 0.5,
    ...BASE,
    cabin: 0.6,
    cabinColor: "#FFD8A8",
    alarm: 0.8,
    alarmHz: 0.5,
    amber: 0.8,
    moon: 0.6,
    fire: 1.7,
    sun: 0,
    panel: 0.3,
    ext: 1.3,
    extColor: "#9FB4FF",
  },
  storm: {
    hemi: 0.3,
    sky: "#1B2440",
    ground: "#05070C",
    cabin: 0.45,
    cabinColor: "#C8D4FF",
    alarm: 0,
    alarmHz: 1,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 0,
    panel: 0.35,
    ext: 0.9,
    extColor: "#8C9BC0",
  },
  dawn: {
    hemi: 0.6,
    sky: "#FFD9B0",
    ground: "#3A3A4A",
    cabin: 0.3,
    cabinColor: "#FFD8A8",
    alarm: 0,
    alarmHz: 1,
    amber: 0,
    moon: 0,
    fire: 0,
    sun: 1.2,
    panel: 0.2,
    ext: 1.3,
    extColor: "#FFC48A",
  },
};

const DEFAULT_RATE = 4; // damp rate: ~1 s to settle

/** One damping step toward `to` with factor `k` (allocation-free; no per-frame closure). */
function lerpK(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}
/** Each rig's colors, parsed once (no Color.set(string) inside useFrame). */
const RIG_COLORS: Record<RigName, { sky: Color; ground: Color; cabin: Color; ext: Color }> = {
  night_alarm: rigColors(RIGS.night_alarm),
  night_calm: rigColors(RIGS.night_calm),
  fire: rigColors(RIGS.fire),
  storm: rigColors(RIGS.storm),
  dawn: rigColors(RIGS.dawn),
};

function rigColors(p: RigParams) {
  return {
    sky: new Color(p.sky),
    ground: new Color(p.ground),
    cabin: new Color(p.cabinColor),
    ext: new Color(p.extColor),
  };
}

/** A rig a timeline asked for (`setRig`), until the next world arrives. */
const override: { name: RigName | null; rate: number } = { name: null, rate: DEFAULT_RATE };

const clearOverride = (_w: World) => {
  override.name = null;
  override.rate = DEFAULT_RATE;
};

export function LightRig() {
  const hemi = useRef<HemisphereLight>(null);
  const cabin = useRef<PointLight>(null);
  const alarm = useRef<PointLight>(null);
  const amber = useRef<PointLight>(null);
  const moon = useRef<DirectionalLight>(null);
  const fire = useRef<PointLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const panel = useRef<DirectionalLight>(null);
  const glow = useRef<PointLight>(null);
  const lightning = useRef<DirectionalLight>(null);
  const ext = useRef<DirectionalLight>(null);
  const alarmPeak = useRef(0);

  useLayoutEffect(() => {
    const l = lightning.current;
    if (!l) return;
    return registerRef("lightRig", {
      lightning: l,
      setRig(name, seconds) {
        override.name = name;
        override.rate = seconds > 0 ? 4 / seconds : 1000;
      },
    });
  }, []);
  useWorldSync(clearOverride, 1);

  useFrame(({ camera, clock }, dt) => {
    const world = currentWorld();
    const rigName = override.name ?? world.light_rig;
    const p = RIGS[rigName];
    const c = RIG_COLORS[rigName];
    const rate = worldSync.instant ? 1000 : override.name ? override.rate : DEFAULT_RATE;
    const k = dampK(rate, dt);
    const t = clock.elapsedTime;
    if (hemi.current) {
      hemi.current.intensity = lerpK(hemi.current.intensity, p.hemi, k);
      hemi.current.color.lerp(c.sky, k);
      hemi.current.groundColor.lerp(c.ground, k);
    }
    if (cabin.current) {
      cabin.current.intensity = lerpK(cabin.current.intensity, p.cabin, k);
      cabin.current.color.lerp(c.cabin, k);
    }
    alarmPeak.current = lerpK(alarmPeak.current, p.alarm, k);
    if (alarm.current) {
      // A soft-edged pulse (more "on" than off) rather than a pure sine: reads as an alarm.
      const s = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * p.alarmHz);
      alarm.current.intensity = alarmPeak.current * s * s;
    }
    if (amber.current) amber.current.intensity = lerpK(amber.current.intensity, p.amber, k);
    if (moon.current) moon.current.intensity = lerpK(moon.current.intensity, p.moon, k);
    if (sun.current) {
      sun.current.intensity = lerpK(sun.current.intensity, p.sun, k);
      // The sunrise sits behind the plane on the exterior set (see Sky), ahead in the cockpit.
      sun.current.position.z = stageOf(camera.position) === "exterior" ? 1 : -1;
    }
    if (panel.current) panel.current.intensity = lerpK(panel.current.intensity, p.panel, k);
    if (glow.current) glow.current.intensity = lerpK(glow.current.intensity, p.panel * 1.3, k);
    if (ext.current) {
      // Snaps with the cut between stages; cross-fades between rigs like the others.
      ext.current.intensity = stageOf(camera.position) === "exterior" ? p.ext : 0;
      ext.current.color.lerp(c.ext, k);
    }
    if (fire.current) {
      // The window on the burning side: the world's, or whichever side a timeline set alight.
      const side =
        FIRE.left.flames > FIRE.right.flames
          ? -1
          : FIRE.right.flames > FIRE.left.flames
            ? 1
            : world.fire.side === "left"
              ? -1
              : 1;
      // Inside the wall's thickness (behind its inner face), so it rims the cabin through the
      // window instead of blowing out the wall it would otherwise sit 12 cm from.
      fire.current.position.x = 1.21 * side;
      const flames = Math.max(FIRE.left.flames, FIRE.right.flames);
      const flicker =
        p.fire > 0
          ? (p.fire + 0.5 * Math.sin(t * 13) * Math.sin(t * 7.3)) *
            (0.35 + 0.65 * Math.min(1, flames))
          : 0;
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
        position={[0, 1.75, 0.45]}
        distance={4}
        decay={1}
      />
      <pointLight
        ref={alarm}
        color="#FF3B3B"
        intensity={0}
        position={[0, 1.45, -0.55]}
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
        position={[1.21, 1.35, -0.1]}
        distance={6}
        decay={1}
      />
      <directionalLight ref={sun} color="#FFB36B" intensity={0} position={[0, 0.3, -1]} />
      {/* Instrument glow: a soft cool fill off the panels onto the faces in the seats. */}
      <pointLight
        ref={glow}
        color="#A8D8FF"
        intensity={0.4}
        position={[0, 1.12, -0.7]}
        distance={2.2}
        decay={1}
      />
      {/* Panel key: from behind the Flyer's shoulder onto the instrument faces. */}
      <directionalLight ref={panel} color="#FFE8CC" intensity={0.3} position={[0.6, 1.4, 1.2]} />
      {/* Exterior key from high camera-right, rimming the toy plane against the sky. */}
      <directionalLight ref={ext} color="#9FB4FF" intensity={0} position={[3, 4, 4]} />
      <directionalLight ref={lightning} color="#DFE8FF" intensity={0} position={[2, 4, -3]} />
    </>
  );
}
