import { useT } from "../../i18n/useT";
import type { PhaseNo } from "../../net/protocol";
import { PHASE_KEY } from "./phaseColors";

/** The manual's teal hardback front (§F12.3 ManualCover): title, plane emblem, phase name. */
export function CoverFace({ upcoming }: { upcoming: PhaseNo }) {
  const t = useT();
  return (
    <div
      data-testid="cover-face"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-l-md rounded-r-[22px] border-4 border-[#1a7f76] bg-teal p-8 shadow-[0_18px_40px_rgb(0_0_0/0.45)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-l-sm rounded-r-[16px] border-2 border-cream/35"
      />
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
      <p className="text-center font-display text-2xl text-cream/90">{t(PHASE_KEY[upcoming])}</p>
    </div>
  );
}
