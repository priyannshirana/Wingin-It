import { useEffect, useRef, type RefObject } from "react";
import type { Role } from "../net/protocol";
import { SIGNAL_BARS, SIGNAL_FLASH_MS, STATIC_DIP_MS, useFxOverlayStore } from "./fxVisuals";

const TEAL = "#2ec4b6";
const CREAM = "#f2e8d5";

// The screen-wide 2D one-shots of §A12 `both:*`, mounted inside each game screen (both roles):
// - `both:signal_flash`: the signal bars flash full 3× over 1.2 s (§F15);
// - `both:static_dip`: the radio static drops out for 1.2 s (audio). SPEC-ASSUMPTION: the screen
//   shows it too — a burst of static (TV snow + scanlines on the Tower, film grain on the Flyer)
//   that clears over the 1.2 s, so the moment the signal cleans up is visible, not only audible.
export function FxOverlays({ role }: { role: Role }) {
  const dip = useFxOverlayStore((s) => s.staticDip);
  const flash = useFxOverlayStore((s) => s.signalFlash);
  const anchor = useRef<HTMLDivElement>(null);
  useSignalFlash(flash, anchor);
  return (
    <div ref={anchor} className="contents">
      {dip > 0 && <StaticBurst key={dip} role={role} />}
    </div>
  );
}

function useSignalFlash(id: number, anchor: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (id === 0) return;
    const root = anchor.current?.closest("[data-screen]") ?? document;
    const bars = Array.from(root.querySelectorAll<HTMLElement>(SIGNAL_BARS));
    const anims: Animation[] = [];
    const on = {
      backgroundColor: CREAM,
      boxShadow: `0 0 4px ${CREAM}, 0 0 12px ${TEAL}`,
      opacity: 1,
    };
    const off = { boxShadow: "0 0 0 transparent" };
    for (const bar of bars) {
      if (typeof bar.animate !== "function") continue;
      // Three on/off flashes (0.4 s each), every bar lit = full signal.
      anims.push(
        bar.animate(
          [
            { ...on, offset: 0 },
            { ...on, offset: 0.2 },
            { ...off, offset: 0.33 },
            { ...on, offset: 0.4 },
            { ...on, offset: 0.53 },
            { ...off, offset: 0.66 },
            { ...on, offset: 0.73 },
            { ...on, offset: 0.9 },
            { ...off, offset: 1 },
          ],
          { duration: SIGNAL_FLASH_MS, easing: "linear" },
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [id, anchor]);
}

function StaticBurst({ role }: { role: Role }) {
  const el = useRef<HTMLDivElement>(null);
  const noise = useRef<SVGSVGElement>(null);
  const tower = role === "tower";
  useEffect(() => {
    const anims: Animation[] = [];
    const peak = tower ? 0.55 : 0.4;
    const e = el.current;
    if (e && typeof e.animate === "function") {
      anims.push(
        e.animate(
          [
            { opacity: 0 },
            { opacity: peak, offset: 0.05 },
            { opacity: peak * 0.6, offset: 0.12 },
            { opacity: peak * 0.9, offset: 0.2 },
            { opacity: 0 },
          ],
          { duration: STATIC_DIP_MS, easing: "ease-out", fill: "forwards" },
        ),
      );
    }
    const n = noise.current;
    if (n && typeof n.animate === "function") {
      // A stepped jitter of an oversized noise tile: the snow "crawls" without re-rendering.
      anims.push(
        n.animate(
          [
            { transform: "translate(0, 0)" },
            { transform: "translate(-7%, 4%)" },
            { transform: "translate(5%, -6%)" },
            { transform: "translate(-3%, -2%)" },
            { transform: "translate(6%, 5%)" },
          ],
          { duration: 160, iterations: Math.ceil(STATIC_DIP_MS / 160), easing: "steps(1)" },
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [tower]);

  const filterId = `static-dip-${role}`;
  return (
    <div
      ref={el}
      aria-hidden="true"
      data-testid="static-dip"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden opacity-0 mix-blend-screen"
    >
      <svg ref={noise} className="absolute -inset-[10%] h-[120%] w-[120%]">
        <filter id={filterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency={tower ? 0.85 : 1.4}
            numOctaves={2}
            stitchTiles="stitch"
          />
          {/* White speckles on transparent: alpha = a steep ramp of the noise (snow, not haze). */}
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${tower ? "4 0 0 0 -1.6" : "4 0 0 0 -1.8"}`}
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
      {tower && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.35) 0 2px, transparent 2px 4px)",
          }}
        />
      )}
    </div>
  );
}
