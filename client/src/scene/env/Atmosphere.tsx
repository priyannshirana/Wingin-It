import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, type FogExp2 } from "three";
import type { Weather } from "../../net/protocol";
import { WEATHER } from "./drivers";
import { currentWorld, dampK, worldSync } from "./worldSync";

// Fog color per weather (§F0.2): night #1a2140, storm a cold slate, dawn a warm peach haze.
const FOG_COLOR: Record<Weather, string> = {
  clouds_night: "#1a2140",
  rain: "#1a212c",
  storm: "#161c26",
  rain_light: "#252d3a",
  clear_dawn: "#e8b48c",
};

/** Parsed once (no Color.set(string) inside useFrame). */
const FOG: Record<Weather, Color> = {
  clouds_night: new Color(FOG_COLOR.clouds_night),
  rain: new Color(FOG_COLOR.rain),
  storm: new Color(FOG_COLOR.storm),
  rain_light: new Color(FOG_COLOR.rain_light),
  clear_dawn: new Color(FOG_COLOR.clear_dawn),
};

/**
 * Scene fog (§F9.7): FogExp2 density = `WEATHER.fog` (synced to `world.fog` over 2 s by Weather,
 * tweened by timelines, e.g. the p3_runway_reveal thinning). The sky dome covers the background.
 */
export function Atmosphere() {
  const fog = useRef<FogExp2>(null);
  useFrame((_, dt) => {
    const f = fog.current;
    if (!f) return;
    f.density = WEATHER.fog;
    const target = FOG[currentWorld().weather];
    if (worldSync.instant) f.color.copy(target);
    else f.color.lerp(target, dampK(1.5, dt));
  });
  return (
    <>
      <color attach="background" args={["#0B1026"]} />
      <fogExp2 ref={fog} attach="fog" args={["#1a2140", 0.004]} />
    </>
  );
}
