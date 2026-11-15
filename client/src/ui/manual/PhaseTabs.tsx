import { useT } from "../../i18n/useT";
import type { PhaseNo } from "../../net/protocol";
import { PHASE_COLOR, PHASE_KEY } from "./phaseColors";

/** Width the tabs stick out of the page; the manual reserves this much room on its right. */
export const TAB_REACH_PX = 40;

/**
 * Phase tabs sticking out of the right page edge (§F12.3); the current one is wider and labeled
 * (the label runs vertically so the tabs stay within TAB_REACH_PX and never cover the column
 * beside the manual).
 */
export function PhaseTabs({ current }: { current: PhaseNo | null }) {
  const t = useT();
  return (
    <div
      className="absolute top-10 right-0 flex translate-x-full flex-col gap-2"
      aria-hidden="true"
      data-testid="phase-tabs"
    >
      {([1, 2, 3] as const).map((p) => (
        <span
          key={p}
          data-testid={`phase-tab-${p}`}
          className={`flex items-center justify-center rounded-r-xl py-2 font-display text-sm font-extrabold whitespace-nowrap text-white shadow ${p === current ? "w-10" : "w-7"}`}
          style={{
            background: PHASE_COLOR[p],
            writingMode: p === current ? "vertical-rl" : undefined,
          }}
        >
          {p === current ? `${p} · ${t(PHASE_KEY[p])}` : p}
        </span>
      ))}
    </div>
  );
}
