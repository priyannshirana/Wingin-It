// Flyer `p2_outro` timeline (§F14.2): the plane sinks into a storm with one propeller stopped.
import { cut, EXTERIOR_PLANE as P, moveTo } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, lightning, pitch, put, rigAt, shake, tw } from "./kit";
import type { Side } from "../../net/protocol";

export const p2_outro: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const side: Side = ctx.params.stopped_side === "left" ? "left" : "right";
  const plane = getRef("exteriorPlane");
  const clouds = getRef("clouds");
  const sky = getRef("sky");
  const weather = getRef("weather");
  tl.add(cut("PEDESTAL"), 0);
  pitch(tl, -5, 0, 1.5);
  // 2–4: back to the windshield; the clouds darken, the first drops.
  tl.add(moveTo("FLYER_DEFAULT", 1.2), 2);
  tw(tl, clouds, { storm: 0.6, density: 1.5 }, 2, 4, "power1.inOut");
  tw(tl, sky, { storm: 0.6 }, 2, 4, "power1.inOut");
  tw(tl, weather, { droplets: 20 }, 2, 2);
  // 4–6.5: outside: the plane, one propeller stopped, sinks into black cloud.
  tl.addLabel("exterior", 4);
  tl.add(cut("EXT_CHASE"), 4);
  tw(tl, getRef("propellers"), { [side]: 0 }, 4, 2.5, "power1.out");
  tw(tl, plane?.position, { y: P.y - 3 }, 4, 2.5, "power2.in");
  tw(tl, sky, { moon: 0.2, stars: 0.3 }, 4, 2.5);
  // Hero: distant lightning, twice.
  tl.addLabel("hero", 5);
  lightning(tl, 5);
  b.flash(5, "#DFE8FF", 70, 0.3);
  b.sound("thunder", 5.2);
  lightning(tl, 5.9);
  // 6.5–8: back in the cockpit; heavy rain, the storm light.
  put(tl, plane?.position, { x: P.x, y: P.y, z: P.z }, 6.5);
  tl.add(cut("FLYER_DEFAULT"), 6.5);
  shake(tl, 0.2, 0.6, 6.5);
  rigAt(tl, "storm", 1.5, 6.5);
  tw(tl, getRef("weather"), { rain: 1, droplets: 40, fog: 0.035 }, 6.5, 1.5);
  tw(tl, clouds, { storm: 1, density: 2 }, 6.5, 1.5);
  tw(tl, sky, { storm: 1, moon: 0, stars: 0 }, 6.5, 1.5);
  pitch(tl, 0, 6.5, 1);
};
