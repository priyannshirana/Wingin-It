import { type Builder } from "../timelineKit";
import { beats } from "./beats";

// §F14.4 p2_extinguish (3 s): 0.5–1.5 the fire icon morphs into the smoke icon; the blip turns
// amber (game_state).
export const p2_extinguish: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  tl.addLabel("hero", at(0.5));
  // SPEC-ASSUMPTION: the extinguisher hiss under the morph — no Tower sound is specified.
  b.sound("fuel_hiss", at(0.5));
  b.cue("smoke_icon", at(0.5)); // held: smoke stays on the radar into PLAYING
};
