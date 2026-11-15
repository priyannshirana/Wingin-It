import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { InkSegments } from "./InkSegments";
import { ShrinkToFit } from "./ShrinkToFit";

// The right page's handwritten notes (§F12.3, right page lower part): the pencil hint with a
// curved arrow toward the diagram, the yellow sticky note, and the red "last try" note. They take
// the space left under the rule grid and shrink to fit it, so long text is never clipped.
export function Notes({ card }: { card: ManualCard }) {
  const t = useT();
  return (
    <ShrinkToFit className="flex-1" testId="notes" min={0.7}>
      <div className="flex flex-col items-stretch gap-3 px-1 pt-1 pb-2">
        <div className="flex items-start gap-1.5" data-testid="hint">
          <svg viewBox="0 0 60 40" className="mt-1 w-10 shrink-0" aria-hidden="true">
            <path
              d="M56 30 C 40 34 20 30 8 14"
              fill="none"
              stroke="#555"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M4 22 L8 13 L17 16"
              fill="none"
              stroke="#555"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="-rotate-2 font-hand text-[20px] leading-snug text-pencil-grey">
            {card.hint}
          </p>
        </div>
        {card.sticky && (
          <div
            data-testid="sticky"
            className="relative mx-auto mt-1 w-[80%] rotate-[4deg] bg-sticky px-4 pt-4 pb-3 font-hand text-[22px] leading-snug text-ink shadow-[0_8px_14px_rgb(0_0_0/0.18)]"
          >
            <span
              aria-hidden="true"
              className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-2 bg-white/70 shadow-sm"
            />
            {card.sticky}
          </div>
        )}
        {card.last_wrong && (
          <p
            data-testid="last-wrong"
            className="-rotate-2 px-2 font-hand text-[20px] leading-snug text-wrong-ink underline decoration-wavy decoration-2 underline-offset-4"
          >
            {t("manual.last_try")} <InkSegments segments={card.last_wrong.label} /> ×
            {card.last_wrong.count} ✗
          </p>
        )}
      </div>
    </ShrinkToFit>
  );
}
