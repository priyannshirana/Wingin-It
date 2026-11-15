import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { InkSegments } from "./InkSegments";
import { QuickSayButton } from "./QuickSayButton";

/** ", " after a plain phrase; just a space after one that already ends in punctuation. */
const joiner = (text: string) => (/[?!.।:,]$/.test(text.trim()) ? " " : ", ");

// The right page's instruction line (§F12.3 right page, item 3). It describes the RULE, never a
// sentence to say aloud: observe → the breadcrumb as a sentence + "then follow the grid";
// branch_on → known_from + "then follow the grid"; say-only → "Have the Flyer do this:".
export function FindOut({ card }: { card: ManualCard }) {
  const t = useT();
  const f = card.find_out;
  return (
    <section
      className="flex flex-none flex-col items-center gap-0.5 px-1 text-center"
      data-testid="find-out"
    >
      <p className="font-display text-[18px] leading-snug font-semibold" data-testid="instruction">
        {f ? (
          <>
            <b className="font-extrabold">{f.station_label}</b>
            <span className="mx-1.5" aria-hidden="true">
              →
            </span>
            <b className="font-extrabold">
              <InkSegments segments={f.part_label} />
            </b>
            <span className="mx-1.5" aria-hidden="true">
              →
            </span>
            <b className="font-extrabold">{f.property_label}</b>
            <span>
              {joiner(f.property_label)}
              {t("manual.then_grid")}
            </span>
          </>
        ) : card.known_from ? (
          <>
            <b className="font-extrabold">{card.known_from.text}</b>
            <span>
              {joiner(card.known_from.text)}
              {t("manual.then_grid")}
            </span>
          </>
        ) : (
          <b className="font-extrabold">{t("manual.instruction_do")}</b>
        )}
        <span className="ml-2 inline-flex align-middle">
          <QuickSayButton line={card.quick_say?.ask} />
        </span>
      </p>
      <p className="-rotate-1 font-hand text-[16px] leading-tight text-pencil-grey">
        {card.own_words_note}
      </p>
    </section>
  );
}
