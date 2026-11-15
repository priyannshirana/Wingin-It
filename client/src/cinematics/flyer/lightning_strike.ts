// Flyer `lightning_strike` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { shakeFor } from "../cameraRig";
import { type Builder } from "../timelineKit";

export const lightning_strike: Builder = (tl, _ctx, at) => {
  tl.add(shakeFor(0.4, at(0.5)), 0);
};
