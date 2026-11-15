import { Fragment } from "react";
import { useT } from "../../i18n/useT";
import type { ManualCard } from "../../net/protocol";
import { useStore } from "../../state/store";
import { ControlDrawing } from "./ControlDrawing";
import { InkSegments } from "./InkSegments";
import { PointingHand } from "./PointingHand";
import { QuickSayButton } from "./QuickSayButton";
import { ValuePictogram } from "./ValuePictogram";

// The pictogram-first rule grid (§F12.3 left page, item 4): one column per possible value, a
// big value pictogram on top, the action as big control drawings below, small highlighted labels.
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
      className="grid flex-none rounded-2xl border-[3.5px] border-ink bg-white"
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
            className={`relative flex flex-col items-center ${i > 0 ? "border-l-2 border-ink/25" : ""}`}
          >
            <header className="flex w-full flex-col items-center gap-0.5 border-b-2 border-ink/25 bg-[#F4EFE4] px-2 py-1.5">
              {row.when ? (
                <>
                  <ValuePictogram
                    size={50}
                    swatch={row.when.swatch}
                    flame={fireSide && row.when.swatch.kind === "side"}
                  />
                  <span className="font-display text-sm font-semibold">
                    <InkSegments segments={row.when.label} />
                  </span>
                </>
              ) : (
                <>
                  <PointingHand size={50} />
                  {sayOnly && (
                    <span className="font-display text-sm font-semibold text-ink/70">
                      {t("manual.do_only")}
                    </span>
                  )}
                </>
              )}
            </header>
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-2">
              <div className="flex flex-wrap items-center justify-center gap-1">
                {row.controls.map((c, j) => (
                  <Fragment key={`${c.object_id}-${j}`}>
                    {j > 0 && (
                      <span
                        className="px-1 font-display text-2xl font-extrabold"
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
                <span className="font-hand text-sm text-pencil-grey">
                  {row.order === "ordered" ? t("manual.order_then") : t("manual.order_any")}
                </span>
              )}
              <span className="flex items-center justify-center gap-2">
                <span className="text-center font-display text-[15px] leading-snug font-semibold">
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
    </section>
  );
}
