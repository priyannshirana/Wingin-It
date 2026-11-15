// Flyer `p1_intro` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { moveTo } from "../cameraRig";
import { type Builder, phaseCard, title } from "../timelineKit";

export const p1_intro: Builder = (tl, ctx, at) => {
  // Retry: the phase title for 2 s first, then the move (3.2 s total); otherwise just the move.
  if (ctx.retry) {
    title(tl, ctx, phaseCard(1), 0, at(2));
    tl.add(moveTo("OVERHEAD", at(1.2)), at(2));
  } else {
    tl.add(moveTo("OVERHEAD", at(1.2)), 0);
  }
};
