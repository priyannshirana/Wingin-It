import { Object3D, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SHOTS, STATION_SHOT } from "../src/cinematics/cameraRig";
import { controlLocalPosition, getStation, STATION_FACES } from "../src/content/stations";
import type { StationId } from "../src/net/protocol";
import { fovForAspect } from "../src/scene/cameraFov";

const STATIONS: StationId[] = ["overhead", "pedestal", "front"];
const ASPECTS: [string, number][] = [
  ["720x868 (split iframe)", 720 / 868],
  ["1280x720", 1280 / 720],
  ["1440x900", 1440 / 900],
];

/** Screen NDC of every control of a station seen from its resting shot (StationGroup placement). */
function projectControls(id: StationId, aspect: number): Map<string, Vector3> {
  const shot = SHOTS[STATION_SHOT[id]];
  const cam = new PerspectiveCamera(fovForAspect(aspect), aspect, 0.03, 3000);
  cam.position.set(...shot.position);
  cam.lookAt(...shot.target);
  cam.updateMatrixWorld(true);
  const face = STATION_FACES[id];
  const group = new Object3D();
  group.position.set(...face.center);
  group.lookAt(...face.target);
  group.updateMatrixWorld(true);
  const station = getStation(id);
  const out = new Map<string, Vector3>();
  for (const c of station.controls) {
    const p = controlLocalPosition(station, c);
    out.set(c.id, new Vector3(p.x, p.y, p.z).applyMatrix4(group.matrixWorld).project(cam));
  }
  return out;
}

describe("station shots keep every control in frame", () => {
  for (const id of STATIONS) {
    for (const [label, aspect] of ASPECTS) {
      it(`${id} at ${label}`, () => {
        for (const [cid, ndc] of projectControls(id, aspect)) {
          expect(Math.abs(ndc.x), `${cid} x`).toBeLessThanOrEqual(1);
          expect(Math.abs(ndc.y), `${cid} y`).toBeLessThanOrEqual(1);
          expect(ndc.z, `${cid} depth`).toBeLessThan(1);
        }
      });
    }
  }

  it("leaves the FOV at 55 degrees from aspect 1.6 up", () => {
    expect(fovForAspect(1.6)).toBe(55);
    expect(fovForAspect(1280 / 720)).toBe(55);
    expect(fovForAspect(720 / 868)).toBeGreaterThan(55);
  });
});
