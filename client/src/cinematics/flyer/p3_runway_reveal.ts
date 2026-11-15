// Flyer `p3_runway_reveal` timeline (§F14.2): the landing lights come on, the fog thins, the
// runway lights appear far ahead, a glance out of the windshield and back to the front panel.
import { moveTo } from "../cameraRig";
import { LANDING_LIGHTS } from "../../scene/env/drivers";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, tw } from "./kit";

export const p3_runway_reveal: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const run = getRef("runway");
  tw(tl, LANDING_LIGHTS, { on: 1 }, 0, 0.5, "power1.out");
  tw(tl, getRef("weather"), { fog: 0.012 }, 0.5, 2);
  tw(tl, getRef("clouds"), { storm: 0.85 }, 0.5, 2);
  // 0.8: the runway appears at z −600 and its edge lights fade in.
  tl.addLabel("hero", 0.8);
  tw(tl, run?.place, { shown: 1 }, 0.8, 1.6, "power1.out");
  tw(tl, run?.stream, { lights: 1 }, 0.8, 1.6, "power1.out");
  b.sound("sparkle", 1.2);
  tl.add(moveTo("FLYER_DEFAULT", 0.8), 1);
  tl.add(moveTo("FRONT", 0.8), 3.2);
};
