import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCue } from "./useCue";
import { RADAR_C, RADAR_R } from "./towerDom";

const RINGS = [RADAR_R * 0.33, RADAR_R * 0.66, RADAR_R];

/**
 * `radar_boot` (§F14.4 prologue): the radar powers on. A dark cover hides the live disc while
 * bright rings draw in (staggered stroke draw) and the crosshair grows from the centre; then the
 * cover fades and the live sweep and blip show through. 1.2 s in all, so it fits the demo's
 * ×0.5 cue too.
 */
export function RadarBoot({ radar }: { radar: SVGSVGElement | null }) {
  const on = useCue("radar_boot");
  if (!radar || !on) return null;
  return createPortal(<Boot />, radar);
}

function Boot() {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(
        "[data-ring]",
        { strokeDashoffset: (i: number) => 2 * Math.PI * (RINGS[i] ?? RADAR_R) },
        { strokeDashoffset: 0, duration: 0.6, ease: "power2.out", stagger: 0.12 },
        0,
      );
      tl.fromTo(
        "[data-cross]",
        { scale: 0, svgOrigin: `${RADAR_C} ${RADAR_C}` },
        { scale: 1, duration: 0.5, ease: "power2.out" },
        0.1,
      );
      tl.to("[data-cover]", { opacity: 0, duration: 0.45, ease: "power2.inOut" }, 0.7);
      tl.to("[data-bright]", { opacity: 0, duration: 0.4, ease: "power2.in" }, 0.8);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <g ref={ref} data-fx data-testid="radar-boot" pointerEvents="none">
      <circle data-cover cx={RADAR_C} cy={RADAR_C} r={RADAR_R} fill="#0B1A14" />
      <g data-bright stroke="#3FD68B" strokeWidth="2.5" fill="none">
        {RINGS.map((r, i) => (
          <circle
            key={i}
            data-ring
            cx={RADAR_C}
            cy={RADAR_C}
            r={r}
            strokeDasharray={2 * Math.PI * r}
            transform={`rotate(-90 ${RADAR_C} ${RADAR_C})`}
          />
        ))}
        <g data-cross>
          <line x1={RADAR_C} y1={RADAR_C - RADAR_R} x2={RADAR_C} y2={RADAR_C + RADAR_R} />
          <line x1={RADAR_C - RADAR_R} y1={RADAR_C} x2={RADAR_C + RADAR_R} y2={RADAR_C} />
        </g>
      </g>
    </g>
  );
}
