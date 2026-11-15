import { useEffect, useRef } from "react";
import { useT } from "../../i18n/useT";
import type { ActionResult } from "../../net/protocol";
import { useStore } from "../../state/store";
import { InkSegments } from "./InkSegments";

export const SLIP_MS = 3000;
export const CROSS_MS = 600;

const MARK = "\u0000";

/**
 * §F12.3 item 7: on a wrong action for this step, the grid flashes a red ✗ for 600 ms and a slip
 * lies over it for 3 s: "Flyer used: <control> ×count". Keyed by the result, so each wrong action
 * replays once; its clock starts at the result's arrival, so a late mount shows the right moment.
 */
export function WrongSlip({ actionId }: { actionId: string }) {
  const res = useStore((s) => s.lastResult);
  if (!res || res.success || !res.used || res.action_id !== actionId) return null;
  return <Slip key={res.at} used={res.used} at={res.at} />;
}

function Slip({ used, at }: { used: NonNullable<ActionResult["used"]>; at: number }) {
  const t = useT();
  const slip = useRef<HTMLDivElement>(null);
  const cross = useRef<HTMLSpanElement>(null);
  const [before = "", after = ""] = t("tower.flyer_used", { control: MARK }).split(MARK);

  useEffect(() => {
    const elapsed = Math.max(0, Date.now() - at);
    const anims: Animation[] = [];
    const s = slip.current;
    const c = cross.current;
    if (s && typeof s.animate === "function") {
      const a = s.animate(
        [
          { opacity: 0, transform: "translateY(-6px) scale(1.08)", offset: 0 },
          { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.06 },
          { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.92 },
          { opacity: 0, transform: "translateY(0) scale(1)", offset: 1 },
        ],
        { duration: SLIP_MS, fill: "forwards", easing: "ease-out" },
      );
      a.currentTime = Math.min(elapsed, SLIP_MS);
      anims.push(a);
    }
    if (c && typeof c.animate === "function") {
      const a = c.animate(
        [
          { opacity: 0, transform: "scale(1.6)" },
          { opacity: 0.9, transform: "scale(1)", offset: 0.25 },
          { opacity: 0, transform: "scale(1)" },
        ],
        { duration: CROSS_MS, fill: "forwards" },
      );
      a.currentTime = Math.min(elapsed, CROSS_MS);
      anims.push(a);
    }
    return () => anims.forEach((a) => a.cancel());
  }, [at]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="wrong-slip">
      <span
        ref={cross}
        aria-hidden="true"
        data-testid="wrong-cross"
        className="absolute inset-0 flex items-center justify-center font-display text-[120px] leading-none font-extrabold text-wrong-ink opacity-0"
      >
        ✗
      </span>
      <div
        ref={slip}
        className="absolute inset-x-4 top-1/2 -translate-y-1/2 -rotate-3 rounded-lg border-[3px] border-wrong-ink bg-white px-3 py-2 text-center font-display text-[17px] leading-snug font-semibold text-ink shadow-[0_8px_18px_rgb(0_0_0/0.25)]"
      >
        <span>{before}</span>
        <b className="font-extrabold">
          <InkSegments segments={used.label} />
        </b>
        <span>{after}</span>
        {used.count > 1 && (
          <span className="ml-1.5 rounded-full bg-ink px-2 font-extrabold text-white">
            ×{used.count}
          </span>
        )}
      </div>
    </div>
  );
}
