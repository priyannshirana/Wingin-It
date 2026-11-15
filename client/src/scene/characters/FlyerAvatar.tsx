import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  type Group,
  type Mesh,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { Gender } from "../../net/protocol";
import { selectGenderOf } from "../../state/selectors";
import { useStore } from "../../state/store";
import { mergeParts, type PartSpec, useDisposeGeometry } from "../env/merge";
import { stageOf, useWorldSync, type SyncTweens } from "../env/worldSync";
import { DEG } from "../parts/kit";
import { registerRef, type AvatarPose } from "../sceneRefs";
import { DENIM, HAIR, INK, isFirstPerson, OUTFIT, OUTFIT_TRIM, SKIN_FLYER } from "./firstPerson";
import { ToyArm, ToyLegs } from "./ToyBody";

// The Flyer's character in the right seat (§F9.8): the captain's toy proportions (capsule body
// r 0.17 × 0.42, head r 0.135), a seat belt across the chest. Male: tousled dark-brown hair, teal
// hoodie with a lighter hood rim, round glasses. Female: dark hair with a high ponytail on a
// spring, coral bomber with cream cuffs, small round earrings. Poses: idle, panic, brace, cheer.
// Hidden in first-person shots so the camera never sees inside the head.

const R = 0.55;
const SEAT = { x: 0.5, y: 0.56, z: 0.3 };
const BELT = "#22252E";
const GOLD = "#F5C518";
const BLUSH = "#E9967A";

/** The cockpit avatar's pose (timelines tween it through `getRef("flyerAvatar")`). */
const POSE: AvatarPose = { panic: 0, brace: 0, cheer: 0, turn: 0 };

const toIdle = (_w: unknown, tw: SyncTweens) =>
  tw.to(POSE, { panic: 0, brace: 0, cheer: 0, turn: 0 });

function noop(): void {}

/** Torso trim (hood rim + pocket, or bomber collar + zip + hem) and the seat belt. */
function torsoParts(gender: Gender): PartSpec[] {
  const trim = OUTFIT_TRIM[gender];
  const outfit: PartSpec[] =
    gender === "male"
      ? [
          {
            geo: new TorusGeometry(0.12, 0.04, 10, 24),
            color: trim,
            at: [0, 0.53, 0.05],
            rot: [Math.PI / 2 + 0.35, 0, 0],
          },
          {
            geo: new BoxGeometry(0.18, 0.09, 0.02),
            color: trim,
            at: [0, 0.05, -0.16],
            rot: [0.08, 0, 0],
          },
        ]
      : [
          {
            geo: new TorusGeometry(0.11, 0.022, 10, 24),
            color: trim,
            at: [0, 0.52, 0],
            rot: [Math.PI / 2 + 0.2, 0, 0],
          },
          { geo: new BoxGeometry(0.012, 0.42, 0.01), color: trim, at: [0, 0.2, -0.168] },
          { geo: new CylinderGeometry(0.172, 0.172, 0.05, 20), color: trim, at: [0, -0.12, 0.02] },
        ];
  return [
    ...outfit,
    // seat belt: a flat dark strap across the chest
    {
      geo: new BoxGeometry(0.05, 0.5, 0.012),
      color: BELT,
      at: [0.02, 0.24, -0.165],
      rot: [0.05, 0, 36 * DEG],
    },
  ];
}

