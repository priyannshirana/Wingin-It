// Flyer `p3_intro` timeline (§F14.2): turbulence for the whole phase, a lightning double flash,
// the title, then the front panel. End = the phase 3 start world.
import { cut, moveTo } from "../cameraRig";
import { rig } from "../cameraRig";
import { type Builder, phaseCard } from "../timelineKit";
import { beats, lightning, lookP3, put, putLook, shake } from "./kit";
import type { Side } from "../../net/protocol";
import { HOLD } from "../tower/beats";

export const p3_intro: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const side: Side = ctx.params.damaged_side === "left" ? "left" : "right";
  const look = lookP3(side);
  if (ctx.retry) putLook(tl, look, 0);
  tl.add(cut("FLYER_DEFAULT"), 0);
  put(tl, rig, { restShake: 0.15 }, 0);
  // 2: the lightning double flash, thunder at 2.8.
  tl.addLabel("hero", 2);
  lightning(tl, 2);
  b.flash(2, "#DFE8FF", 80);
  shake(tl, 0.3, 0.5, 2, 0.15);
  b.sound("thunder", 2.8);
  // 2.5–5: the title; the subtitle bar glitches once; the lifeline dots pop in.
  b.title(phaseCard(3), 2.5, 4.6);
  b.cue("subtitle_glitch", 2.6, 3.1);
  b.cue("lifeline_dots_pop", 3.2, HOLD);
  tl.add(moveTo("FRONT", 1.5), 5);
};
