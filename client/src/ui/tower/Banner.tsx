import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../i18n/useT";
import { useCue } from "./useCue";
import { RADAR } from "./towerDom";

interface Strip {
  left: number;
  top: number;
  width: number;
}

/**
 * The AUTOPILOT ENGAGED banner (§F12.6): a teal strip with white text across the radar column.
 * Slides in over 250 ms (`power2.out`, §F0.4 2D UI) and sits across the middle of the radar.
 */
export function Banner({ root }: { root: HTMLElement | null }) {
  const on = useCue("autopilot_banner");
  if (!on) return null;
  return <BannerStrip root={root} />;
}

function measure(root: HTMLElement | null): Strip | null {
  const radar = root?.querySelector(RADAR);
  const column = radar?.parentElement;
  if (!root || !radar || !column) return null;
  const base = root.getBoundingClientRect();
  const r = radar.getBoundingClientRect();
  const c = column.getBoundingClientRect();
  if (r.width <= 0 || c.width <= 0) return null;
  // SPEC-ASSUMPTION: the strip crosses the radar's top band (13 % down) and bleeds off the left
  // screen edge — "across the radar column" gives no height; the route never enters that band
  // (y ≥ 70 of 280), so the blip turning green stays visible under the banner.
  return { left: 0, top: r.top - base.top + r.height * BAND, width: c.right - base.left + 12 };
}

/** Vertical center of the strip, as a fraction of the radar's height. */
const BAND = 0.13;

function BannerStrip({ root }: { root: HTMLElement | null }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Measured once per show: the banner is up for 2 s and the layout doesn't move meanwhile.
  const [strip] = useState(() => measure(root));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { xPercent: -110, yPercent: -50, rotation: -2, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 0.25, ease: "power2.out" },
      );
      gsap.fromTo(
        el.querySelector("[data-check]"),
        { scale: 0 },
        { scale: 1, duration: 0.3, delay: 0.2, ease: "back.out(3)" },
      );
    });
    return () => ctx.revert();
  }, []);

  const style = strip
    ? { left: strip.left, top: strip.top, width: strip.width }
    : { left: 0, top: "8%", width: "26%" };
  return (
    <div
      ref={ref}
      data-testid="tower-banner"
      role="status"
      className="pointer-events-none absolute z-[32] opacity-0"
      style={style}
    >
      <div className="flex items-center justify-center gap-3 border-y-4 border-outline bg-teal px-4 py-3 shadow-[0_8px_0_rgb(0_0_0/0.3)]">
        <span
          data-check
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white"
        >
          <svg viewBox="0 0 24 24" className="size-6">
            <path
              d="M5 12.5 L10 17.5 L19 7"
              fill="none"
              stroke="#2EC4B6"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="font-display text-[26px] leading-tight font-extrabold whitespace-nowrap text-white [-webkit-text-stroke:1px_#1B1D24] [paint-order:stroke_fill]">
          {t("tower.autopilot")}
        </span>
      </div>
    </div>
  );
}
