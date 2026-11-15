import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { useStore } from "../state/store";

const PHASE_NAME: Record<1 | 2 | 3, StringKey> = { 1: "phase.1", 2: "phase.2", 3: "phase.3" };
const SIGNAL: Record<1 | 2 | 3, StringKey> = { 1: "signal.1", 2: "signal.2", 3: "signal.3" };
const BARS: Record<1 | 2 | 3, string> = { 1: "▮▮▮", 2: "▮▮", 3: "▮" };

// Title cards (§F14.1): driven by the cinematic timelines through `store.titleCard`.
export function TitleCard() {
  const t = useT();
  const card = useStore((s) => s.titleCard);
  if (!card) return null;
  let title: string;
  let subs: string[];
  if (card.kind === "phase") {
    title = t("title.phase", { n: card.phase, name: t(PHASE_NAME[card.phase]) });
    subs = [`${t("title.signal", { level: t(SIGNAL[card.phase]) })} ${BARS[card.phase]}`];
  } else {
    title = t(card.key, card.params);
    subs = (card.lines ?? []).map((line) => t(line.key, line.params));
  }
  const key = card.kind === "phase" ? `phase-${card.phase}` : card.key;
  return (
    <div
      key={key}
      data-testid="title-card"
      className="animate-title-in pointer-events-none fixed inset-x-0 top-[22%] z-30 flex flex-col items-center gap-3 text-center"
    >
      <h2 className="font-display text-[64px] leading-none font-extrabold text-cream [-webkit-text-stroke:2px_#0B1026] [paint-order:stroke_fill] text-shadow-extrude">
        {title}
      </h2>
      {subs.map((sub) => (
        <p
          key={sub}
          className="font-display text-[28px] font-extrabold text-cream [-webkit-text-stroke:1px_#0B1026] [paint-order:stroke_fill]"
        >
          {sub}
        </p>
      ))}
    </div>
  );
}
