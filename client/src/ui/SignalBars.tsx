import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { useStore } from "../state/store";

const LABEL: Record<1 | 2 | 3, StringKey> = { 1: "signal.1", 2: "signal.2", 3: "signal.3" };
const PHASE: Record<1 | 2 | 3, StringKey> = { 1: "phase.1", 2: "phase.2", 3: "phase.3" };

/** 3 signal bars (phase 1 → 3 filled, 2 → 2, 3 → 1) + `signal.N` + the phase name (§F11). */
export function SignalBars() {
  const t = useT();
  const level = useStore((s) => s.game?.signal_level ?? 0);
  const phase = useStore((s) => s.game?.phase ?? 0);
  const filled = level === 0 ? 0 : 4 - level;
  return (
    <div className="flex items-center gap-3 font-display text-cream" data-testid="signal">
      <div className="flex items-end gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-2 rounded-sm ${i <= filled ? "bg-teal" : "bg-white/20"}`}
            style={{ height: 6 + i * 6 }}
          />
        ))}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-xs tracking-widest text-cream/60">
          {t("signal.label")}
          {level !== 0 && <> · {t(LABEL[level])}</>}
        </span>
        {phase !== 0 && <span className="text-lg font-extrabold">{t(PHASE[phase])}</span>}
      </div>
    </div>
  );
}
