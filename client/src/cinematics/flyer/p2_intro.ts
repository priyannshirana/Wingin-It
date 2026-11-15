// Flyer `p2_intro` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, fireWindowShot, moveTo, shakeFor, whip } from "../cameraRig";
import { type Builder, phaseCard, title } from "../timelineKit";

export const p2_intro: Builder = (tl, ctx, at) => {
  tl.add(cut("FLYER_DEFAULT"), at(1));
  tl.add(shakeFor(1.0, at(1.2)), at(1));
  tl.add(whip(fireWindowShot(ctx.params.fire_side)), at(2.5));
  tl.add(moveTo("FLYER_DEFAULT", at(1)), at(5));
  title(tl, ctx, phaseCard(2), at(6), at(8));
  tl.add(moveTo("PEDESTAL", at(1)), at(8));
};
