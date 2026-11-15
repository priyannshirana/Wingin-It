import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { Gender } from "../../net/protocol";
import { FlyerAvatar } from "../../scene/characters/FlyerAvatar";

const TURN_RAD_S = 0.45;

function Turntable({ gender }: { gender: Gender }) {
  const spin = useRef<Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += TURN_RAD_S * dt;
  });
  return (
    <group ref={spin} rotation={[0, -0.5, 0]}>
      {/* a cream toy stool + a slate base disc so the seated pose reads */}
      <mesh position={[0, -0.04, 0.02]}>
        <cylinderGeometry args={[0.24, 0.26, 0.08, 32]} />
        <meshStandardMaterial color="#E07A5F" roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.3, 0.02]}>
        <cylinderGeometry args={[0.16, 0.2, 0.44, 24]} />
        <meshStandardMaterial color="#F2E8D5" roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.53, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 40]} />
        <meshStandardMaterial color="#2B2F3A" roughness={0.55} />
      </mesh>
      <FlyerAvatar gender={gender} preview />
    </group>
  );
}

// Character-select preview for the Flyer (§F8.2): the real 3D FlyerAvatar on a slow turntable in
// a small, content-free canvas under the night-calm rig. It waves once when the gender changes.
export function FlyerTurntable({ gender }: { gender: Gender }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 30, near: 0.05, far: 20, position: [0, 0.5, 3.4] }}
      onCreated={({ camera }) => camera.lookAt(0, 0.08, 0)}
    >
      <hemisphereLight args={["#2A3A6A", "#10121A", 0.9]} />
      <pointLight
        color="#FFB347"
        intensity={1.4}
        position={[0.8, 1.2, 1.4]}
        distance={6}
        decay={1}
      />
      <directionalLight color="#9FB4FF" intensity={1.1} position={[-1.5, 2, -1]} />
      <directionalLight color="#FFD8A8" intensity={0.6} position={[1, 1.5, 2]} />
      <Turntable gender={gender} />
    </Canvas>
  );
}
