import { type Builder } from "../timelineKit";
import { beats, STAMP_IMPACT_S } from "./beats";

// §F14.4 landing (7 s): 0–3 the blip parks. 3 is the hero: the LANDED stamp (thump + jolt),
// confetti (2 s) and a sting, and the screen warms (a dawn gradient at 20 %).
export const landing: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(3));
  b.sound("stamp", at(3) + STAMP_IMPACT_S);
  // SPEC-ASSUMPTION: a music sting on the stamp — the spec names no sound for the Tower here.
  b.sound("music_sting", at(3));
  b.cue("landed_stamp", at(3)); // held into ENDING
  // SPEC-ASSUMPTION: confetti 3–5 s — "60 DOM particles, 2 s" from the stamp's 3 s beat (§F12.2).
  b.cue("confetti", at(3), at(5));
  b.cue("dawn_warm", at(3)); // held: the ending keeps the same warmth
};
