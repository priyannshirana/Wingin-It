import type { Gender, Role } from "../../net/protocol";
import { FlyerPortrait } from "./FlyerPortrait";
import { TowerPortrait } from "./TowerPortrait";

interface Props {
  role: Role | null;
  gender: Gender | null;
}

// Character-select preview (§F8.2). M1: the 2D portrait, re-keyed so it pops on every change.
// M3a replaces the Flyer side with the 3D FlyerAvatar turntable.
export function AvatarPreview({ role, gender }: Props) {
  if (!role) {
    return <div className="size-72 rounded-full border-4 border-dashed border-cream/30" />;
  }
  const g = gender ?? "male";
  const key = `${role}-${g}`;
  return (
    <div key={key} className={`animate-pop ${gender ? "" : "opacity-40 grayscale"}`}>
      {role === "flyer" ? (
        <FlyerPortrait gender={g} size={288} />
      ) : (
        <TowerPortrait gender={g} size={288} />
      )}
    </div>
  );
}
