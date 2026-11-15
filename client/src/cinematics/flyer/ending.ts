// Flyer `ending` timeline (§F14.2). Owned by the Flyer cinematics work; edit only this file.
import { type Builder, endingCard, title } from "../timelineKit";

export const ending: Builder = (tl, ctx, at) => {
  title(tl, ctx, endingCard(ctx.params), at(0.5), at(6));
};
