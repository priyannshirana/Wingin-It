// Flyer `lightning_strike` timeline (§F14.2): a double flash, thunder, the front-panel lamps
// flicker for 1 s, a short shake. The server's object_state then makes the lamp blink.
import { getLamp, lampIds } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, lightning, shake } from "./kit";

const STEP = 0.08;
/** A fixed on/off pattern per lamp (deterministic, so seeking and skipping agree). */
const flicker = (lamp: number, step: number) =>
  (lamp * 7 + step * 5 + (step % 3)) % 4 < 2 ? 0.2 : 2.5;

export const lightning_strike: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", 0);
  lightning(tl, 0);
  b.flash(0, "#DFE8FF", 80);
  b.sound("thunder", 0.3);
  shake(tl, 0.4, 0.5, 0);
  const ids = lampIds().filter((id) => id.startsWith("FP_"));
  for (let step = 0; step < 12; step++) {
    tl.call(
      () => ids.forEach((id, i) => getLamp(id)?.setOverride(flicker(i, step), "#FFF4D6")),
      [],
      0.05 + step * STEP,
    );
  }
  tl.call(() => ids.forEach((id) => getLamp(id)?.setOverride(null)), [], 1.05);
};
