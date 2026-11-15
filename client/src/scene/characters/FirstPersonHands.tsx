import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  CapsuleGeometry,
  CylinderGeometry,
  type Group,
  type Object3D,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Gender } from "../../net/protocol";
import { selectGenderOf, selectInteractive } from "../../state/selectors";
import { useStore } from "../../state/store";
import { mergeParts, useDisposeGeometry } from "../env/merge";
import { registerRef } from "../sceneRefs";
import { isFirstPerson, OUTFIT, OUTFIT_TRIM, SKIN_FLYER } from "./firstPerson";

// First-person hands (§F9.8): the Flyer's two mittens with sleeves in the character's outfit
// color rest at the bottom edge of the frame. Clicking a control makes the nearer hand poke 180 ms
// toward the click point and back (no IK: a tween toward the hit point). Hidden in third-person
// shots and during cinematics.

const R = 0.55;
const POKE_S = 0.09; // out 90 ms + back 90 ms
const STATIONS = ["station-overhead", "station-pedestal", "station-front"];
// Rest poses in camera space: just under the bottom edge, angled up into the frame.
const REST = {
  left: new Vector3(-0.37, -0.3, -0.66),
  right: new Vector3(0.37, -0.3, -0.66),
} as const;

const ndc = new Vector2();
const caster = new Raycaster();

function Hand({
  side,
  gender,
  handRef,
}: {
  side: -1 | 1;
  gender: Gender;
  handRef: RefObject<Group | null>;
}) {
  // One merged mesh: sleeve rising from the frame's bottom corner, the trim cuff, the mitten and
  // its thumb (pointing in toward the panel).
  const geo = useMemo(
    () =>
      mergeParts([
        { geo: new CapsuleGeometry(0.05, 0.24, 6, 14), color: OUTFIT[gender], at: [0, -0.17, 0] },
        {
          geo: new CylinderGeometry(0.054, 0.054, 0.035, 16),
          color: OUTFIT_TRIM[gender],
          at: [0, -0.03, 0],
        },
        {
          geo: new SphereGeometry(0.052, 16, 12),
          color: SKIN_FLYER,
          at: [0, 0.035, 0],
          scale: [1, 1.25, 0.62],
        },
        {
          geo: new SphereGeometry(0.023, 10, 8),
          color: SKIN_FLYER,
          at: [-side * 0.05, 0.015, -0.012],
        },
      ]),
    [gender, side],
  );
  useDisposeGeometry(geo);
  return (
    <group ref={handRef} rotation={[-0.75, side * 0.1, side * 0.5]} scale={0.85}>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={R} />
      </mesh>
    </group>
  );
}

/** Walk up from a hit mesh to the control group (named by object id in StationGroup). */
function controlIdOf(o: Object3D | null): string | null {
  let cur = o;
  while (cur) {
    if (cur.name && selectInteractive(useStore.getState(), cur.name)) return cur.name;
    cur = cur.parent;
  }
  return null;
}

export function FirstPersonHands() {
  const gender = useStore((s) => selectGenderOf(s, "flyer")) ?? "female";
  const group = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const { gl, camera, scene } = useThree();
  const local = useMemo(() => new Vector3(), []);

  const poke = useMemo(
    () => (point: Vector3) => {
      const g = group.current;
      if (!g) return;
      local.copy(point);
      g.worldToLocal(local);
      const which = local.x < 0 ? "left" : "right";
      const hand = which === "left" ? left.current : right.current;
      if (!hand) return;
      const rest = REST[which];
      gsap.killTweensOf(hand.position);
      gsap
        .timeline()
        .to(hand.position, {
          x: rest.x + (local.x - rest.x) * 0.55,
          y: rest.y + (local.y - rest.y) * 0.55,
          z: rest.z + (local.z - rest.z) * 0.45,
          duration: POKE_S,
          ease: "power2.out",
        })
        .to(hand.position, {
          x: rest.x,
          y: rest.y,
          z: rest.z,
          duration: POKE_S,
          ease: "power2.in",
        });
    },
    [local],
  );

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    left.current?.position.copy(REST.left);
    right.current?.position.copy(REST.right);
    return registerRef("firstPersonHands", { group: g, poke });
  }, [poke]);

  // The poke follows the same click the part handles (useInteractive sends the intent).
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      // §F10.3: the poke plays only in interact mode (cursor visible), never on the freezing click.
      if (e.button !== 0 || !group.current?.visible || document.pointerLockElement) return;
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      caster.setFromCamera(ndc, camera);
      const targets = STATIONS.map((n) => scene.getObjectByName(n)).filter(
        (o): o is Object3D => !!o,
      );
      const hit = caster.intersectObjects(targets, true)[0];
      if (hit && controlIdOf(hit.object)) poke(hit.point);
    };
    el.addEventListener("pointerdown", onDown);
    return () => el.removeEventListener("pointerdown", onDown);
  }, [gl, camera, scene, poke]);

  useEffect(
    () => () => {
      if (left.current) gsap.killTweensOf(left.current.position);
      if (right.current) gsap.killTweensOf(right.current.position);
    },
    [],
  );

  useFrame(({ camera: cam, clock }) => {
    const g = group.current;
    if (!g) return;
    g.visible = isFirstPerson(cam.position) && !useStore.getState().cinePlaying;
    if (!g.visible) return;
    g.position.copy(cam.position);
    g.quaternion.copy(cam.quaternion);
    // A small breathing bob.
    g.position.y += Math.sin(clock.elapsedTime * Math.PI * 0.5) * 0.004;
  });

  return (
    <group ref={group} name="first-person-hands">
      <Hand side={-1} gender={gender} handRef={left} />
      <Hand side={1} gender={gender} handRef={right} />
    </group>
  );
}
