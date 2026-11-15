// Flyer `crash` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, rollTo, shakeFor } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const crash: Builder = (tl, _ctx, at) => {
  tl.add(cut("WIDE_INTERIOR"), 0);
  tl.add(shakeFor(1, at(1.5)), 0);
  tl.add(rollTo(0, 0), 0);
};
