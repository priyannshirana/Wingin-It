import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  type Group,
  type Mesh,
  SphereGeometry,
} from "three";
import type { World } from "../../net/protocol";
import { mergeParts, useDisposeGeometry } from "../env/merge";
import { stageOf, useWorldSync, type SyncTweens } from "../env/worldSync";
import { DEG, FONT_URL } from "../parts/kit";
import { getRef, registerRef, type PilotPose } from "../sceneRefs";
import { INK, NAVY, SKIN_PILOT } from "./firstPerson";
import { ToyArm, ToyLegs } from "./ToyBody";

// The captain (§F9.8, NPC, not selectable): navy capsule body in the left seat, round head with a
// navy cap (black visor, gold badge) and a dark-brown mustache. Procedural animation: breathing,
// slumped onto the yoke (head 60°, torso 25°), a floating "Zzz" while out, the snore swell, the
// seat slide (the pilot rides the `pilotSeat` group) and, once he wakes after the landing, a
// look around with a "?" popping above him.

const R = 0.55;
const SEAT_X = -0.5;
const SEAT_Z = 0.3;
const SEAT_BACK = 0.4;
const CUSHION_Y = 0.56;
const BADGE = "#E8B84A";
const MUSTACHE = "#4A2E1F";

const POSE: PilotPose = {
  slump: 0,
  stretch: 0,
  awake: 1,
  look: 0,
  zzz: 0,
  zzzScale: 1,
  question: 0,
};

const applyPilot = (w: World, tw: SyncTweens) => {
  const { slumped, seat_back, awake } = w.pilot;
  // SPEC-ASSUMPTION: the "?" shows only when he is awake *after* being out (seat back, i.e. the
  // landing); in the lobby world he is simply awake and upright.
  const dazed = awake && seat_back && !slumped;
  tw.to(POSE, {
    slump: slumped ? 1 : 0,
    awake: awake ? 1 : 0,
    zzz: slumped ? 1 : 0,
    stretch: 0,
    zzzScale: 1,
  });
  tw.to(POSE, { question: dazed ? 1 : 0, ease: dazed ? "back.out(2)" : "power2.in" }, 0.5);
  const seat = getRef("pilotSeat");
  if (seat) tw.to(seat.position, { z: SEAT_Z + (seat_back ? SEAT_BACK : 0) }, 1);
};

/** troika Text exposes these as plain properties (no re-layout needed to change them). */
type FadingText = Mesh & { fillOpacity: number; outlineOpacity: number };

function isFadingText(m: Mesh): m is FadingText {
  return "fillOpacity" in m && "outlineOpacity" in m;
}

function Zzz() {
  const group = useRef<Group>(null);
  const letters = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const on = Math.min(1, Math.max(0, POSE.zzz));
    g.visible = on > 0.01;
    if (!g.visible) return;
    g.scale.setScalar(POSE.zzzScale);
    const t = clock.elapsedTime;
    for (let i = 0; i < letters.current.length; i++) {
      const m = letters.current[i];
      if (!m) continue;
      // Each letter floats up 0.18 m and fades over a 2 s loop, staggered (kept short so the whole
      // loop stays inside the PILOT and WIDE_INTERIOR frames).
      const p = (t / 2 + i / 3) % 1;
      m.position.set(-0.035 * i + Math.sin(p * Math.PI * 2) * 0.025, p * 0.18, 0);
      if (isFadingText(m)) {
        const a = on * Math.sin(Math.PI * p);
        m.fillOpacity = a;
        m.outlineOpacity = a;
      }
    }
  });
  return (
    <group ref={group} position={[-0.04, 0.8, -0.08]}>
      <Billboard>
        {[0.04, 0.05, 0.065].map((size, i) => (
          <Text
            key={size}
            ref={(m: Mesh | null) => {
              letters.current[i] = m;
            }}
            font={FONT_URL}
            fontSize={size}
            color="#DDE6FF"
            outlineWidth={size * 0.08}
            outlineColor="#1b1d24"
            anchorX="center"
            anchorY="middle"
          >
            {i === 2 ? "Z" : "z"}
          </Text>
        ))}
      </Billboard>
    </group>
  );
}

