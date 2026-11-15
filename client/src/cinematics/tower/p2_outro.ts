import { type Builder } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p2_outro (8 s): storm blobs drift in over the radar and the static rises (world
// audio); the manual closes to the cover at 7.
export const p2_outro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  b.cue("storm_in", 0);
  tl.addLabel("hero", at(7));
  b.sound("page_turn", at(7));
  b.cue("manual_close", at(7));
};
