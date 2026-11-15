import { type Builder } from "../timelineKit";
import { beats, LIGHTNING_MS, WHITE } from "./beats";

// §F14.4 lightning_strike (1.5 s): a 60 ms white overlay at 30 %; the radar flickers for 0.5 s.
export const lightning_strike: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", 0);
  b.flash(0, WHITE, LIGHTNING_MS, 0.3);
  // SPEC-ASSUMPTION: a radio crackle with the strike — the Tower hears the storm over the radio.
  b.sound("radio_crackle", 0);
  b.cue("radar_flicker", 0, at(0.5));
};