function Question() {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const k = Math.max(0, POSE.question);
    g.visible = k > 0.01;
    g.scale.setScalar(Math.max(0.001, k));
    g.position.y = 1.08 + Math.sin(clock.elapsedTime * 3) * 0.015;
  });
  return (
    <group ref={group} position={[0, 1.08, 0]} visible={false}>
      <Billboard>
        <Text
          font={FONT_URL}
          fontSize={0.16}
          color="#F5C518"
          outlineWidth={0.012}
          outlineColor="#1b1d24"
          anchorX="center"
          anchorY="middle"
        >
          ?
        </Text>
      </Billboard>
    </group>
  );
}

/** Arms: resting on the thighs; dangling forward when slumped; straight up for the yawn. */
function poseArm(sh: Group | null, el: Group | null, side: -1 | 1, slump: number, stretch: number) {
  if (sh) {
    // +X swings a hanging arm forward (toward −Z, the panels).
    sh.rotation.x = 0.55 + 0.5 * slump + 2.4 * stretch;
    sh.rotation.z = side * (0.12 + 0.18 * stretch);
  }
  if (el) el.rotation.x = 1.0 - 0.6 * slump - 0.8 * stretch;
}

/** The captain's rigid segments, merged (§F21). */
function buildPilot() {
  const collar = mergeParts([
    {
      geo: new BoxGeometry(0.12, 0.1, 0.03),
      color: "#F2E8D5",
      at: [0, 0.5, -0.1],
      rot: [0.4, 0, 0],
    },
    {
      geo: new BoxGeometry(0.035, 0.12, 0.02),
      color: "#E5484D",
      at: [0, 0.44, -0.165],
      rot: [0.25, 0, 0],
    },
  ]);
  const head = mergeParts([
    { geo: new SphereGeometry(0.14, 24, 18), color: SKIN_PILOT, at: [0, 0.13, 0] },
    { geo: new SphereGeometry(0.032, 12, 10), color: SKIN_PILOT, at: [-0.14, 0.12, 0.01] },
    { geo: new SphereGeometry(0.032, 12, 10), color: SKIN_PILOT, at: [0.14, 0.12, 0.01] },
    { geo: new SphereGeometry(0.03, 12, 10), color: "#E0A96D", at: [0, 0.11, -0.142] },
    // mustache: two dark-brown capsules drooping out from under the nose (a handlebar)
    {
      geo: new CapsuleGeometry(0.02, 0.055, 4, 10),
      color: MUSTACHE,
      at: [-0.042, 0.062, -0.128],
      rot: [0.25, 0, -60 * DEG],
    },
    {
      geo: new CapsuleGeometry(0.02, 0.055, 4, 10),
      color: MUSTACHE,
      at: [0.042, 0.062, -0.128],
      rot: [0.25, 0, 60 * DEG],
    },
    // cap: navy crown, black visor, gold badge
    { geo: new CylinderGeometry(0.13, 0.15, 0.08, 24), color: NAVY, at: [0, 0.24, 0] },
    {
      geo: new SphereGeometry(0.13, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      color: NAVY,
      at: [0, 0.275, 0],
      scale: [1, 0.5, 1],
    },
    {
      geo: new BoxGeometry(0.2, 0.016, 0.1),
      color: "#14161C",
      at: [0, 0.205, -0.15],
      rot: [0.25, 0, 0],
    },
    { geo: new BoxGeometry(0.035, 0.03, 0.012), color: BADGE, at: [0, 0.25, -0.148] },
  ]);
  const eyes = mergeParts([
    { geo: new SphereGeometry(0.017, 10, 8), color: INK, at: [-0.05, 0, 0] },
    { geo: new SphereGeometry(0.017, 10, 8), color: INK, at: [0.05, 0, 0] },
  ]);
  return { collar, head, eyes };
}

export function Pilot() {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const chest = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Mesh>(null);
  const geos = useMemo(() => buildPilot(), []);
  useDisposeGeometry(geos.collar);
  useDisposeGeometry(geos.head);
  useDisposeGeometry(geos.eyes);
  const shoulderL = useRef<Group>(null);
  const elbowL = useRef<Group>(null);
  const shoulderR = useRef<Group>(null);
  const elbowR = useRef<Group>(null);

  useLayoutEffect(() => {
    const g = root.current;
    return g ? registerRef("pilot", { group: g, pose: POSE }) : undefined;
  }, []);
  useWorldSync(applyPilot, 1);

  useFrame(({ camera, clock }) => {
    const g = root.current;
    if (!g) return;
    g.visible = stageOf(camera.position) === "cockpit";
    if (!g.visible) return;
    const t = clock.elapsedTime;
    // Ride the seat (p1_seat slides the `pilotSeat` group +0.4 m Z).
    const seat = getRef("pilotSeat");
    g.position.z = (seat?.position.z ?? SEAT_Z) + 0.02;
    const slump = POSE.slump;
    const stretch = POSE.stretch;
    if (torso.current) torso.current.rotation.x = -25 * DEG * slump + 6 * DEG * stretch;
    if (chest.current) {
      const breath = 0.01 * Math.sin(t * Math.PI * 2 * 0.25);
      // Snore swell every ~3.5 s while out.
      const snore = slump * 0.035 * Math.pow(Math.max(0, Math.sin((t * Math.PI * 2) / 3.5)), 6);
      chest.current.scale.set(1 + snore, 1 + breath + snore * 0.5, 1 + snore * 1.4);
    }
    if (head.current) {
      const dazed = POSE.question;
      head.current.rotation.x = -60 * DEG * slump + 8 * DEG * stretch;
      head.current.rotation.y = (POSE.look + dazed * Math.sin(t * 1.1)) * 0.6;
      head.current.rotation.z = slump * 10 * DEG;
    }
    if (eyes.current) eyes.current.scale.y = 1 - 0.85 * Math.max(slump, 1 - POSE.awake);
    poseArm(shoulderL.current, elbowL.current, -1, slump, stretch);
    poseArm(shoulderR.current, elbowR.current, 1, slump, stretch);
  });

  return (
    <group ref={root} name="pilot" position={[SEAT_X, CUSHION_Y, SEAT_Z]}>
      <ToyLegs color={NAVY} floorY={-CUSHION_Y + 0.06} />
      <group ref={torso}>
        <mesh ref={chest} position={[0, 0.17, 0.02]}>
          <capsuleGeometry args={[0.18, 0.45, 8, 16]} />
          <meshStandardMaterial color={NAVY} roughness={R} />
        </mesh>
        <mesh geometry={geos.collar}>
          <meshStandardMaterial vertexColors roughness={R} />
        </mesh>
        <ToyArm
          shoulderRef={shoulderL}
          elbowRef={elbowL}
          side={-1}
          sleeve={NAVY}
          hand={SKIN_PILOT}
          at={[-0.21, 0.45, 0.0]}
        />
        <ToyArm
          shoulderRef={shoulderR}
          elbowRef={elbowR}
          side={1}
          sleeve={NAVY}
          hand={SKIN_PILOT}
          at={[0.21, 0.45, 0.0]}
        />
        <group ref={head} position={[0, 0.6, 0]}>
          <mesh geometry={geos.head}>
            <meshStandardMaterial vertexColors roughness={R} />
          </mesh>
          <mesh ref={eyes} geometry={geos.eyes} position={[0, 0.15, -0.125]}>
            <meshStandardMaterial color={INK} roughness={0.4} />
          </mesh>
        </group>
      </group>
      <Zzz />
      <Question />
    </group>
  );
}
