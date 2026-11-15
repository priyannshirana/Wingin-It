import { RoundedBox } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";
import type { Group } from "three";
import { controlLocalPosition, getStation, STATION_FACES } from "../content/stations";
import type { StationId } from "../net/protocol";
import { PART_COMPONENTS } from "./parts/registry";

const SLATE = "#2B2F3A";
const EDGE = "#3D4352";

// One station (§F9.3): a group whose local XY plane is the panel face (+Z = the face normal),
// oriented with lookAt(faceTarget). Every control comes from the stations.json grid.
export function StationGroup({ station: id }: { station: StationId }) {
  const station = getStation(id);
  const face = STATION_FACES[id];
  const group = useRef<Group>(null);
  const [w, h] = face.size;

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(...face.center);
    g.lookAt(...face.target);
  }, [face]);

  return (
    <group ref={group} name={`station-${id}`}>
      <RoundedBox args={[w + 0.06, h + 0.06, 0.04]} radius={0.015} position={[0, 0, -0.02]}>
        <meshStandardMaterial color={SLATE} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[w + 0.1, h + 0.1, 0.03]} radius={0.015} position={[0, 0, -0.035]}>
        <meshStandardMaterial color={EDGE} roughness={0.55} />
      </RoundedBox>
      {station.controls.map((control) => {
        const Part = PART_COMPONENTS[control.type];
        const p = controlLocalPosition(station, control);
        return (
          <group key={control.id} name={control.id} position={[p.x, p.y, p.z]}>
            <Part control={control} />
          </group>
        );
      })}
    </group>
  );
}
