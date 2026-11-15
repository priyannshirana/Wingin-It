// Flyer `p2_extinguish` timeline (§F14.2): foam on the burning wing, the flames die to a wisp.
import { fireWindowShot, moveTo } from "../cameraRig";
import { type Builder } from "../timelineKit";
import { beats, fireOf, rigAt, shake, tw } from "./kit";
import type { Side } from "../../net/protocol";

export const p2_extinguish: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const side: Side = ctx.params.fire_side === "left" ? "left" : "right";
  const fire = fireOf(side);
  tl.add(moveTo(fireWindowShot(side), 0.5), 0);
  tl.addLabel("hero", 0.5);
  b.sound("whoosh", 0.5);
  shake(tl, 0.15, 0.4, 0.5);
  tw(tl, fire, { foam: 1 }, 0.5, 0.8, "power1.out"); // the foam burst
  tw(tl, fire, { flames: 0, size: 0.7 }, 0.5, 1, "power2.in"); // the flames shrink away
  tw(tl, fire, { smoke: 0.2 }, 1, 1, "power2.out"); // the smoke thins to a wisp
  tl.call(() => ctx.sfx.loop("fire_bell", false), [], 0.5);
  rigAt(tl, "night_calm", 1, 0.5);
  tl.add(moveTo("PEDESTAL", 0.6), 2.4);
};
