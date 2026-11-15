import { type Builder } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p3_touchdown (6 s): 0–2 the blip slides onto the runway icon (game_state); at 2 the
// blip gives a small bounce.
export const p3_touchdown: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(2));
  b.cue("blip_touchdown", at(2), at(3));
};
