import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { Checklist } from "../Checklist";
import { FindOut } from "./FindOut";
import { Notes } from "./Notes";
import { RuleTable } from "./RuleTable";

// The right page (§F12.3): top to bottom the instruction line, the pictogram rule grid (always
// fully visible), the handwritten notes (hint, sticky note, last try) and the progress dots.
export function RightPage({ card }: { card: ManualCard }) {
  const t = useT();
  return (
    <div className="relative flex h-full flex-col gap-3" data-testid="right-page-content">
      <FindOut card={card} />
      <RuleTable card={card} />
      <Notes card={card} />
      <div className="shrink-0 pt-1">
        <Checklist card={card} />
      </div>
      {card.stamp === "emergency" && (
        <span
          data-testid="emergency-stamp"
          className="pointer-events-none absolute right-1 bottom-9 rotate-12 rounded-xl border-4 border-double border-lamp-red px-3 py-0.5 text-center font-display text-2xl font-extrabold tracking-wide text-lamp-red opacity-85 mix-blend-multiply"
        >
          {t("manual.emergency")}
        </span>
      )}
    </div>
  );
}
