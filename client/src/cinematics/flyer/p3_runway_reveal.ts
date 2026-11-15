// Flyer `p3_runway_reveal` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { moveTo } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const p3_runway_reveal: Builder = (tl, _ctx, at) => {
  tl.add(moveTo("FLYER_DEFAULT", at(0.8)), at(1));
  tl.add(moveTo("FRONT", at(0.8)), at(3.2));
};