/** Head, face, hair and glasses / earrings (the head group's local frame). */
function headParts(gender: Gender): PartSpec[] {
  const face: PartSpec[] = [
    { geo: new SphereGeometry(0.135, 24, 18), color: SKIN_FLYER, at: [0, 0.12, 0] },
    { geo: new SphereGeometry(0.016, 10, 8), color: INK, at: [-0.05, 0.135, -0.122] },
    { geo: new SphereGeometry(0.016, 10, 8), color: INK, at: [0.05, 0.135, -0.122] },
    {
      geo: new SphereGeometry(0.02, 10, 8),
      color: BLUSH,
      at: [-0.075, 0.085, -0.104],
      scale: [1, 0.7, 0.4],
    },
    {
      geo: new SphereGeometry(0.02, 10, 8),
      color: BLUSH,
      at: [0.075, 0.085, -0.104],
      scale: [1, 0.7, 0.4],
    },
    {
      geo: new TorusGeometry(0.028, 0.006, 6, 16, Math.PI),
      color: INK,
      at: [0, 0.075, -0.124],
      rot: [0, 0, Math.PI],
    },
  ];
  if (gender === "male") {
    const tufts: [number, number, number, number][] = [
      [0, 0.235, 0.0, 0.1],
      [-0.07, 0.215, -0.035, 0.075],
      [0.075, 0.22, -0.03, 0.078],
      [-0.02, 0.215, 0.07, 0.09],
      [0.05, 0.245, -0.06, 0.06],
    ];
    return [
      ...face,
      {
        geo: new SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        color: HAIR.male,
        at: [0, 0.15, 0.02],
        scale: [1.02, 0.85, 1.02],
      },
      ...tufts.map(([x, y, z, r]): PartSpec => ({
        geo: new SphereGeometry(r, 14, 10),
        color: HAIR.male,
        at: [x, y, z],
        scale: [1, 0.55, 1],
      })),
      // round glasses: two rings + a bridge
      { geo: new TorusGeometry(0.036, 0.0075, 8, 24), color: INK, at: [-0.05, 0.135, -0.128] },
      { geo: new TorusGeometry(0.036, 0.0075, 8, 24), color: INK, at: [0.05, 0.135, -0.128] },
      { geo: new BoxGeometry(0.03, 0.007, 0.007), color: INK, at: [0, 0.135, -0.128] },
    ];
  }
  return [
    ...face,
    // hair cap tipped back so the face stays open; it hangs lower at the back
    {
      geo: new SphereGeometry(0.142, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      color: HAIR.female,
      at: [0, 0.13, 0.012],
      rot: [0.55, 0, 0],
      scale: [1.05, 1, 1.05],
    },
    // side-swept fringe above the brows
    {
      geo: new SphereGeometry(0.07, 14, 10),
      color: HAIR.female,
      at: [-0.045, 0.225, -0.1],
      rot: [0.6, 0, 0.45],
      scale: [1, 0.4, 0.55],
    },
    // small round earrings
    { geo: new SphereGeometry(0.013, 10, 8), color: GOLD, at: [-0.138, 0.06, 0] },
    { geo: new SphereGeometry(0.013, 10, 8), color: GOLD, at: [0.138, 0.06, 0] },
  ];
}

function ponyParts(): PartSpec[] {
  return [
    { geo: new TorusGeometry(0.028, 0.012, 8, 16), color: OUTFIT.female },
    {
      geo: new CapsuleGeometry(0.045, 0.14, 6, 12),
      color: HAIR.female,
      at: [0, -0.02, 0.1],
      rot: [1.2, 0, 0],
    },
  ];
}

/** One arm's pose from the pose weights (+X swings forward; +X at the elbow bends it up). */
function poseArm(
  sh: Group | null,
  el: Group | null,
  side: -1 | 1,
  rest: number,
  wave: number,
  t: number,
): void {
  const { panic, brace, cheer } = POSE;
  const idle = Math.max(0, rest - wave);
  if (sh) {
    sh.rotation.x = 0.55 * idle + 2.45 * panic + 0.35 * brace + 2.9 * cheer + 2.7 * wave;
    sh.rotation.z = side * (0.1 + 0.62 * panic + 0.55 * brace + 0.4 * cheer + 0.35 * wave);
  }
  if (el) {
    el.rotation.x =
      1.0 * idle +
      2.1 * panic +
      0.3 * brace +
      0.15 * cheer +
      (0.6 + Math.sin(t * 12) * 0.45) * wave;
  }
}

interface Props {
  /** Defaults to the Flyer player's gender from `room_state`. */
  gender?: Gender;
  /** Lobby preview: no world sync, no first-person hiding; waves when the gender changes. */
  preview?: boolean;
}

export function FlyerAvatar({ gender: genderProp, preview = false }: Props) {
  const storeGender = useStore((s) => selectGenderOf(s, "flyer"));
  // SPEC-ASSUMPTION: before room_state names the Flyer's character (sandbox only) show the female
  // one, matching the split view's default Flyer.
  const gender: Gender = genderProp ?? storeGender ?? "female";
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const chest = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const pony = useRef<Group>(null);
  const ponySpring = useRef({ angle: 0, vel: 0, lastYaw: 0 });
  const wave = useRef({ start: -10, gender });
  const shoulderL = useRef<Group>(null);
  const elbowL = useRef<Group>(null);
  const shoulderR = useRef<Group>(null);
  const elbowR = useRef<Group>(null);
  const torsoGeo = useMemo(() => mergeParts(torsoParts(gender)), [gender]);
  const headGeo = useMemo(() => mergeParts(headParts(gender)), [gender]);
  const ponyGeo = useMemo(() => mergeParts(ponyParts()), []);
  useDisposeGeometry(torsoGeo);
  useDisposeGeometry(headGeo);
  useDisposeGeometry(ponyGeo);

  useLayoutEffect(() => {
    const g = root.current;
    if (preview || !g) return;
    return registerRef("flyerAvatar", { group: g, pose: POSE });
  }, [preview]);
  useWorldSync(preview ? noop : toIdle, 1);

  useFrame(({ camera, clock }, dt) => {
    const g = root.current;
    if (!g) return;
    const t = clock.elapsedTime;
    if (!preview) {
      g.visible = stageOf(camera.position) === "cockpit" && !isFirstPerson(camera.position);
      if (!g.visible) return;
    }
    if (wave.current.gender !== gender) {
      wave.current.gender = gender;
      wave.current.start = t;
    }
    // Preview: one wave (~1.4 s) whenever the gender changes.
    const waving = preview ? Math.max(0, 1 - Math.abs((t - wave.current.start - 0.7) / 0.7)) : 0;
    const { panic, brace, cheer, turn } = POSE;
    const rest = Math.max(0, 1 - panic - brace - cheer);
    if (torso.current) {
      torso.current.position.y = cheer * Math.abs(Math.sin(t * 7)) * 0.035;
      torso.current.rotation.x = 8 * DEG * brace - 4 * DEG * panic;
      torso.current.rotation.y = 12 * DEG * turn;
    }
    if (chest.current) chest.current.scale.y = 1 + 0.012 * Math.sin(t * Math.PI * 2 * 0.25);
    let yaw = 0;
    if (head.current) {
      const idleLook = Math.max(0, 1 - panic - brace - cheer - turn) * 0.22 * Math.sin(t * 0.45);
      yaw = idleLook + turn * 0.75 + panic * 0.12 * Math.sin(t * 9);
      head.current.rotation.y = yaw;
      head.current.rotation.x = -10 * DEG * brace + 8 * DEG * cheer;
    }
    // Ponytail spring: swings against head turns and with the cheer bounce.
    if (pony.current) {
      const sp = ponySpring.current;
      const yawVel = dt > 0 ? (yaw - sp.lastYaw) / dt : 0;
      sp.lastYaw = yaw;
      const step = Math.min(dt, 1 / 30);
      sp.vel += (-40 * sp.angle - 5 * sp.vel - yawVel * 6 + cheer * Math.sin(t * 7) * 12) * step;
      sp.angle = Math.max(-0.6, Math.min(0.6, sp.angle + sp.vel * step));
      pony.current.rotation.z = sp.angle;
      pony.current.rotation.x = Math.sin(t * 1.3) * 0.05;
    }
    poseArm(shoulderL.current, elbowL.current, -1, rest, 0, t);
    poseArm(shoulderR.current, elbowR.current, 1, rest, waving, t);
  });

  return (
    <group
      ref={root}
      name="flyer-avatar"
      position={preview ? [0, 0, 0] : [SEAT.x, SEAT.y, SEAT.z + 0.02]}
    >
      <ToyLegs color={DENIM} floorY={-SEAT.y + 0.06} />
      <group ref={torso}>
        <mesh ref={chest} position={[0, 0.16, 0.02]}>
          <capsuleGeometry args={[0.17, 0.42, 8, 16]} />
          <meshStandardMaterial color={OUTFIT[gender]} roughness={R} />
        </mesh>
        <mesh geometry={torsoGeo}>
          <meshStandardMaterial vertexColors roughness={R} />
        </mesh>
        <ToyArm
          shoulderRef={shoulderL}
          elbowRef={elbowL}
          side={-1}
          sleeve={OUTFIT[gender]}
          cuff={gender === "female" ? OUTFIT_TRIM.female : undefined}
          hand={SKIN_FLYER}
          at={[-0.2, 0.43, 0.0]}
          radius={0.048}
          mitten
        />
        <ToyArm
          shoulderRef={shoulderR}
          elbowRef={elbowR}
          side={1}
          sleeve={OUTFIT[gender]}
          cuff={gender === "female" ? OUTFIT_TRIM.female : undefined}
          hand={SKIN_FLYER}
          at={[0.2, 0.43, 0.0]}
          radius={0.048}
          mitten
        />
        <group ref={head} position={[0, 0.58, 0]}>
          <mesh geometry={headGeo}>
            <meshStandardMaterial vertexColors roughness={R} />
          </mesh>
          {gender === "female" && (
            <group ref={pony} position={[0, 0.25, 0.08]}>
              <mesh geometry={ponyGeo}>
                <meshStandardMaterial vertexColors roughness={0.75} />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  );
}
