// Flyer `p1_intro` timeline (§F14.2): 1.2 s (3.2 s on retry). Retry: the phase title for 2 s
// first, over the phase-1 scene. Then `moveTo(OVERHEAD, 1.2)`.
import { moveTo } from "../cameraRig";
import { type Builder, phaseCard } from "../timelineKit";
import { beats, LOOK_P1, putLook } from "./kit";
import { cut } from "../cameraRig";

export const p1_intro: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  let t0 = 0;
  if (ctx.retry) {
    // After a crash the scene is the wreck: restart from the phase-1 world, inside the cockpit.
    putLook(tl, LOOK_P1, 0);
    tl.add(cut("FLYER_DEFAULT"), 0);
    b.title(phaseCard(1), 0, 2);
    t0 = 2;
  }
  tl.addLabel("settle", t0);
  tl.add(moveTo("OVERHEAD", 1.2), t0);
};
