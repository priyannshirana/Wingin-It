import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { useFxVisuals } from "./useFxVisuals";

const CURRENT_DOT = '[data-testid="progress-dots"] > [data-state="current"]';
const INK = "#1F1F1F";

// The Tower's §F15 action feedback and its §A12 visuals (`both:*` only; `fx:*` never plays here,
// and nothing reveals the fire side or a lamp color). Already owned elsewhere: the green ✓ stamp
// on `row_index` (RuleTable), the ✗ flash + "Flyer used" slip (WrongSlip), the fuel "−10"
// (FuelDelta). This adds the progress dot filling with a pop on a correct action: the server's
// next card marks it done, so the fill holds until that card replaces it.
export function TowerFeedback() {
  useFxVisuals("tower");
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastResult = useStore.getState().lastResult;
    let filled: Animation | null = null;
    const clear = () => {
      filled?.cancel();
      filled = null;
    };
    const unsub = useStore.subscribe((s, p) => {
      if (s.card !== p.card) clear();
      const r = s.lastResult;
      if (r === p.lastResult || !r || r === lastResult) return;
      lastResult = r;
      if (!r.success || s.card?.action_id !== r.action_id) return;
      const root = anchor.current?.closest("[data-screen]") ?? document;
      const dot = root.querySelector<HTMLElement>(CURRENT_DOT);
      if (!dot || typeof dot.animate !== "function") return;
      clear();
      filled = dot.animate(
        [
          { scale: "1", boxShadow: `inset 0 0 0 0 ${INK}` },
          { scale: "1.7", boxShadow: `inset 0 0 0 8px ${INK}`, offset: 0.4 },
          { scale: "1", boxShadow: `inset 0 0 0 8px ${INK}` },
        ],
        { duration: 250, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" },
      );
    });
    return () => {
      unsub();
      clear();
    };
  }, []);

  return <span ref={anchor} hidden />;
}
