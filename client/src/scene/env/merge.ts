// Static-geometry merging (§F21: < 250 draw calls). Every rigid piece of the shell, the wings and
// the characters is built from primitives with per-part colors baked into vertex colors, then
// merged into one BufferGeometry, so a whole rigid segment (a forearm, a head, the cabin walls)
// costs one draw call. Materials use `vertexColors` with a white base color.
import { useEffect } from "react";
import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = readonly [number, number, number];

export interface PartSpec {
  geo: BufferGeometry;
  color: string;
  at?: V3;
  rot?: V3;
  scale?: V3 | number;
  /** Extra parent transform (applied after the part's own). */
  parent?: Matrix4;
}

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3();
const c = new Color();

/** A parent transform for a group of parts (position + Euler rotation). */
export function frame(at: V3, rot: V3 = [0, 0, 0]): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(...rot)),
    new Vector3(1, 1, 1),
  );
}

/** Bake each part's transform + color and merge them all into one geometry. Disposes the inputs. */
export function mergeParts(parts: readonly PartSpec[]): BufferGeometry {
  const baked: BufferGeometry[] = [];
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    part.geo.dispose();
    const sc = part.scale ?? 1;
    s.set(...(typeof sc === "number" ? ([sc, sc, sc] as const) : sc));
    p.set(...(part.at ?? [0, 0, 0]));
    q.setFromEuler(e.set(...(part.rot ?? [0, 0, 0])));
    m.compose(p, q, s);
    if (part.parent) m.premultiply(part.parent);
    g.applyMatrix4(m);
    c.set(part.color);
    const n = g.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
    }
    baked.push(g);
  }
  const merged = mergeGeometries(baked, false);
  for (const g of baked) g.dispose();
  return merged;
}

/** Dispose a memoized geometry when it is replaced or the component unmounts. */
export function useDisposeGeometry(geo: BufferGeometry): void {
  useEffect(() => () => geo.dispose(), [geo]);
}
