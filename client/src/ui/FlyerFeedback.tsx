import { useEffect } from "react";
import { fxShake } from "../cinematics/cameraFx";
import { flashStationRim } from "../scene/rimFx";
import { useStore } from "../state/store";
import { WRONG_SHAKE } from "./feedback";
import { useFxVisuals } from "./useFxVisuals";

const PIPS = '[data-testid="progress-pips"] > span';
const TEAL = "#2ec4b6";

// The Flyer's §F15 action feedback (no input lock) and the §A12 fx visuals:
// - wrong: the red vignette pulse (Overlays) and `shakeFor(0.5, 0.35)` (the red "−10" is the fuel
//   bar's FuelDelta);
// - correct: the green rim flash on the station (scene/StationRim) and a pop on the new pip.
// The control's bounce / own animation is the part's job (§F9.6). Sounds: useWorldAudio.
export function FlyerFeedback() {
  useFxVisuals("flyer");

  useEffect(() => {
    let lastResult = useStore.getState().lastResult;
    return useStore.subscribe((s, p) => {
      const r = s.lastResult;
      if (r !== p.lastResult && r && r !== lastResult) {
        lastResult = r;
        if (r.success) {
          flashStationRim();
        } else {
          s.redPulse();
          fxShake(WRONG_SHAKE.amount, WRONG_SHAKE.seconds);
        }
      }
      const done = s.game?.completed ?? 0;
      const prevDone = p.game?.completed ?? 0;
      if (done > prevDone && s.game?.phase === p.game?.phase) popPip(done - 1);
    });
  }, []);

  return null;
}

/** A teal ring bursting off the pip that just filled (the pip's own CSS pop plays underneath). */
function popPip(index: number): void {
  const pip = document.querySelectorAll<HTMLElement>(PIPS)[index];
  if (!pip || typeof pip.animate !== "function") return;
  pip.animate(
    [
      { scale: "1", boxShadow: `0 0 0 0 ${TEAL}` },
      { scale: "1.6", boxShadow: `0 0 0 6px rgb(46 196 182 / 0.6)`, offset: 0.35 },
      { scale: "1", boxShadow: `0 0 0 12px rgb(46 196 182 / 0)` },
    ],
    { duration: 450, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}
