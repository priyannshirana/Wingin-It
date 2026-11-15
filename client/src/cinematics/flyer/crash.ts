// Flyer `crash` timeline (§F14.2): a white flash, the plane spirals down trailing smoke, vanishes
// in a POOF, the title. Not skippable; the state stays CRASH until both players retry.
import { EXTERIOR_PLANE as P, SHOTS } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, cam, fireOf, planeVisible, put, resetPlane, tw } from "./kit";

export const crash: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const plane = getRef("exteriorPlane");
  b.flash(0, "#FFFFFF", 120);
  resetPlane(tl, 0);
  const s = SHOTS.EXT_SIDE;
  cam(tl, 0, 0, { at: s.position, look: s.target }, "none");
  // 0–3: a cartoon spiral: 720° of roll and 30 m of fall, the camera sinking after it.
  tw(tl, plane?.rotation, { z: Math.PI * 4 }, 0, 3, "power2.in");
  tw(tl, plane?.position, { y: P.y - 30 }, 0, 3, "power2.in");
  cam(tl, 0.3, 2.7, { look: [s.target[0], s.target[1] - 14, s.target[2]] }, "power1.in");
  for (const side of ["left", "right"] as const) {
    tw(tl, fireOf(side), { smoke: 1, flames: 0.5 }, 0.2, 0.4, "power2.out");
  }
  // 3.2: the plane vanishes in a puff, with a softened boom.
  tl.addLabel("hero", 3.2);
  planeVisible(tl, false, 3.2);
  b.sound("boom", 3.2);
  b.flash(3.2, "#FFFFFF", 500, 0.7);
  put(tl, plane?.rotation, { z: 0 }, 3.2);
  for (const side of ["left", "right"] as const) {
    put(tl, fireOf(side), { smoke: 0, flames: 0 }, 3.2);
  }
  b.title({ kind: "text", key: "crash.title" }, 4, 4.6);
};
