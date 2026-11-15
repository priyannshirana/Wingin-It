import { type Builder } from "../timelineKit";
import { beats, TITLE_OUT_S } from "./beats";
import { windowShot } from "./window";

// §F14.4 crash: the tower window shows the spiral and the POOF on the horizon (0–3.2); then the
// blip spirals off the radar and pops, and crash.title at 4.
const WINDOW_S = 3.2;
const POOF_S = 2.6;

export const crash: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  windowShot(tl, b, "crash", 0, at(WINDOW_S));
  b.sound("whoosh", 0);
  tl.addLabel("hero", at(POOF_S));
  b.sound("boom", at(POOF_S));
  b.cue("blip_spiral", at(WINDOW_S));
  b.cue("poof", at(WINDOW_S) + 0.7); // the radar spiral takes 0.7 s
  b.title({ kind: "text", key: "crash.title" }, at(4), at(5) - TITLE_OUT_S);
};
