import { type Builder, phaseCard } from "../timelineKit";
import { beats, STAMP_IMPACT_S } from "./beats";

// §F14.4 prologue (12 s; demo 6 s = every time ×0.5): the radar boots while the blip cruises.
// 8.5 is the hero beat: a radio crackle, the MAYDAY stamp slam (thump + jolt) and a soft red
// flash. 10–12 the phase 1 title card (the stamp sits below it).
export const prologue: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("boot", 0);
  // SPEC-ASSUMPTION: the boot animation runs in the first 2.5 s (×0.5 in demo) — "0–8.5" names
  // the cruise; a short boot then a live sweep reads better and keeps a late join from replaying it.
  b.cue("radar_boot", 0, at(2.5));
  tl.addLabel("hero", at(8.5));
  b.sound("radio_crackle", at(8.5));
  b.sound("stamp", at(8.5) + STAMP_IMPACT_S);
  // SPEC-ASSUMPTION: a soft red flash (160 ms at 25 %) completes the hero triple (§F0.5) on a
  // screen that has no camera shake — the Tower's beat otherwise has only sound and the slam.
  b.flash(at(8.5), "#E5484D", 160, 0.25);
  // SPEC-ASSUMPTION: the stamp holds to the end and leaves with the next cinematic (the runner
  // clears cues) — the spec gives its start only; holding avoids a pop before PHASE_INTRO.
  b.cue("mayday_stamp", at(8.5));
  b.title(phaseCard(1), at(10), at(12));
};
