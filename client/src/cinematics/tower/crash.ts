import { type Builder } from "../timelineKit";
import { beats, TITLE_OUT_S } from "./beats";

// §F14.4 crash (5 s, not skippable): the blip spirals off the radar and pops into a tiny POOF
// (the hero); 4 `crash.title`; the Retry overlay (Overlays.tsx) takes over from 5 s.
export const crash: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  b.sound("whoosh", 0);
  // Held: the real blip stays hidden under the Retry card until the next cinematic.
  b.cue("blip_spiral", 0);
  // SPEC-ASSUMPTION: the POOF at 2.6 s, after a 2.5 s spiral — "spirals off … pops" has no time;
  // it lands well before the 4 s title so each beat reads alone.
  tl.addLabel("hero", at(2.6));
  b.sound("boom", at(2.6));
  b.cue("poof", at(2.6));
  // SPEC-ASSUMPTION: crash.title is cleared 0.4 s before 5 s, so its fade-out ends exactly when
  // CrashCard shows the same title with Retry (§F20) — never two titles at once.
  b.title({ kind: "text", key: "crash.title" }, at(4), at(5) - TITLE_OUT_S);
};
