// Flyer `p3_touchdown` timeline (§F14.2): the runway rises to the wheels, touchdown with a bump,
// the runway streams past, then back to the front panel.
import { moveTo, rig, SHOTS } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, put, shake, tw } from "./kit";

export const p3_touchdown: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const run = getRef("runway");
  const avatar = getRef("flyerAvatar")?.pose;
  const eye = SHOTS.FLYER_DEFAULT.position;
  tl.add(moveTo("FLYER_DEFAULT", 0.8), 0);
  // 0–2: the runway slides up under the plane; the approach lights streak past.
  tw(tl, run?.place, { y: -1.2, z: 300 }, 0, 2, "power2.in");
  tw(tl, run?.stream, { speed: 60 }, 0.2, 1.8, "power2.in");
  tw(tl, avatar, { brace: 1 }, 1.6, 0.4, "power2.out");
  // 2: touchdown: a bump of the camera, the screech, a shake, a flash of sparks.
  tl.addLabel("hero", 2);
  tw(tl, rig.position, { y: eye[1] - 0.08 }, 2, 0.08, "power2.out");
  tw(tl, rig.position, { y: eye[1] }, 2.08, 0.12, "power2.in");
  b.sound("screech", 2);
  b.flash(2, "#FFB347", 160, 0.3);
  put(tl, rig, { restShake: 0 }, 2);
  shake(tl, 0.6, 1, 2, 0);
  tw(tl, avatar, { brace: 0 }, 4, 0.5);
  // 2–5: the rain lightens.
  tw(tl, getRef("weather"), { rain: 0.4, droplets: 20 }, 2, 2.5);
  tw(tl, getRef("sky"), { storm: 0.7 }, 2, 2.5);
  tw(tl, getRef("clouds"), { storm: 0.5, density: 1.5 }, 2, 2.5);
  tl.add(moveTo("FRONT", 1), 5);
};
