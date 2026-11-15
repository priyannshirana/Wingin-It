// Tower timeline registry (§F14.4): one builder per cinematic id, each in its own file.
// No three.js imports anywhere under cinematics/tower (the Tower bundle stays 2D).
import type { CinematicId } from "../net/protocol";
import { prologue } from "./tower/prologue";
import { p1_intro } from "./tower/p1_intro";
import { p1_seat } from "./tower/p1_seat";
import { p1_outro } from "./tower/p1_outro";
import { p2_intro } from "./tower/p2_intro";
import { p2_extinguish } from "./tower/p2_extinguish";
import { p2_outro } from "./tower/p2_outro";
import { p3_intro } from "./tower/p3_intro";
import { lightning_strike } from "./tower/lightning_strike";
import { p3_runway_reveal } from "./tower/p3_runway_reveal";
import { p3_touchdown } from "./tower/p3_touchdown";
import { landing } from "./tower/landing";
import { ending } from "./tower/ending";
import { crash } from "./tower/crash";
import { buildTimeline, type Builder, type TimelineCtx } from "./timelineKit";

export const towerTimelines: Readonly<Record<CinematicId, Builder>> = {
  prologue,
  p1_intro,
  p1_seat,
  p1_outro,
  p2_intro,
  p2_extinguish,
  p2_outro,
  p3_intro,
  lightning_strike,
  p3_runway_reveal,
  p3_touchdown,
  landing,
  ending,
  crash,
};

export function buildTowerTimeline(id: CinematicId, ctx: TimelineCtx, durationMs: number) {
  return buildTimeline(towerTimelines, id, ctx, durationMs);
}
