import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  type Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  type MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Blending,
} from "three";
import type { Side, World } from "../../net/protocol";
import { registerRef } from "../sceneRefs";
import { BURSTS, FIRE, fireLevel, WING } from "./drivers";
import { stageOf, useWorldSync, type SyncTweens } from "./worldSync";

// Wing fire (§F9.7): 120 additive flame sprites (#FFD166 → #FF7A1A, life 0.6 s, rising and
// drifting back), 60 grey smoke sprites (#6B6F7A, opacity 0.5, life 2.5 s, trailing +Z), white
// foam (80 sprites, 0.8 s) / snuff (40, 0.5 s) bursts, and the p2_intro fireball. Particles are a
// pure function of time and index (no per-particle state), so seeking a timeline is exact.

const FIRE_N = 120;
const SMOKE_N = 60;
const BURST_N = 80;
const FIRE_LIFE = 0.6;
const SMOKE_LIFE = 2.5;

// #FFD166 → #FF7A1A per §F9.7, pushed a little deeper so overlapping additive sprites stay
// orange instead of summing to cream.
const FLAME_HOT = new Color("#FFC14D");
const FLAME_COOL = new Color("#FF6A12");
// §F9.7 smoke #6B6F7A, lifted slightly so a wisp still reads against the night sky.
const SMOKE = new Color("#8A8F9C");
const scratch = new Color();

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aSize;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a);
}`;

interface Sprites {
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
}

function makeSprites(n: number, blending: Blending): Sprites {
  const geometry = new InstancedBufferGeometry();
  const plane = new PlaneGeometry(1, 1);
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  geometry.setAttribute("uv", plane.getAttribute("uv"));
  geometry.setAttribute("aOffset", new InstancedBufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute("aSize", new InstancedBufferAttribute(new Float32Array(n), 1));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(new Float32Array(n * 4), 4));
  geometry.instanceCount = 0;
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending,
  });
  return { geometry, material };
}

/** Per-frame writer for one sprite batch (reached through the mesh ref, never the memo). */
class SpriteBatch {
  private g: InstancedBufferGeometry | null = null;
  n = 0;

  begin(mesh: Mesh | null): boolean {
    const g = mesh?.geometry;
    this.g = g instanceof InstancedBufferGeometry ? g : null;
    this.n = 0;
    return this.g !== null;
  }

  push(
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    gr: number,
    b: number,
    a: number,
  ): void {
    const g = this.g;
    if (!g) return;
    g.getAttribute("aOffset").setXYZ(this.n, x, y, z);
    g.getAttribute("aSize").setX(this.n, size);
    g.getAttribute("aColor").setXYZW(this.n, r, gr, b, a);
    this.n += 1;
  }

  end(mesh: Mesh | null): void {
    const g = this.g;
    if (!g || !mesh) return;
    g.instanceCount = this.n;
    // No draw call at all while a batch is empty (an instanced draw of 0 still costs one).
    mesh.visible = this.n > 0;
    g.getAttribute("aOffset").needsUpdate = true;
    g.getAttribute("aSize").needsUpdate = true;
    g.getAttribute("aColor").needsUpdate = true;
  }
}

function dispose(s: Sprites): void {
  s.geometry.dispose();
  s.material.dispose();
}

/** Deterministic 0..1 hash. */
function hash(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const applyFire = (w: World, tw: SyncTweens) => {
  for (const side of ["left", "right"] as const) {
    const lv = fireLevel(w.fire.side === side ? w.fire.level : "none");
    // The fireball is a cinematic one-shot: never left visible by a sync.
    tw.to(
      FIRE[side],
      {
        flames: lv.flames,
        size: lv.size,
        smoke: lv.smoke,
        flicker: lv.flicker,
        boom: 0,
        foam: 0,
        snuff: 0,
      },
      1,
    );
  }
};

interface EmitterProps {
  side: Side;
  /** Particle scale (the exterior plane is a bit bigger than the cockpit wing). */
  scale?: number;
  /** Smoke trail length in meters (how far it drifts back over its life). */
  trail?: number;
  /** Only render while the camera is on this stage (undefined = parent decides). */
  stage?: "cockpit" | "exterior";
}

/** One burning nacelle's particles; the cockpit wing and the exterior plane each mount one per side. */
export function FireEmitter({ side, scale = 1, trail = 5, stage }: EmitterProps) {
  const group = useRef<Group>(null);
  const fireball = useRef<Mesh>(null);
  const fireballMat = useRef<MeshBasicMaterial>(null);
  const flamesMesh = useRef<Mesh>(null);
  const smokeMesh = useRef<Mesh>(null);
  const burstMesh = useRef<Mesh>(null);
  const flames = useMemo(() => makeSprites(FIRE_N, AdditiveBlending), []);
  const smoke = useMemo(() => makeSprites(SMOKE_N, NormalBlending), []);
  const burst = useMemo(() => makeSprites(BURST_N, NormalBlending), []);
  const writer = useRef(new SpriteBatch());
  const seen = useRef(BURSTS[side].seq);
  const burstStart = useRef(-10);
  // `flicker` level: the flames gate on / off at random 0.4–0.9 s intervals (§F9.7).
  const flick = useRef({ on: true, next: 0, n: 0 });
  useLayoutEffect(
    () => () => {
      dispose(flames);
      dispose(smoke);
      dispose(burst);
    },
    [flames, smoke, burst],
  );

  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    if (stage) g.visible = stageOf(camera.position) === stage;
    if (!g.visible) return;
    const f = FIRE[side];
    const t = clock.elapsedTime;
    const sz = scale * Math.max(0.05, f.size);
    const w = writer.current;

    // Flames
    let gate = 1;
    if (f.flicker > 0.5) {
      const fl = flick.current;
      if (t >= fl.next || fl.next - t > 1) {
        fl.n += 1;
        fl.on = !fl.on;
        fl.next = t + 0.4 + 0.5 * hash(fl.n, side === "left" ? 3 : 5);
      }
      gate = fl.on ? 1 : 0;
    }
    const nFire = Math.round(FIRE_N * Math.min(1, Math.max(0, f.flames)) * gate);
    if (w.begin(flamesMesh.current)) {
      for (let i = 0; i < nFire; i++) {
        const age = (t / FIRE_LIFE + hash(i, 1)) % 1;
        const spread = (1 - age * 0.5) * 0.42 * sz;
        scratch
          .copy(FLAME_HOT)
          .lerp(FLAME_COOL, Math.min(1, age * 1.8))
          // Cooling tails darken instead of lingering as a dim (mauve-looking) glow on the sky.
          .multiplyScalar(1.25 * (1 - 0.6 * age));
        w.push(
          (hash(i, 2) - 0.5) * spread * 2,
          age * 0.95 * sz + hash(i, 4) * 0.08 * sz,
          age * 0.9 * sz + (hash(i, 3) - 0.5) * spread,
          sz * (0.1 + 0.22 * Math.sin(Math.PI * Math.min(1, age * 1.4))),
          scratch.r,
          scratch.g,
          scratch.b,
          Math.pow(1 - age, 2.2) * 0.42,
        );
      }
      w.end(flamesMesh.current);
    }

    // Smoke
    // A wisp keeps a floor of 26 puffs and a little more opacity so it still reads as smoke.
    const amt = Math.min(1, Math.max(0, f.smoke));
    const nSmoke = amt > 0.005 ? Math.max(Math.round(SMOKE_N * amt), 26) : 0;
    const smokeAlpha = 0.55 * (amt < 0.5 ? 2.1 : 1) * Math.min(1, amt * 20);
    if (w.begin(smokeMesh.current)) {
      for (let i = 0; i < nSmoke; i++) {
        const age = (t / SMOKE_LIFE + hash(i, 6)) % 1;
        const shade = 0.75 + hash(i, 8) * 0.35;
        w.push(
          (hash(i, 7) - 0.5) * (0.2 + age * 1.2) * scale,
          (0.08 + age * 1.3) * scale,
          (0.2 + age * trail) * scale * 0.4 + age * trail * 0.6,
          (0.3 + age * 1.5) * scale * (0.6 + 0.4 * f.size),
          SMOKE.r * shade,
          SMOKE.g * shade,
          SMOKE.b * shade,
          // Visible from the nacelle up (quick fade-in), thinning out as it trails away.
          smokeAlpha * Math.min(1, age * 8) * Math.pow(1 - age, 0.8),
        );
      }
      w.end(smokeMesh.current);
    }

    // Bursts: a timeline's seek-safe progress (fire.foam / fire.snuff) or a live fx one-shot.
    const b = BURSTS[side];
    if (b.seq !== seen.current) {
      seen.current = b.seq;
      burstStart.current = t;
    }
    let kind: "foam" | "snuff" = b.kind;
    let p = (t - burstStart.current) / (b.kind === "foam" ? 0.8 : 0.5);
    if (f.foam > 0 && f.foam < 1) {
      kind = "foam";
      p = f.foam;
    } else if (f.snuff > 0 && f.snuff < 1) {
      kind = "snuff";
      p = f.snuff;
    }
    const nBurstMax = kind === "foam" ? BURST_N : 40;
    if (w.begin(burstMesh.current)) {
      if (p >= 0 && p < 1) {
        const ease = 1 - Math.pow(1 - p, 3);
        for (let i = 0; i < nBurstMax; i++) {
          const u = hash(i, 11) * 2 - 1;
          const a = hash(i, 12) * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          const reach = (0.5 + hash(i, 13) * 0.9) * ease * scale * (kind === "foam" ? 1.4 : 0.9);
          w.push(
            Math.cos(a) * r * reach,
            0.3 * scale + Math.abs(u) * reach * 0.8,
            Math.sin(a) * r * reach + p * 0.6 * scale,
            (0.3 + 0.7 * ease) * scale,
            1.25,
            1.25,
            1.3,
            0.85 * (1 - p),
          );
        }
      }
      w.end(burstMesh.current);
    }

    // Fireball: sphere 0 → 2.5 m, emissive, fading.
    if (fireball.current && fireballMat.current) {
      const k = f.boom;
      fireball.current.visible = k > 0.001 && k < 0.999;
      fireball.current.scale.setScalar(Math.max(0.001, k * 2.5 * scale));
      fireballMat.current.opacity = Math.pow(1 - k, 1.5);
    }
  });

  return (
    <group ref={group} name={`fire-${side}`}>
      <mesh
        ref={smokeMesh}
        geometry={smoke.geometry}
        material={smoke.material}
        frustumCulled={false}
        renderOrder={3}
        visible={false}
      />
      <mesh
        ref={flamesMesh}
        geometry={flames.geometry}
        material={flames.material}
        frustumCulled={false}
        renderOrder={2}
        visible={false}
      />
      <mesh
        ref={burstMesh}
        geometry={burst.geometry}
        material={burst.material}
        frustumCulled={false}
        renderOrder={4}
        visible={false}
      />
      <mesh ref={fireball} visible={false} renderOrder={5}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial
          ref={fireballMat}
          color={[3, 1.3, 0.35]}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}

/** The cockpit-wing emitters + the `wingFireLeft/Right` handles (the exterior plane mounts its own). */
export function WingFire() {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  useLayoutEffect(() => {
    const l = left.current;
    const r = right.current;
    if (!l || !r) return;
    const handle = (side: Side, group: Group) => ({
      group,
      fire: FIRE[side],
      burst(kind: "foam" | "snuff") {
        BURSTS[side].kind = kind;
        BURSTS[side].seq += 1;
      },
    });
    const offL = registerRef("wingFireLeft", handle("left", l));
    const offR = registerRef("wingFireRight", handle("right", r));
    return () => {
      offL();
      offR();
    };
  }, []);
  useWorldSync(applyFire, 1);
  // On top of the nacelle, behind the propeller (cockpit space, §F9.7 Wings).
  const y = WING.y + 0.12;
  const z = WING.nacelleZ + 0.15;
  return (
    <>
      <group ref={left} position={[-WING.nacelleX, y, z]}>
        <FireEmitter side="left" stage="cockpit" trail={6} />
      </group>
      <group ref={right} position={[WING.nacelleX, y, z]}>
        <FireEmitter side="right" stage="cockpit" trail={6} />
      </group>
    </>
  );
}
