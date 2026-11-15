// Flyer `prologue` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { cut, rollTo, whip } from "../cameraRig";
import { type Builder, phaseCard, title } from "../timelineKit";

export const prologue: Builder = (tl, ctx, at) => {
  // SPEC-ASSUMPTION: M1 has no exterior plane yet, so the EXT_CHASE opener is the wide
  // interior; M3b restores the exterior shot.
  tl.add(cut("WIDE_INTERIOR"), 0);
  tl.add(rollTo(6, at(1)), at(5));
  tl.add(whip("FLYER_DEFAULT"), at(7));
  tl.add(rollTo(0, at(1.5)), at(7));
  title(tl, ctx, phaseCard(1), at(10), at(12));
};
