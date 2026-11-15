import { type Builder, endingCard } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 ending (6 s; demo 4 s): the same title as the Flyer (`end.landed`, fuel, time) over the
// dawn warmth, then the screen fades to cream before the word deck.
export const ending: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  b.cue("dawn_warm", 0); // continues the landing's warmth (DawnWarm never restarts from 0)
  tl.addLabel("hero", at(0.5));
  // SPEC-ASSUMPTION: a sparkle on the title — the Tower's ending has no specified sound.
  b.sound("sparkle", at(0.5));
  b.title(endingCard(ctx.params), at(0.5), at(6));
  // SPEC-ASSUMPTION: the cream fade starts at 4 s (×4/6 in demo) and holds into DECK — the spec
  // says only "fade to cream"; the last 2 s leave the title fully readable first.
  b.cue("fade_cream", at(4));
};
