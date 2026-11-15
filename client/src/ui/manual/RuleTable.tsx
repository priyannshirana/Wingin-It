import { Fragment } from "react";
import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { useStore } from "../../state/store";
import { ControlDrawing } from "./ControlDrawing";
import { InkSegments } from "./InkSegments";
import { PointingHand } from "./PointingHand";
import { QuickSayButton } from "./QuickSayButton";
import { PAGE_H } from "./bookGeometry";
import { ValuePictogram } from "./ValuePictogram";
import { WrongSlip } from "./WrongSlip";

const HEADER_H = 88; // the value tabs' row (pictogram ≥ 48 px + its label)
/** §F12.3 item 4: the grid takes ≈ 45–55% of the page height. */
const MIN_H = Math.round(PAGE_H * 0.46);

// The pictogram-first rule grid (§F12.3 right page, item 4), styled as an illustrated rule card:
// a thick rounded outer border, a row of rounded value tabs (bulb / arrow / ✓✗ pictograms) and
// one long rounded pill under them holding each column's action as big control drawings, with
// thin dividers between the columns and small highlighted labels.
export function RuleTable({ card }: { card: ManualCard }) {
  const t = useT();
  const stamp = useStore((s) =>
    s.successStamp?.action_id === card.action_id ? s.successStamp.row_index : null,
  );
  const sayOnly = card.rows.length === 1 && card.rows[0]?.when === null;
  // SPEC-ASSUMPTION: "branch_on FIRE_SIDE" is recognized as a side branch with a `known_from`
  // note (the card doesn't name the variable); those arrows get the small flame.
  const fireSide = card.known_from !== null;

  return (
    <section
      data-testid="rule-table"
      className="relative flex shrink-0 flex-col rounded-[22px] border-[3.5px] border-ink bg-white p-2"
      style={{ minHeight: MIN_H }}
    >
      {/* the long pill behind the action cells */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-2 rounded-[16px] bg-[#EFEDE7]"
        style={{ top: HEADER_H + 14 }}
      />
      <div
        className="relative grid flex-1 gap-x-1.5"
        style={{ gridTemplateColumns: `repeat(${card.rows.length}, minmax(0, 1fr))` }}
      >
        {card.rows.map((row, i) => {
          const line = row.when
            ? card.quick_say?.branches.find((b) => b.value === row.when?.value)?.line
            : card.quick_say?.say;
          return (
            <div
              key={i}
              data-testid="rule-row"
              data-col={i}
              className="relative flex min-w-0 flex-col items-center"
            >
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[4px] w-[2px] rounded-full bg-ink/15"
                  style={{ top: HEADER_H + 22, bottom: 8 }}
                />
              )}
              <header
                className="flex w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-ink/70 bg-[#F4EFE4] px-1.5"
                style={{ height: HEADER_H }}
              >
                {row.when ? (
                  <>
                    <ValuePictogram
                      size={52}
                      swatch={row.when.swatch}
                      flame={fireSide && row.when.swatch.kind === "side"}
                    />
                    <span className="max-w-full truncate font-display text-sm leading-tight font-semibold">
                      <InkSegments segments={row.when.label} />
                    </span>
                  </>
                ) : (
                  <>
                    <PointingHand size={52} />
                    {sayOnly && (
                      <span className="font-display text-sm leading-tight font-semibold text-ink/70">
                        {t("manual.do_only")}
                      </span>
                    )}
                  </>
                )}
              </header>
              <div className="flex w-full flex-1 flex-col items-center justify-center gap-1 px-1 pt-4 pb-2">
                <div className="flex flex-wrap items-end justify-center gap-x-1 gap-y-1">
                  {row.controls.map((c, j) => (
                    <Fragment key={`${c.object_id}-${j}`}>
                      {j > 0 && (
                        <span
                          className="self-center px-0.5 font-display text-2xl font-extrabold"
                          data-testid="order-sep"
                        >
                          {row.order === "ordered" ? "→" : "+"}
                        </span>
                      )}
                      <span className="flex flex-col items-center gap-0.5">
                        {row.order === "ordered" && row.controls.length > 1 && (
                          <span
                            data-testid="step-badge"
                            className="flex size-6 items-center justify-center rounded-full border-2 border-ink bg-white font-display text-xs font-extrabold"
                          >
                            {j + 1}
                          </span>
                        )}
                        <ControlDrawing control={c} />
                      </span>
                    </Fragment>
                  ))}
                </div>
                {row.controls.length > 1 && (
                  <span className="font-hand text-sm leading-tight text-pencil-grey">
                    {row.order === "ordered" ? t("manual.order_then") : t("manual.order_any")}
                  </span>
                )}
                <span className="flex items-center justify-center gap-1.5">
                  <span className="text-center font-display text-[14px] leading-snug font-semibold">
                    <InkSegments segments={row.do} />
                  </span>
                  <QuickSayButton line={line} />
                </span>
              </div>
              {stamp === i && (
                <span
                  data-testid="row-stamp"
                  className="animate-stamp pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-xl border-[5px] border-lamp-green px-3 font-display text-6xl font-extrabold text-lamp-green mix-blend-multiply"
                >
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
      <WrongSlip actionId={card.action_id} />
    </section>
  );
}
