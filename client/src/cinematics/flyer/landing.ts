// Flyer `landing` timeline (§F14.2): the runway slows to a stop, dawn breaks, the plane at
// sunrise, and the pilot wakes in the cockpit. End = the "after landing" world.
import { cut, moveTo, SHOTS } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, cam, ext, fireOf, pitch, rigAt, tw, type V3 } from "./kit";
import type { Side } from "../../net/protocol";

export const landing: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const side: Side = ctx.params.damaged_side === "left" ? "left" : "right";
  const run = getRef("runway");
  const pilot = getRef("pilot")?.pose;
  const avatar = getRef("flyerAvatar")?.pose;
  const smoke = fireOf(side);
  // 0–3: the stream slows to nothing, the nose dips, the engines wind down, the sky clears.
  tl.add(moveTo("FLYER_DEFAULT", 0.8), 0);
  tw(tl, run?.stream, { speed: 0 }, 0, 3, "power3.out");
  tw(tl, run?.stream, { lights: 0.45 }, 1, 2);
  b.sound("squeal", 0.2);
  pitch(tl, 4, 0.2, 0.4, "power2.out");
  pitch(tl, 0, 0.6, 1);
  tl.call(() => ctx.sfx.loop("engine_hum", false), [], 2);
  tw(tl, getRef("weather"), { rain: 0, droplets: 0, fog: 0.004 }, 0, 3);
  tw(tl, getRef("clouds"), { storm: 0, density: 1, dawn: 1 }, 0.3, 2.7);
  tw(tl, getRef("sky"), { storm: 0, dawn: 1, sun: 1, moon: 0, stars: 0 }, 0.5, 2.5);
  rigAt(tl, "dawn", 2.5, 0.5);
  // 3–5: outside at sunrise: the stopped plane, a wisp of smoke on the damaged side.
  tl.addLabel("hero", 3);
  tl.add(cut("EXT_FRONT_LOW"), 3);
  const s = SHOTS.EXT_FRONT_LOW;
  const near: V3 = ext(2, -0.7, -7);
  cam(tl, 3, 2, { at: near, look: [s.target[0], s.target[1], s.target[2]] }, "power1.inOut");
  b.flash(3, "#FFE2C4", 300, 0.4);
  b.sound("sparkle", 3);
  tw(tl, smoke, { smoke: 0.7 }, 3, 1, "power2.out");
  tw(tl, smoke, { smoke: 0.2 }, 5, 1.5, "power2.inOut");
  // 5–7: inside: the Flyer cheers, the captain wakes and looks around.
  tl.add(cut("WIDE_INTERIOR"), 5);
  tw(tl, avatar, { cheer: 1 }, 5.2, 0.5, "back.out(1.7)");
  tw(tl, pilot, { slump: 0, zzz: 0 }, 5.2, 0.7, "power2.out");
  tw(tl, pilot, { awake: 1 }, 5.5, 0.2, "none");
  tw(tl, pilot, { question: 1 }, 6.2, 0.5, "back.out(1.7)");
};
