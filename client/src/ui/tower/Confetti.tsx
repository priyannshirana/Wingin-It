import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { useCue } from "./useCue";
import { seeded } from "./towerDom";

export const CONFETTI_COUNT = 60;
const DURATION_S = 2;
const COLORS = ["#2EC4B6", "#E07A5F", "#F5C518", "#3E63DD", "#30A46C", "#F2E8D5", "#F97316"];

interface Piece {
  color: string;
  w: number;
  h: number;
  round: boolean;
  dx: number;
  up: number;
  fall: number;
  spin: number;
  delay: number;
}

// The same 60 pieces every time (seeded), bursting from the LANDED stamp and falling.
const PIECES: readonly Piece[] = (() => {
  const rnd = seeded(42);
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const round = rnd() < 0.3;
    const size = 8 + rnd() * 8;
    return {
      color: COLORS[i % COLORS.length] ?? "#F2E8D5",
      w: size,
      h: round ? size : size * 1.7,
      round,
      dx: (rnd() - 0.5) * 1100,
      up: 160 + rnd() * 320,
      fall: 380 + rnd() * 320,
      spin: (rnd() - 0.5) * 1080,
      delay: rnd() * 0.12,
    };
  });
})();

/** Confetti (§F12.2): 60 DOM particles over 2 s, played once when the LANDED stamp lands. */
export function Confetti() {
  const on = useCue("confetti");
  if (!on) return null;
  return <ConfettiBurst />;
}

function ConfettiBurst() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const nodes = el.querySelectorAll<HTMLElement>("[data-piece]");
      nodes.forEach((node, i) => {
        const p = PIECES[i];
        if (!p) return;
        const rise = 0.45;
        const tl = gsap.timeline({ delay: 0.18 + p.delay }); // after the stamp's 180 ms slam
        tl.fromTo(
          node,
          { x: 0, y: 0, rotation: 0, opacity: 1, scale: 0.4 },
          { x: p.dx * 0.6, y: -p.up, scale: 1, duration: rise, ease: "power2.out" },
        );
        tl.to(node, {
          x: p.dx,
          y: p.fall,
          rotation: p.spin,
          duration: DURATION_S - rise - p.delay - 0.18,
          ease: "power1.in",
        });
        tl.to(node, { opacity: 0, duration: 0.35, ease: "power1.in" }, "<+=0.85");
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed top-[60%] left-1/2 z-[34] size-0"
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          data-piece
          data-testid="confetti-piece"
          className="absolute opacity-0"
          style={{
            width: p.w,
            height: p.h,
            marginLeft: -p.w / 2,
            marginTop: -p.h / 2,
            background: p.color,
            borderRadius: p.round ? "50%" : 3,
          }}
        />
      ))}
    </div>
  );
}
