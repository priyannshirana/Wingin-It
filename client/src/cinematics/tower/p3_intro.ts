import { type Builder, phaseCard } from "../timelineKit";
import { beats, LIGHTNING_MS, WHITE } from "./beats";

// §F14.4 p3_intro (7 s): 2 is the hero: the lightning flash (60 ms white at 40 %), with thunder
// 0.8 s later as on the Flyer. 2.5–5 the phase 3 title card; the subtitle column glitches once
// and the three lifeline dots pop in. 5–7 the runway icon and the glide path draw on the radar.
export const p3_intro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(2));
  b.flash(at(2), WHITE, LIGHTNING_MS, 0.4);
  b.sound("thunder", at(2.8));
  b.title(phaseCard(3), at(2.5), at(5));
  // SPEC-ASSUMPTION: the glitch at 2.5 for 0.6 s and the dots pop at 3 — §F14.4 lists both in
  // "2.5–5" without times; staggering them keeps each readable under the title.
  b.cue("subtitle_glitch", at(2.5), at(3.1));
  b.cue("lifeline_dots_pop", at(3), at(5));
  b.cue("glide_draw", at(5)); // held: the path stays drawn into PLAYING
};
