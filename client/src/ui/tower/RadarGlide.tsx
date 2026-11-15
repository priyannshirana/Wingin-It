import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../state/store";
import { useCue } from "./useCue";
import { BLIP_CORE, hideRule, radarPoint, REAL_GLIDE, REAL_RUNWAY, RUNWAY } from "./towerDom";

/**
 * `glide_draw` (§F14.4 p3_intro 5–7): the runway icon pops in at the route's end, then the dashed
 * glide path draws from the blip to it (1.2 s, a bright tip leading). Radar.tsx's own runway and
 * path are hidden while it draws; when they exist in `game_state` they take over afterwards
 * (same geometry), otherwise the drawn pose stays until the cue clears.
 */
export function RadarGlide({ radar }: { radar: SVGSVGElement | null }) {
  const on = useCue("glide_draw");
  if (!radar || !on) return null;
  return <Glide radar={radar} />;
}

function Glide({ radar }: { radar: SVGSVGElement }) {
  const real = useStore((s) => s.game?.radar.runway === true && s.game.radar.glide_path === true);
  const [from] = useState(() => radarPoint(radar, radar.querySelector(BLIP_CORE)));
  const [done, setDone] = useState(false);
  const ref = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setDone(true) });
      tl.fromTo(
        "[data-runway]",
        { scale: 0, transformOrigin: "50% 50%" },
        { scale: 1, duration: 0.35, ease: "back.out(3)" },
        0,
      );
      tl.fromTo(
        "[data-path]",
        { attr: { x2: from.x, y2: from.y } },
        { attr: { x2: RUNWAY.x, y2: RUNWAY.y }, duration: 1.2, ease: "power2.inOut" },
        0.3,
      );
      tl.fromTo(
        "[data-tip]",
        { attr: { cx: from.x, cy: from.y }, opacity: 1 },
        { attr: { cx: RUNWAY.x, cy: RUNWAY.y }, duration: 1.2, ease: "power2.inOut" },
        0.3,
      );
      tl.to("[data-tip]", { opacity: 0, duration: 0.2 }, 1.5);
    }, el);
    return () => ctx.revert();
  }, [from]);

  if (done && real) return null;
  return createPortal(
    <g ref={ref} data-fx data-testid="radar-glide">
      <style>{`${hideRule(REAL_GLIDE)} ${hideRule(REAL_RUNWAY)}`}</style>
      <line
        data-path
        data-fx
        x1={from.x}
        y1={from.y}
        x2={from.x}
        y2={from.y}
        stroke="#F2E8D5"
        strokeWidth="2"
        strokeDasharray="5 5"
        opacity="0.7"
      />
      <circle data-tip cx={from.x} cy={from.y} r="3" fill="#FFF4D6" />
      <g transform={`translate(${RUNWAY.x} ${RUNWAY.y}) rotate(${RUNWAY.rotate})`}>
        <rect data-runway data-fx x="-4" y="-14" width="8" height="28" rx="2" fill="#F2E8D5" />
      </g>
    </g>,
    radar,
  );
}
