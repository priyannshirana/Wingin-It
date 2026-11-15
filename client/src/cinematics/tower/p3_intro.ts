// Tower `p3_intro` timeline (§F14.4). Owned by the Tower cinematics work; edit only this file.
import { type Builder, phaseCard, title } from "../timelineKit";

export const p3_intro: Builder = (tl, ctx, at) => {
  title(tl, ctx, phaseCard(3), at(2.5), at(5));
};
