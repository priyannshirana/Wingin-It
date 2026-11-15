import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCue } from "./useCue";

/**
 * `blip_touchdown` (§F14.4 p3_touchdown 2 s): the blip hops and lands with a small bounce, and
 * a touchdown ripple spreads under it. The hop moves Radar.tsx's own blip circles (reverted when
 * the cue ends); the ripple is drawn inside the blip group.
 */
export function BlipBounce({ blip }: { blip: SVGGElement | null }) {
  const on = useCue("blip_touchdown");
  if (!blip || !on) return null;
  return <Bounce blip={blip} />;
}

function Bounce({ blip }: { blip: SVGGElement }) {
  const ripple = useRef<SVGCircleElement>(null);

  useLayoutEffect(() => {
    const dots = Array.from(
      blip.querySelectorAll<SVGCircleElement>(":scope > circle:not([data-fx])"),
    );
    const ring = ripple.current;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      if (dots.length > 0) {
        tl.to(dots, { y: -8, duration: 0.15, ease: "power2.out" }, 0);
        tl.to(dots, { y: 0, duration: 0.5, ease: "bounce.out" }, 0.15);
      }
      if (ring) {
        tl.fromTo(
          ring,
          { scale: 0.5, opacity: 0.9, transformOrigin: "50% 50%" },
          { scale: 3.2, opacity: 0, duration: 0.6, ease: "power2.out" },
          0.2,
        );
      }
    });
    return () => ctx.revert();
  }, [blip]);

  return createPortal(
    <circle
      ref={ripple}
      data-fx
      data-testid="blip-bounce"
      r="7"
      fill="none"
      stroke="#30A46C"
      strokeWidth="2"
      opacity="0"
    />,
    blip,
  );
}
