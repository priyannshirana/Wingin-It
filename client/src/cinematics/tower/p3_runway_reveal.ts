import { type Builder } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p3_runway_reveal (4 s): the runway icon brightens and pulses twice.
export const p3_runway_reveal: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(0.5));
  // SPEC-ASSUMPTION: the pulse runs 0.5–3 s with a soft chime — §F14.4 gives no times; it
  // starts after a short beat and settles before the camera returns on the Flyer.
  b.sound("chime_soft", at(0.5));
  b.cue("runway_pulse", at(0.5), at(3));
};
