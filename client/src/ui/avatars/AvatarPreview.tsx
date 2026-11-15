import { lazy, Suspense, useEffect, useRef } from "react";
import type { Gender, Role } from "../../net/protocol";
import { FlyerPortrait } from "./FlyerPortrait";
import { TowerPortrait } from "./TowerPortrait";

interface Props {
  role: Role | null;
  gender: Gender | null;
}

const SIZE = 288;

// three.js loads only when a Flyer preview is actually shown.
const FlyerTurntable = lazy(() =>
  import("./FlyerTurntable").then((m) => ({ default: m.FlyerTurntable })),
);

/**
 * WebGL2 support without creating a context (the Tower never needs one): the turntable's own
 * canvas reports failure through the fallback anyway.
 */
function hasWebGL2(): boolean {
  return typeof window !== "undefined" && "WebGL2RenderingContext" in window;
}

// Character-select preview (§F8.2). Flyer: the 3D FlyerAvatar on a slow turntable (it waves when
// the gender changes; the 2D portrait stands in without WebGL2). Tower: the animated 2D
// TowerPortrait (blinks, mic boom bob) with a quick card flip when the gender changes. Before a
// gender is picked the preview is a dimmed silhouette.
export function AvatarPreview({ role, gender }: Props) {
  if (!role) {
    return <div className="size-72 rounded-full border-4 border-dashed border-cream/30" />;
  }
  const g = gender ?? "male";
  const dim = gender ? "" : "opacity-40 grayscale";
  if (role === "flyer") {
    const portrait = <FlyerPortrait gender={g} size={SIZE} />;
    return (
      <div data-preview="flyer" className={`relative size-72 overflow-hidden rounded-full ${dim}`}>
        {hasWebGL2() ? (
          <Suspense fallback={portrait}>
            <div className="absolute inset-0 rounded-full bg-night-hi/40" />
            <FlyerTurntable gender={g} />
          </Suspense>
        ) : (
          portrait
        )}
      </div>
    );
  }
  return <TowerCard gender={g} dim={dim} />;
}

/** The Tower portrait with a quick card flip (250 ms) whenever the gender changes. */
function TowerCard({ gender, dim }: { gender: Gender; dim: string }) {
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(gender);
  useEffect(() => {
    const el = card.current;
    if (shown.current === gender || !el || typeof el.animate !== "function") return;
    shown.current = gender;
    const anim = el.animate(
      [
        { transform: "perspective(600px) rotateY(90deg)" },
        { transform: "perspective(600px) rotateY(0deg)" },
      ],
      { duration: 250, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
    return () => anim.cancel();
  }, [gender]);
  return (
    <div ref={card} data-preview="tower" className={dim}>
      <TowerPortrait gender={gender} size={SIZE} />
    </div>
  );
}
