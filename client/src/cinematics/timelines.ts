// Flyer timeline registry (§F14.2): one builder per cinematic id, each in its own file.
import type { CinematicId } from "../net/protocol";
import { prologue } from "./flyer/prologue";
import { p1_intro } from "./flyer/p1_intro";
import { p1_seat } from "./flyer/p1_seat";
import { p1_outro } from "./flyer/p1_outro";
import { p2_intro } from "./flyer/p2_intro";
import { p2_extinguish } from "./flyer/p2_extinguish";
import { p2_outro } from "./flyer/p2_outro";
import { p3_intro } from "./flyer/p3_intro";
import { lightning_strike } from "./flyer/lightning_strike";
import { p3_runway_reveal } from "./flyer/p3_runway_reveal";
import { p3_touchdown } from "./flyer/p3_touchdown";
import { landing } from "./flyer/landing";
import { ending } from "./flyer/ending";
import { crash } from "./flyer/crash";
import { buildTimeline, type Builder, type TimelineCtx } from "./timelineKit";

export const flyerTimelines: Readonly<Record<CinematicId, Builder>> = {
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

export function buildFlyerTimeline(id: CinematicId, ctx: TimelineCtx, durationMs: number) {
  return buildTimeline(flyerTimelines, id, ctx, durationMs);
}
