import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCue } from "./useCue";
import { RUNWAY } from "./towerDom";

/**
 * `runway_pulse` (§F14.4 p3_runway_reveal): the runway icon brightens (warm landing-light white)
 * and sends out two pulses, then settles back to its normal look by 2.2 s.
 */
export function RadarRunwayPulse({ radar }: { radar: SVGSVGElement | null }) {
  const on = useCue("runway_pulse");
  if (!radar || !on) return null;
  return createPortal(<Pulse />, radar);
}

function Pulse() {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo("[data-bright]", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0);
      tl.fromTo(
        "[data-ring]",
        { scale: 1, opacity: 0.9, transformOrigin: "50% 50%" },
        { scale: 2.4, opacity: 0, duration: 0.8, ease: "power2.out", stagger: 0.8 },
        0.1,
      );
      tl.to("[data-bright]", { opacity: 0, duration: 0.5, ease: "power2.in" }, 1.7);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <g
      ref={ref}
      data-fx
      data-testid="radar-runway-pulse"
      transform={`translate(${RUNWAY.x} ${RUNWAY.y}) rotate(${RUNWAY.rotate})`}
    >
      {[0, 1].map((i) => (
        <rect
          key={i}
          data-ring
          x="-4"
          y="-14"
          width="8"
          height="28"
          rx="3"
          fill="none"
          stroke="#FFE7B0"
          strokeWidth="2"
          opacity="0"
        />
      ))}
      <g data-bright opacity="0">
        <rect x="-9" y="-19" width="18" height="38" rx="8" fill="#FFE7B0" opacity="0.35" />
        <rect x="-4" y="-14" width="8" height="28" rx="2" fill="#FFF4D6" />
      </g>
    </g>
  );
}
