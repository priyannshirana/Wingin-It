import { type Builder, phaseCard } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p1_intro (1.2 s; retry 3.2 s): the manual cover opens (0.6 s) and the first card slides
// in. On a retry the phase 1 title card shows for 2 s first.
export const p1_intro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  const open = ctx.retry ? at(2) : 0;
  if (ctx.retry) b.title(phaseCard(1), 0, at(2));
  tl.addLabel("hero", open);
  b.sound("page_turn", open);
  b.cue("manual_open", open); // held: the manual stays open into PLAYING
};
