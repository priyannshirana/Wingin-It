import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, Shape, ShapeGeometry, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { STATION_FACES } from "../content/stations";
import type { StationId } from "../net/protocol";
import { useStore } from "../state/store";
import { resetStationRim, rimFx } from "./rimFx";

const GREEN = new Color("#30A46C");
// SPEC-ASSUMPTION: the rim peaks at 1.6× the palette green (luminance ≈ 0.45) — it stays below the
// bloom threshold (1.0) by design: only lamps and fire bloom (§F0.1); the rim reads by its color.
const PEAK = 1.6;
/** The frame lies on the station's outer bezel (StationGroup: size + 0.1, i.e. 0.05 a side). */
const INSET = 0.034;
const WIDTH = 0.018;
const RADIUS = 0.03;

/** A rounded rectangle path (toy look: no sharp corners). */
function rectPath(shape: Shape, hw: number, hh: number, r: number): void {
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
}

/** A rectangular frame (one draw call). */
function frameGeometry(w: number, h: number): ShapeGeometry {
  const outer = new Shape();
  rectPath(outer, w / 2 + INSET + WIDTH, h / 2 + INSET + WIDTH, RADIUS + WIDTH);
  const hole = new Shape();
  rectPath(hole, w / 2 + INSET, h / 2 + INSET, RADIUS);
  outer.holes.push(hole);
  return new ShapeGeometry(outer, 6);
}

// The success rim (§F15) around the current station, placed exactly like StationGroup places the
// station (face center + lookAt), a few millimeters in front of the bezel. Hidden at rest.
export function StationRim() {
  const station = useStore((s) => s.flyer.station);
  return station ? <Rim station={station} /> : null;
}

function Rim({ station }: { station: StationId }) {
  const face = STATION_FACES[station];
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const geometry = useMemo(() => frameGeometry(face.size[0], face.size[1]), [face]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => resetStationRim, []);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(...face.center);
    g.lookAt(...face.target);
  }, [face]);

  useFrame(() => {
    const m = mesh.current;
    const material = mat.current;
    if (!m || !material) return;
    const v = rimFx.v;
    m.visible = v > 0.002;
    if (!m.visible) return;
    material.color.copy(GREEN).multiplyScalar(PEAK * v);
    material.opacity = v;
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={geometry} position={[0, 0, 0.012]} visible={false} renderOrder={3}>
        <meshBasicMaterial
          ref={mat}
          transparent
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
