import { type Builder, phaseCard } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p2_intro (9 s): 0.8 is the hero on the Tower: the CSS screen shake (0.6 s), a radio
// crackle and a soft orange flash; the blip turns red and the fire icon pops in. 6–8 the phase 2
// title card. No side is ever shown.
export const p2_intro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(0.8));
  // SPEC-ASSUMPTION: crackle + a 140 ms orange flash at 22 % with the shake — the Tower can't
  // hear the explosion, so the radio carries it; the flash completes the §F0.5 triple.
  b.sound("radio_crackle", at(0.8));
  b.flash(at(0.8), "#FF7A1A", 140, 0.22);
  b.cue("screen_shake", at(0.8), at(1.4));
  b.cue("fire_icon", at(0.8)); // held: the fire stays on the radar into PLAYING
  b.title(phaseCard(2), at(6), at(8));
};
