import gsap from "gsap";
import { useLayoutEffect } from "react";
import { useCue } from "./useCue";
import { seeded } from "./towerDom";

const STEPS = 14;
const AMPLITUDE_PX = 9;
const DURATION_S = 0.6;

// A decaying, seeded jitter: the same shake on every run.
const OFFSETS: readonly { x: number; y: number; r: number }[] = (() => {
  const rnd = seeded(7);
  return Array.from({ length: STEPS }, (_, i) => {
    const k = AMPLITUDE_PX * (1 - i / STEPS);
    return { x: (rnd() * 2 - 1) * k, y: (rnd() * 2 - 1) * k, r: (rnd() * 2 - 1) * 0.4 * (k / 9) };
  });
})();

/**
 * The CSS screen shake (§F12.1, §F14.4 p2_intro): a 0.6 s translate jitter of the whole Tower
 * screen. Renders nothing; it animates the screen root and reverts it when the cue ends.
 */
export function ScreenShake({ root }: { root: HTMLElement | null }) {
  const on = useCue("screen_shake");

  useLayoutEffect(() => {
    if (!on || !root) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      const step = DURATION_S / (STEPS + 1);
      for (const o of OFFSETS) {
        tl.to(root, { x: o.x, y: o.y, rotation: o.r, duration: step, ease: "none" });
      }
      tl.to(root, { x: 0, y: 0, rotation: 0, duration: step, ease: "power2.out" });
      tl.set(root, { clearProps: "transform" });
    });
    return () => ctx.revert();
  }, [on, root]);

  return null;
}
