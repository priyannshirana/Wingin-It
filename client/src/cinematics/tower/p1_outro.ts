import { type Builder } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p1_outro (6 s): 0–2 every progress dot turns green one by one. 4–6 is the hero: the
// AUTOPILOT ENGAGED banner with a chime (the blip turns green from game_state). The manual closes
// to the cover at 5.4 and stays closed into the next phase.
export const p1_outro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  b.cue("dots_green", 0);
  tl.addLabel("hero", at(4));
  // SPEC-ASSUMPTION: a chime on the banner — the spec names no sound for this beat (§F0.5 triple).
  b.sound("chime", at(4));
  b.cue("autopilot_banner", at(4), at(6)); // "4–6" in §F14.4
  b.sound("page_turn", at(5.4));
  b.cue("manual_close", at(5.4));
};
