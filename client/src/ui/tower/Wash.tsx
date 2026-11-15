import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

/**
 * A full-screen color wash, always mounted. It tweens from its *current* opacity to `to` when
 * `on`, or to 0 when off, so a cue that blinks off and on again across two cinematics (landing →
 * ending) dips a little instead of restarting from black.
 */
export function Wash({
  on,
  testId,
  to,
  inS,
  outS,
  className,
  background,
}: {
  on: boolean;
  testId: string;
  to: number;
  inS: number;
  outS: number;
  className: string;
  background: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tween = gsap.to(el, {
      opacity: on ? to : 0,
      duration: on ? inS : outS,
      ease: "power2.inOut",
      overwrite: true,
    });
    return () => {
      tween.kill(); // keep the reached opacity: the next tween continues from it
    };
  }, [on, to, inS, outS]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid={testId}
      data-on={on || undefined}
      className={`pointer-events-none fixed inset-0 opacity-0 ${className}`}
      style={{ background }}
    />
  );
}
