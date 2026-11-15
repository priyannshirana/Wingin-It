import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../state/store";
import { useCue } from "./useCue";
import { STORM_BLOBS } from "./towerDom";

/**
 * `storm_in` (§F14.4 p2_outro): the four storm blobs drift in from the west over ~5 s and settle
 * where Radar.tsx draws them, then sway slowly. As soon as `game_state.radar.storm` is on, the
 * real blobs take over (same positions) and this overlay steps aside, so they never double up.
 */
export function RadarStorm({ radar }: { radar: SVGSVGElement | null }) {
  const on = useCue("storm_in");
  const real = useStore((s) => s.game?.radar.storm === true);
  if (!radar || !on || real) return null;
  return createPortal(<Blobs />, radar);
}

function Blobs() {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-blob]",
        { x: (i: number) => -220 - i * 30, opacity: 0 },
        { x: 0, opacity: 0.28, duration: 4, ease: "power2.out", stagger: 0.45 },
      );
      gsap.to("[data-blob]", {
        x: 14,
        duration: 9,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: 5.5,
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <g ref={ref} data-fx data-testid="radar-storm" clipPath="url(#radar-disc)">
      {STORM_BLOBS.map((b, i) => (
        <circle key={i} data-blob cx={b.cx} cy={b.cy} r={b.r} fill="#8B8D98" opacity="0" />
      ))}
    </g>
  );
}
