import { type RefObject, useMemo } from "react";
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, type Group, SphereGeometry } from "three";
import { mergeParts, type PartSpec, useDisposeGeometry } from "../env/merge";
import { SHOE } from "./firstPerson";

// Shared toy limbs for the captain and the Flyer's character (§F9.8). Each rigid segment is one
// merged, vertex-colored mesh (§F21).

const R = 0.55;

interface ArmProps {
  /** Shoulder pivot: x = swing forward (+), z = spread. */
  shoulderRef: RefObject<Group | null>;
  /** Elbow pivot: x = bend the forearm up (+). */
  elbowRef: RefObject<Group | null>;
  side: -1 | 1;
  sleeve: string;
  cuff?: string;
  hand: string;
  at: [number, number, number];
  /** Upper arm / forearm length (m). */
  length?: number;
  radius?: number;
  /** Mitten hands (the Flyer) or plain round hands (the captain). */
  mitten?: boolean;
}

/** A toy arm: shoulder pivot → upper arm → elbow pivot → forearm → hand (hangs along −Y). */
export function ToyArm({
  shoulderRef,
  elbowRef,
  side,
  sleeve,
  cuff,
  hand,
  at,
  length = 0.21,
  radius = 0.05,
  mitten = false,
}: ArmProps) {
  const upper = useMemo(
    () =>
      mergeParts([
        { geo: new SphereGeometry(radius * 1.15, 14, 10), color: sleeve },
        { geo: new CapsuleGeometry(radius, length, 6, 12), color: sleeve, at: [0, -length / 2, 0] },
      ]),
    [radius, length, sleeve],
  );
  const lower = useMemo(() => {
    const parts: PartSpec[] = [
      {
        geo: new CapsuleGeometry(radius * 0.92, length * 0.9, 6, 12),
        color: sleeve,
        at: [0, -length / 2, 0],
      },
      {
        geo: new SphereGeometry(radius * 1.1, 14, 10),
        color: hand,
        at: [0, -length - radius * 0.6, 0],
        scale: mitten ? [1, 1.15, 0.8] : 1,
      },
    ];
    if (cuff) {
      parts.push({
        geo: new CylinderGeometry(radius * 1.02, radius * 1.02, 0.03, 14),
        color: cuff,
        at: [0, -length * 0.98, 0],
      });
    }
    if (mitten) {
      parts.push({
        geo: new SphereGeometry(radius * 0.45, 10, 8),
        color: hand,
        at: [-side * radius * 0.9, -length - radius * 0.2, -radius * 0.3],
      });
    }
    return mergeParts(parts);
  }, [radius, length, sleeve, hand, cuff, mitten, side]);
  useDisposeGeometry(upper);
  useDisposeGeometry(lower);
  return (
    <group position={at} ref={shoulderRef}>
      <mesh geometry={upper}>
        <meshStandardMaterial vertexColors roughness={R} />
      </mesh>
      <group position={[0, -length, 0]} ref={elbowRef}>
        <mesh geometry={lower}>
          <meshStandardMaterial vertexColors roughness={R} />
        </mesh>
      </group>
    </group>
  );
}

/** Seated legs: thighs forward along −Z, shins down to the floor, chunky shoes. One mesh. */
export function ToyLegs({ color, floorY }: { color: string; floorY: number }) {
  const geo = useMemo(() => {
    const parts: PartSpec[] = [];
    for (const s of [-1, 1]) {
      const x = s * 0.1;
      parts.push(
        {
          geo: new CapsuleGeometry(0.075, 0.28, 6, 12),
          color,
          at: [x, 0.02, -0.17],
          rot: [Math.PI / 2, 0, 0],
        },
        {
          geo: new CapsuleGeometry(0.065, Math.max(0.05, -floorY - 0.12), 6, 12),
          color,
          at: [x, 0.02 + (floorY + 0.06) / 2, -0.36],
        },
        {
          geo: new BoxGeometry(0.12, 0.08, 0.2),
          color: SHOE,
          at: [x, 0.02 + floorY + 0.05, -0.41],
        },
      );
    }
    return mergeParts(parts);
  }, [color, floorY]);
  useDisposeGeometry(geo);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors roughness={R} />
    </mesh>
  );
}
