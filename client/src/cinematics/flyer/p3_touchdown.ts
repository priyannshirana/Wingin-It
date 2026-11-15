// Flyer `p3_touchdown` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { moveTo, setRestShake, shakeFor } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p3_touchdown: Builder = (tl, _ctx, at) => {
  tl.add(moveTo("FLYER_DEFAULT", at(0.5)), 0);
  tl.add(shakeFor(0.6, at(1)), at(2));
  tl.add(setRestShake(0), at(2));
  tl.add(moveTo("FRONT", at(1)), at(5));
};
