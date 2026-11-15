import { type Builder } from "../timelineKit";
import { beats, STAMP_IMPACT_S } from "./beats";
import { windowShot } from "./window";

// §F14.4 landing: the tower window shows the dawn arrival (0–5.5; it slides away over 0.5 s),
// then the LANDED stamp + confetti and the dawn warmth.
const WINDOW_S = 5.5;
const HERO_S = 6;

export const landing: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  windowShot(tl, b, "landing", 0, WINDOW_S);
  b.sound("whoosh", 0.8);
  b.sound("clunk", WINDOW_S * 0.3); // the touchdown
  tl.addLabel("hero", HERO_S);
  b.sound("stamp", HERO_S + STAMP_IMPACT_S);
  b.sound("music_sting", HERO_S);
  b.cue("landed_stamp", HERO_S); // held into ENDING
  b.cue("confetti", HERO_S, tl.duration()); // done at the end
  b.cue("dawn_warm", HERO_S); // held: the ending keeps the same warmth
};
