import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { useT } from "../../i18n/useT";
import type { StringKey } from "../../i18n/strings";
import { selectLang } from "../../state/selectors";
import { useStore } from "../../state/store";
import { useCue } from "./useCue";

export type StampKind = "mayday" | "landed";

const STAMPS: Record<
  StampKind,
  { cue: "mayday_stamp" | "landed_stamp"; key: StringKey; ink: string }
> = {
  mayday: { cue: "mayday_stamp", key: "tower.mayday", ink: "#E5484D" },
  landed: { cue: "landed_stamp", key: "tower.landed", ink: "#30A46C" },
};

/**
 * The rubber stamp (§F12.6): Baloo 2 800 at 96 px in a rounded double border, rotated −8°. It
 * slams in (scale 2.2 → 1, 180 ms, `power4.in`) and jolts the whole screen 2 px on impact. The
 * thump is played by the timeline, so seeking stays silent.
 */
// SPEC-ASSUMPTION: stamps land centred at 60 % of the screen height on a cream label backing —
// §F12.6 gives no position; centred below the 22 % title card both read at once, and the backing
// keeps the ink readable on the dark desk and the teal cover alike.
export function Stamp({ kind, root }: { kind: StampKind; root: HTMLElement | null }) {
  const spec = STAMPS[kind];
  const on = useCue(spec.cue);
  if (!on) return null;
  return <StampFace kind={kind} root={root} />;
}

function StampFace({ kind, root }: { kind: StampKind; root: HTMLElement | null }) {
  const t = useT();
  const latin = useStore(selectLang) === "en";
  const spec = STAMPS[kind];
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(
        el,
        { xPercent: -50, yPercent: -50, rotation: -8, scale: 2.2, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.18, ease: "power4.in" },
      );
      if (root) {
        tl.to(root, { x: 2, y: 2, duration: 0.04, ease: "none" });
        tl.to(root, { x: -1, y: -1, duration: 0.04, ease: "none" });
        tl.to(root, { x: 0, y: 0, duration: 0.04, ease: "none", clearProps: "transform" });
      }
    });
    return () => ctx.revert();
  }, [root]);

  return (
    <div
      ref={ref}
      data-testid="tower-stamp"
      data-kind={kind}
      role="status"
      className="pointer-events-none fixed top-[60%] left-1/2 z-[32] opacity-0"
      style={{ color: spec.ink }}
    >
      <div
        className="rounded-[28px] border-[10px] border-double bg-cream/90 px-10 py-1 shadow-[0_10px_0_rgb(0_0_0/0.25)]"
        style={{ borderColor: spec.ink }}
      >
        <span
          className={`block font-display text-[96px] leading-[1.15] font-extrabold whitespace-nowrap ${latin ? "tracking-[0.12em]" : ""}`}
        >
          {t(spec.key)}
        </span>
      </div>
    </div>
  );
}
