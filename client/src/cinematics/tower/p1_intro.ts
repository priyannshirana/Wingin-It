// Tower `p1_intro` timeline (§F14.4). Owned by the Tower cinematics work; edit only this file.
import { type Builder, phaseCard, title } from "../timelineKit";

export const p1_intro: Builder = (tl, ctx, at) => {
  if (!ctx.retry) return;
  title(tl, ctx, phaseCard(1), 0, at(2));
};
