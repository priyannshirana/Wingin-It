// Flyer `p1_seat` timeline (§F14.2): the captain's seat slides back 0.4 m (elastic), he snores.
import { moveTo } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, shake, tw } from "./kit";

export const p1_seat: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const seat = getRef("pilotSeat");
  const pose = getRef("pilot")?.pose;
  tl.add(moveTo("PILOT", 0.6), 0);
  // Hero: the seat slides (0.6 s) with a thud and a bigger Zzz.
  tl.addLabel("hero", 0.6);
  tw(tl, seat?.position, { z: 0.7 }, 0.6, 1.2, "elastic.out(1, 0.5)");
  b.sound("snore", 0.6);
  b.sound("clunk", 0.6);
  shake(tl, 0.15, 0.5, 0.6);
  tw(tl, pose, { zzzScale: 1.6 }, 0.6, 0.35, "back.out(1.7)");
  tw(tl, pose, { zzzScale: 1 }, 2.2, 0.3, "power2.inOut");
  tl.add(moveTo("OVERHEAD", 0.6), 2.4);
};
