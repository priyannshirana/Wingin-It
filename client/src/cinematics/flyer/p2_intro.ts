// Flyer `p2_intro` timeline (§F14.2): the engine explodes (exterior), the cockpit shakes, a whip
// to the burning wing, the title, then the pedestal. End = the phase 2 start world.
import { cut, fireWindowShot, moveTo, SHOTS, whip } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder, phaseCard } from "../timelineKit";
import {
  beats,
  cam,
  fireOf,
  lookP2,
  mirror,
  put,
  putLook,
  resetPlane,
  rigAt,
  shake,
  tw,
} from "./kit";
import type { Side } from "../../net/protocol";

export const p2_intro: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const side: Side = ctx.params.fire_side === "left" ? "left" : "right";
  const fire = fireOf(side);
  const s = SHOTS.EXT_SIDE;
  const left = side === "left";
  // The camera looks at the plane from the burning side.
  const at0 = mirror([s.position[0], s.position[1], s.position[2]], left);
  const look0 = mirror([s.target[0], s.target[1], s.target[2]], left);
  // Where the scene stands before the bang (a retry restarts from the phase 1 world).
  if (ctx.retry) putLook(tl, { ...lookP2(side), fire: null, rig: "night_calm", seatZ: 0.7 }, 0);
  else resetPlane(tl, 0);
  const bang = lookP2(side);
  put(tl, fire, { flames: 0, smoke: 0, size: 1, flicker: 0, boom: 0, foam: 0, snuff: 0 }, 0);
  cam(tl, 0, 0, { at: at0, look: look0 }, "none");
  cam(tl, 0, 1, { at: [at0[0] + (left ? 0.5 : -0.5), at0[1], at0[2] - 0.3] }, "none");

  // 0.8: the engine explodes: white flash, boom, a fireball, then the flames and the smoke.
  tl.addLabel("hero", 0.8);
  b.flash(0.8, "#FFFFFF", 60);
  b.sound("boom", 0.8);
  tw(tl, fire, { boom: 1 }, 0.8, 0.6, "power2.out");
  tw(tl, fire, { flames: 1, smoke: 1, size: 1 }, 0.8, 0.2, "power2.out");
  tl.call(() => getRef("lightRig")?.setRig("fire", 0.3), [], 1);

  // 1: inside. The cabin shakes, the bell starts.
  tl.add(cut("FLYER_DEFAULT"), 1);
  shake(tl, 1, 1.2, 1);
  rigAt(tl, "fire", 0.3, 1);
  tl.call(() => ctx.sfx.loop("fire_bell", true), [], 1);
  // 2.5: whip to the burning wing, hold until 5.
  tl.add(whip(fireWindowShot(side)), 2.5);
  tl.add(moveTo("FLYER_DEFAULT", 1), 5);
  tl.addLabel("title", 6);
  b.title(phaseCard(2), 6, 7.6);
  tl.add(moveTo("PEDESTAL", 1), 8);
  // End = the phase 2 world (fog 0.006; the fireball is done).
  tw(tl, getRef("weather"), { fog: bang.fog }, 6, 2);
};
