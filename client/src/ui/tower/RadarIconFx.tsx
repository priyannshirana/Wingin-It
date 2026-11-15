import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n/useT";
import { useStore } from "../../state/store";
import { useCue } from "./useCue";
import { BLIP_ICONS, FLAME_PATH, hideRule, SMOKE_PUFFS } from "./towerDom";

type Mode = "fire" | "smoke";

/**
 * The radar icon beats (§F14.4), drawn inside the blip group so they move with it:
 * - `fire_icon` (p2_intro 0.8): a shock ring and the flame + `tower.engine_fire` pop in;
 * - `smoke_icon` (p2_extinguish 0.5–1.5): the flame shrinks away while the smoke puffs pop in.
 * While the overlay is up it hides Radar.tsx's own icon. Once its animation is done it hands
 * over to that icon when `game_state.radar.icon` already matches (same art, so no visible
 * change); otherwise it keeps showing the end pose until the cue clears.
 */
export function RadarIconFx({ blip }: { blip: SVGGElement | null }) {
  const fire = useCue("fire_icon");
  const smoke = useCue("smoke_icon");
  const mode: Mode | null = smoke ? "smoke" : fire ? "fire" : null;
  if (!blip || !mode) return null;
  return <IconFx key={mode} mode={mode} blip={blip} />;
}

function IconFx({ mode, blip }: { mode: Mode; blip: SVGGElement }) {
  const t = useT();
  const real = useStore((s) => s.game?.radar.icon ?? null);
  const [done, setDone] = useState(false);
  const ref = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setDone(true) });
      if (mode === "fire") {
        tl.fromTo(
          "[data-shock]",
          { scale: 1, opacity: 0.9, transformOrigin: "50% 50%" },
          { scale: 4, opacity: 0, duration: 0.5, ease: "power2.out" },
          0,
        );
        tl.fromTo(
          "[data-flame]",
          { scale: 0, transformOrigin: "50% 70%" },
          { scale: 1, duration: 0.4, ease: "back.out(3)" },
          0.05,
        );
        tl.fromTo("[data-label]", { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2 }, 0.2);
      } else {
        tl.to(
          "[data-flame]",
          { scale: 0.2, opacity: 0, y: -6, transformOrigin: "50% 70%", duration: 0.6 },
          0,
        );
        tl.fromTo(
          "[data-puff]",
          { scale: 0, transformOrigin: "50% 50%" },
          { scale: 1, duration: 0.35, ease: "back.out(2.5)", stagger: 0.12 },
          0.3,
        );
      }
    }, el);
    return () => ctx.revert();
  }, [mode]);

  if (done && real === mode) return null;
  return createPortal(
    <g ref={ref} data-fx data-testid={`radar-${mode}-fx`}>
      <style>{hideRule(BLIP_ICONS)}</style>
      {mode === "fire" && <circle data-shock r="8" fill="none" stroke="#FF7A1A" strokeWidth="2" />}
      <g transform="translate(0 -24)">
        <path data-flame d={FLAME_PATH} fill="#FF7A1A" stroke="#FFD166" strokeWidth="1.5" />
      </g>
      {mode === "fire" && (
        <text
          data-label
          textAnchor="middle"
          y="-2"
          fontSize="11"
          fontWeight="800"
          fill="#FFD166"
          fontFamily="'Baloo 2', sans-serif"
        >
          {t("tower.engine_fire")}
        </text>
      )}
      {mode === "smoke" && (
        <g transform="translate(0 -22)" fill="#8B8D98">
          {SMOKE_PUFFS.map((p, i) => (
            <circle key={i} data-puff cx={p.cx} cy={p.cy} r={p.r} />
          ))}
        </g>
      )}
    </g>,
    blip,
  );
}
