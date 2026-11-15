// Flyer `p1_seat` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { moveTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p1_seat: Builder = (tl, _ctx, at) => {
  tl.add(moveTo("PILOT", at(0.6)), 0);
  tl.add(moveTo("OVERHEAD", at(0.6)), at(2.4));
};
