import { useT } from "../../i18n/useT";
import type { PhaseNo } from "../../net/protocol";
import { TAB_REACH } from "./bookGeometry";
import { PHASE_COLOR, PHASE_KEY } from "./phaseColors";

/**
 * Phase tabs sticking out of the right page's outer edge (§F12.3); the current one is wider and
 * labeled. The label runs vertically so the tabs stay within TAB_REACH, the width the book
 * reserves for them, and never cover the column beside the manual.
 */
export function PhaseTabs({ current }: { current: PhaseNo | null }) {
  const t = useT();
  return (
    <div
      className="absolute top-12 right-0 flex translate-x-full flex-col gap-2"
      aria-hidden="true"
      data-testid="phase-tabs"
      style={{ width: TAB_REACH }}
    >
      {([1, 2, 3] as const).map((p) => (
        <span
          key={p}
          data-testid={`phase-tab-${p}`}
          className="flex items-center justify-center rounded-r-xl py-2 font-display text-sm font-extrabold whitespace-nowrap text-white shadow"
          style={{
            background: PHASE_COLOR[p],
            width: p === current ? TAB_REACH : TAB_REACH - 8,
            writingMode: p === current ? "vertical-rl" : undefined,
          }}
        >
          {p === current ? `${p} · ${t(PHASE_KEY[p])}` : p}
        </span>
      ))}
    </div>
  );
}
