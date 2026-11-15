// Flyer `landing` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, pitchTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const landing: Builder = (tl, _ctx, at) => {
  tl.add(cut("FLYER_DEFAULT"), 0);
  tl.add(pitchTo(4, at(0.4)), at(0.5));
  tl.add(pitchTo(0, at(1)), at(0.9));
  tl.add(cut("WIDE_INTERIOR"), at(5));
};
