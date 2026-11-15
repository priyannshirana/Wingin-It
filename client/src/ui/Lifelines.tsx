import { useT } from "../i18n/useT";
import { useStore } from "../state/store";

/** §F13: "3 circles" — every player starts phase 3 with 3 lifelines (§A1). */
const LIFELINE_DOTS = 3;

// Phase 3 lifeline dots + `lifeline.hint` (§F13, §F11 bottom left, §F12.4 right column).
// Filled = remaining for my role. Shown while the server has lifelines on, and while a
// timeline pops the dots in (`lifeline_dots_pop`, p3_intro).
export function Lifelines() {
  const t = useT();
  const enabled = useStore((s) => s.game?.lifelines_enabled === true);
  const popping = useStore((s) => s.cues.lifeline_dots_pop === true);
  const left = useStore((s) => (s.me && s.game ? s.game.lifelines[s.me.role] : LIFELINE_DOTS));
  if (!enabled && !popping) return null;
  return (
    <div
      data-testid="lifelines"
      className="flex items-center gap-3 rounded-2xl bg-night/55 px-4 py-2.5 font-display text-cream backdrop-blur-sm"
    >
      <div className="flex gap-1.5" role="img" aria-label={`${left} / ${LIFELINE_DOTS}`}>
        {Array.from({ length: LIFELINE_DOTS }, (_, i) => {
          const filled = i < left;
          return (
            <span
              key={i}
              data-testid="lifeline-dot"
              data-filled={filled ? "true" : "false"}
              className={`size-4 rounded-full border-2 transition-colors duration-300 ${
                filled
                  ? "border-gloss bg-gloss shadow-[0_0_8px_rgba(233,217,139,0.55)]"
                  : "border-cream/40 bg-transparent"
              } ${popping ? "animate-pop" : ""}`}
              style={popping ? { animationDelay: `${i * 120}ms` } : undefined}
            />
          );
        })}
      </div>
      {left > 0 && (
        <span className="text-[15px] leading-tight text-cream/85">{t("lifeline.hint")}</span>
      )}
    </div>
  );
}
