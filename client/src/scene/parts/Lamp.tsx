import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Color, type MeshStandardMaterial } from "three";
import { PALETTE } from "../../content/stations";
import { serverNow } from "../../net/clock";
import { useStore } from "../../state/store";
import { registerLamp } from "../sceneRefs";
import { BEZEL, DEG, LAMP_OFF, ROUGHNESS, type PartProps } from "./kit";
import { Label } from "./Label";

const OFF = new Color(LAMP_OFF);
const scratch = new Color();

// Lamp (§F9.4): a dome on a bezel. Lit = palette color + emissive 2.5 (blooms); `blinking` = 1 Hz
// with the phase from serverNow() so both screens agree. `attention` is never rendered (§A6): the
// Flyer has to work out which lamp the Tower means by talking.
export function Lamp({ control }: PartProps) {
  const big = control.size === "big";
  const r = big ? 0.06 : 0.03;
  const state = useStore((s) => s.flyer.objects[control.id]);
  const lamp = state?.kind === "lamp" ? state : null;
  const dome = useRef<MeshStandardMaterial>(null);
  // Timeline override (flicker, the p1_outro green sweep): null = follow the server state.
  const override = useRef<{ intensity: number | null; color: string | null }>({
    intensity: null,
    color: null,
  });

  useLayoutEffect(
    () =>
      registerLamp(control.id, {
        setOverride(intensity, color) {
          override.current.intensity = intensity;
          override.current.color = intensity === null ? null : (color ?? null);
        },
      }),
    [control.id],
  );

  useFrame(() => {
    const now = serverNow();
    const lit = lamp?.color != null && (!lamp.blinking || Math.floor(now / 500) % 2 === 0);
    const m = dome.current;
    const o = override.current;
    if (m && o.intensity !== null) {
      scratch.set(o.color ?? (lamp?.color ? PALETTE[lamp.color] : "#ffffff"));
      m.color.copy(o.intensity > 0 ? scratch : OFF);
      m.emissive.copy(scratch);
      m.emissiveIntensity = o.intensity;
    } else if (m) {
      if (lit && lamp.color) {
        scratch.set(PALETTE[lamp.color]);
        m.color.copy(scratch);
        m.emissive.copy(scratch);
        m.emissiveIntensity = 2.5;
      } else {
        m.color.copy(OFF);
        m.emissiveIntensity = 0;
      }
    }
  });

  return (
    <group>
      <mesh position={[0, 0, 0.004]}>
        <torusGeometry args={[r, r * 0.18, 12, 32]} />
        <meshStandardMaterial color={BEZEL} roughness={ROUGHNESS} />
      </mesh>
      <mesh rotation={[90 * DEG, 0, 0]} position={[0, 0, 0.004]}>
        <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          ref={dome}
          color={LAMP_OFF}
          emissive={LAMP_OFF}
          roughness={0.35}
          toneMapped={false}
        />
      </mesh>
      <Label text={control.label} position={[0, -(r + 0.025), 0.002]} />
    </group>
  );
}
