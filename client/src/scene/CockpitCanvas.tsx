import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ACESFilmicToneMapping } from "three";
import { cutNow, moveTo, rig, STATION_SHOT } from "../cinematics/cameraRig";
import { DEV } from "../config";
import { useStore } from "../state/store";
import { CameraRigDriver } from "./CameraRigDriver";
import { FirstPersonHands } from "./characters/FirstPersonHands";
import { FlyerAvatar } from "./characters/FlyerAvatar";
import { Pilot } from "./characters/Pilot";
import { Cockpit } from "./Cockpit";
import { Effects } from "./Effects";
import { Atmosphere } from "./env/Atmosphere";
import { Clouds } from "./env/Clouds";
import { ExteriorPlane } from "./env/ExteriorPlane";
import { Runway } from "./env/Runway";
import { Sky } from "./env/Sky";
import { Weather } from "./env/Weather";
import { WingFire } from "./env/WingFire";
import { Wings } from "./env/Wings";
import { LightRig } from "./LightRig";
import { FrontPanel } from "./stations/FrontPanel";
import { Overhead } from "./stations/Overhead";
import { Pedestal } from "./stations/Pedestal";

/**
 * Resting shot (§F10.1): the current station's shot, applied when PLAYING starts, after any
 * cinematic and on rejoin. A running timeline owns the camera.
 */
function useRestingShot() {
  const station = useStore((s) => s.flyer.station);
  const playing = useStore((s) => s.cinePlaying);
  const turbulence = useStore((s) => s.flyer.world?.turbulence ?? 0);
  const first = useRef(true);
  useEffect(() => {
    if (!playing) rig.restShake = turbulence;
  }, [playing, turbulence]);
  useEffect(() => {
    if (playing || !station) return;
    const shot = STATION_SHOT[station];
    if (first.current) {
      first.current = false;
      cutNow(shot);
      return;
    }
    const tween = moveTo(shot, 0.8);
    return () => {
      tween.kill();
    };
  }, [station, playing]);
}

// The Flyer's 3D canvas (§F9.1). Every slot is mounted; the env/, characters/ and Effects
// components are filled in by their own work (M3a) without touching this file.
export function CockpitCanvas() {
  const orbit = DEV && new URLSearchParams(location.search).get("orbit") === "1";
  useRestingShot();
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 0.03, far: 3000, position: [0.5, 1.3, 0.35] }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
      }}
    >
      {orbit ? <OrbitControls target={[0.1, 1.2, -0.6]} makeDefault /> : <CameraRigDriver />}
      <Atmosphere />
      <LightRig />
      <Sky />
      <Clouds />
      <Weather />
      <Cockpit />
      <Wings />
      <WingFire />
      <Pilot />
      <FlyerAvatar />
      <FirstPersonHands />
      <Overhead />
      <Pedestal />
      <FrontPanel />
      <Runway />
      <ExteriorPlane />
      <Effects />
    </Canvas>
  );
}
