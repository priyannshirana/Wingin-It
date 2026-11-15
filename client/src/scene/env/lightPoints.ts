// Emissive "light points" (runway edge / approach lights, nav lights): round soft points sized in
// world meters but never smaller than `minPx` pixels, so a 0.4 m light 600 m away still reads.
// Not fogged (bright lights punch through fog) and above the bloom threshold.
import { AdditiveBlending, type Camera, Color, ShaderMaterial } from "three";

const VERT = /* glsl */ `
uniform float worldSize;
uniform float minPx;
uniform float pxPerUnit;
attribute float aBright;
varying float vBright;
void main() {
  vBright = aBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(minPx, worldSize * pxPerUnit / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 color;
uniform float opacity;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, d);
  gl_FragColor = vec4(color * vBright, a * opacity);
}`;

export function makeLightPointsMaterial(
  hex: string,
  brightness: number,
  worldSize: number,
  minPx: number,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      color: { value: new Color(hex).multiplyScalar(brightness) },
      opacity: { value: 1 },
      worldSize: { value: worldSize },
      minPx: { value: minPx },
      // Set per frame from the viewport: pixels per world unit at 1 m.
      pxPerUnit: { value: 900 },
    },
  });
}

/** Device pixels per world unit at 1 m for a perspective camera (the shader's pxPerUnit). */
export function pxPerUnit(heightPx: number, camera: Camera): number {
  const fov = "fov" in camera && typeof camera.fov === "number" ? camera.fov : 55;
  return heightPx / (2 * Math.tan((fov * Math.PI) / 360));
}
