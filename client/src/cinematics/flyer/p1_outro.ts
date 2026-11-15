// Flyer `p1_outro` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, moveTo, rollTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p1_outro: Builder = (tl, _ctx, at) => {
  tl.add(cut("OVERHEAD"), 0);
  tl.add(moveTo("FLYER_DEFAULT", at(1.5)), at(2));
  tl.add(rollTo(0, at(1.5)), at(2));
};
