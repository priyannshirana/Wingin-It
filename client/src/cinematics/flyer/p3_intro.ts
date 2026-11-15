// Flyer `p3_intro` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, moveTo, setRestShake, shakeFor } from "../cameraRig";
import { type Builder, phaseCard, title } from "../timelineKit";

export const p3_intro: Builder = (tl, ctx, at) => {
  tl.add(cut("FLYER_DEFAULT"), 0);
  tl.add(setRestShake(0.15), 0);
  tl.add(shakeFor(0.4, at(0.5)), at(2));
  title(tl, ctx, phaseCard(3), at(2.5), at(5));
  tl.add(moveTo("FRONT", at(1.5)), at(5));
};
