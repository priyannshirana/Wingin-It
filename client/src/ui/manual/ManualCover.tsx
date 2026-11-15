import { useT } from "../../i18n/useT";
import type { PhaseNo } from "../../net/protocol";
import { PHASE_KEY } from "./phaseColors";
import { PhaseTabs } from "./PhaseTabs";

// The closed manual (§F12.3): a teal hardback with the title, a plane emblem, the phase tabs and
// the upcoming phase's name.
export function ManualCover({ upcoming }: { upcoming: PhaseNo }) {
  const t = useT();
  return (
    <div
      data-testid="manual-cover"
      className="relative mx-auto flex aspect-[3/4] w-[62%] flex-col items-center justify-center gap-6 rounded-r-3xl rounded-l-lg border-4 border-[#1a7f76] bg-teal p-8 shadow-[0_18px_40px_rgb(0_0_0/0.45)]"
    >
      <PhaseTabs current={upcoming} />
      <h2 className="text-center font-display text-4xl font-extrabold tracking-wide text-cream">
        {t("manual.cover_title")}
      </h2>
      <svg viewBox="0 0 120 80" className="w-40" aria-hidden="true">
        <ellipse cx="60" cy="40" rx="46" ry="10" fill="#F2E8D5" />
        <rect x="20" y="33" width="80" height="14" rx="7" fill="#F2E8D5" />
        <path d="M50 40 L30 8 L44 8 L72 40 Z M50 40 L30 72 L44 72 L72 40 Z" fill="#F2E8D5" />
        <path d="M18 40 L8 26 L16 26 L28 38 Z" fill="#F2E8D5" />
        <circle cx="86" cy="40" r="3" fill="#2EC4B6" />
      </svg>
      <p className="font-display text-2xl text-cream/90">{t(PHASE_KEY[upcoming])}</p>
    </div>
  );
}
