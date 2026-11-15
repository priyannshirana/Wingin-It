// Tower `prologue` timeline (§F14.4). Owned by the Tower cinematics work; edit only this file.
import { type Builder, phaseCard, title } from "../timelineKit";

export const prologue: Builder = (tl, ctx, at) => {
  title(tl, ctx, phaseCard(1), at(10), at(12));
};
