// Flyer `p2_extinguish` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { fireWindowShot, moveTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p2_extinguish: Builder = (tl, ctx, at) => {
  tl.add(moveTo(fireWindowShot(ctx.params.fire_side), at(0.5)), 0);
  tl.add(moveTo("PEDESTAL", at(0.6)), at(2.4));
};
