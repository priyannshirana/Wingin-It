import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { PanelDrawing } from "./PanelDrawing";
import { PHASE_COLOR } from "./phaseColors";
import { ShrinkToFit } from "./ShrinkToFit";

// The left page (§F12.3): the title bar on top, then the station diagram filling the rest of the
// page. Nothing else goes on the left page.
export function LeftPage({ card }: { card: ManualCard }) {
  const t = useT();
  return (
    <div className="relative flex h-full flex-col gap-2" data-testid="left-page-content">
      <header className="flex shrink-0 flex-col gap-1.5" data-testid="title-bar">
        <div className="flex h-[22px] items-center justify-between gap-2">
          <span
            className="h-1.5 w-10 rounded-full"
            style={{ background: PHASE_COLOR[card.phase] }}
            aria-hidden="true"
          />
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-sm font-semibold text-ink/60">
              {card.phase_name}
            </span>
            <span
              data-testid="step-pill"
              className="shrink-0 rounded-full bg-ink px-2.5 py-1 font-display text-sm leading-none font-extrabold text-white"
            >
              {t("manual.step", { i: card.index + 1, n: card.total })}
            </span>
          </span>
        </div>
        <ShrinkToFit className="h-[78px]" min={0.7}>
          <h2
            data-testid="module-title"
            className={`text-center font-display text-[34px] leading-[1.1] font-extrabold text-balance text-ink ${card.lang === "en" ? "tracking-wide uppercase" : ""}`}
          >
            {card.title}
          </h2>
        </ShrinkToFit>
      </header>
      <div className="min-h-0 flex-1" data-testid="diagram-slot">
        <PanelDrawing
          station={card.station}
          lang={card.lang}
          circled={card.highlight.circled}
          question={card.highlight.question}
        />
      </div>
    </div>
  );
}
