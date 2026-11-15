import { useEffect, useRef, type ReactNode } from "react";
import { GUTTER, PAGE_H, PAGE_W, RIGHT_PAGE_X, STACK } from "./bookGeometry";

interface Props {
  /** Face seen while the leaf lies on the right half (0°). */
  front: ReactNode;
  /** Face seen once it has flipped over the spine onto the left half (−180°). */
  back: ReactNode;
  /** Resting angle: 0 = on the right page, −180 = on the left page. */
  to: 0 | -180;
  /**
   * Animate once on mount from this angle to `to` (Web Animations). Without it the angle follows
   * `to` with a CSS transition, so toggling a cue on / off always ends in the matching pose and
   * a first render simply shows the pose (seekable, idempotent).
   */
  from?: 0 | -180;
  ms: number;
  /** CSS-transition mode only: wait this long before turning. */
  delayMs?: number;
  easing?: string;
  onDone?: () => void;
  testId: string;
}

const rot = (deg: number) => `rotateY(${deg}deg)`;

/**
 * One leaf of the ring-bound book: a page-sized card hinged on the spine (between the pages)
 * that flips over the gutter. Used for the page turn, and the cover opening / closing.
 */
export function BookLeaf({
  front,
  back,
  to,
  from,
  ms,
  delayMs = 0,
  easing = "ease-in-out",
  onDone,
  testId,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (from === undefined) return;
    const el = ref.current;
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || typeof el.animate !== "function" || reduce) {
      done.current?.();
      return;
    }
    const anim = el.animate([{ transform: rot(from) }, { transform: rot(to) }], {
      duration: ms,
      easing,
      fill: "forwards",
    });
    let alive = true;
    anim.finished.then(
      () => alive && done.current?.(),
      () => undefined,
    );
    return () => {
      alive = false;
      anim.cancel();
    };
  }, [from, to, ms, easing]); // constant per mount: the parent keys the leaf per turn

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-angle={to}
      className="pointer-events-none absolute z-30"
      style={{
        left: RIGHT_PAGE_X,
        top: STACK,
        width: PAGE_W,
        height: PAGE_H,
        transformStyle: "preserve-3d",
        transformOrigin: `${-GUTTER / 2}px 50%`,
        transform: rot(from ?? to),
        transition: from === undefined ? `transform ${ms}ms ${easing} ${delayMs}ms` : undefined,
      }}
    >
      <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
        {front}
      </div>
      <div
        className="absolute inset-0"
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        {back}
      </div>
    </div>
  );
}
