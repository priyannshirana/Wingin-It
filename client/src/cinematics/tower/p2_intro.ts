// Tower `p2_intro` timeline (§F14.4). Owned by the Tower cinematics work; edit only this file.
import { type Builder, phaseCard, title } from "../timelineKit";

export const p2_intro: Builder = (tl, ctx, at) => {
  title(tl, ctx, phaseCard(2), at(6), at(8));
};
