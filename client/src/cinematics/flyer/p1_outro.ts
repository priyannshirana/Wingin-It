// Flyer `p1_outro` timeline (§F14.2): the overhead lamps turn green one by one, the sky clears,
// a relieved sting, then the plane flies level.
import { cut, moveTo, SHOTS } from "../cameraRig";
import { getLamp, getRef, lampIds } from "../../scene/sceneRefs";
import { type Builder } from "../timelineKit";
import { beats, cam, rigAt, roll, tw } from "./kit";

const GREEN = "#30E07C";

export const p1_outro: Builder = (tl, ctx, at) => {
  const b = beats(tl, ctx);
  const D = tl.duration();
  tl.add(cut("OVERHEAD"), 0);
  rigAt(tl, "night_calm", 1.5, 0);
  // 0–2: every overhead lamp green, 0.15 s apart (a local override; the server's lamp states
  // take over when the timeline ends).
  const ids = lampIds().filter((id) => id.startsWith("OH_"));
  ids.forEach((id, i) => {
    tl.call(() => getLamp(id)?.setOverride(2.5, GREEN), [], at(0.3) + i * 0.15);
  });
  tl.call(() => ids.forEach((id) => getLamp(id)?.setOverride(null)), [], D);
  roll(tl, 3, at(1), at(1));
  // 2–4: back to the cockpit view, the clouds part, the moon brightens.
  tl.addLabel("hero", at(2));
  tl.add(moveTo("FLYER_DEFAULT", at(1.5)), at(2));
  roll(tl, 0, at(2), at(1.5));
  tw(tl, getRef("clouds"), { density: 0.4 }, at(2), at(2));
  tw(tl, getRef("sky"), { moon: 1.6 }, at(2), at(2));
  b.sound("music_sting", at(2));
  b.sound("sparkle", at(2));
  // 4–6: the plane flies level.
  tl.add(cut("EXT_SIDE"), at(4));
  const s = SHOTS.EXT_SIDE;
  cam(
    tl,
    at(4),
    at(2),
    { at: [s.position[0] - 0.6, s.position[1] + 0.2, s.position[2] - 0.4] },
    "none",
  );
};
