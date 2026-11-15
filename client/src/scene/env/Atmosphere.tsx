import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, type FogExp2 } from "three";
import type { Weather } from "../../net/protocol";
import { useStore } from "../../state/store";

// SPEC-ASSUMPTION: until the M3a Sky dome exists, the background is the sky's top color
// (§F9.7) so the windows read as night / storm / dawn.
const SKY_TOP: Record<Weather, string> = {
  clouds_night: "#0B1026",
  rain: "#0A0F1A",
  storm: "#0A0F1A",
  rain_light: "#0A0F1A",
  clear_dawn: "#FFB36B",
};

const bg = new Color();

/** Scene background + fogExp2 (density = world.fog, eased ~2 s). */
export function Atmosphere() {
  const fog = useRef<FogExp2>(null);
  useFrame(({ scene }, dt) => {
    const world = useStore.getState().flyer.world;
    if (fog.current && world) {
      fog.current.density += (world.fog - fog.current.density) * (1 - Math.exp(-dt / 2));
    }
    if (scene.background instanceof Color && world) {
      scene.background.lerp(bg.set(SKY_TOP[world.weather]), 1 - Math.exp(-dt));
    }
  });
  return (
    <>
      <color attach="background" args={["#0B1026"]} />
      <fogExp2 ref={fog} attach="fog" args={["#1a2140", 0.004]} />
    </>
  );
}
