// Flyer `p2_outro` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, moveTo, pitchTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p2_outro: Builder = (tl, _ctx, at) => {
  tl.add(cut("PEDESTAL"), 0);
  tl.add(pitchTo(-5, at(1.5)), 0);
  tl.add(moveTo("FLYER_DEFAULT", at(1.2)), at(2));
  tl.add(pitchTo(0, at(1)), at(6.5));
};
