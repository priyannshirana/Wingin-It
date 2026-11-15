// Shared timeline plumbing (no three.js here, so the Tower bundle stays 2D-only).
// Shared timeline plumbing (§F14.1). FINAL API for every timeline builder. No three.js here,
// so the Tower bundle stays 2D-only; Flyer builders import cameraRig / sceneRefs directly.
import gsap from "gsap";
import type { SfxName } from "../audio/sfx";
import type { CinematicId, PhaseNo } from "../net/protocol";
import type { CueName, TitleCardSpec } from "../state/store";

export type CinematicParams = Record<string, string | number | boolean>;

/**
 * What a builder gets besides the timeline. Every effect goes through a `tl.call` at a fixed
 * position; the runner fires calls while seeking (late join, skip) but mutes `sfx` and `flash`
 * then, so a rejoin applies states without a burst of sounds.
 */
export interface TimelineCtx {
  /** Role-filtered `cinematic.params` (§A10). */
  params: CinematicParams;
  /** Demo room (prologue 6 s, ending 4 s). */
  demo: boolean;
  /** `params.retry === true` (phase intros after a crash). */
  retry: boolean;
  /** Show (or clear with null) the title card. Idempotent. */
  titleCard: (card: TitleCardSpec | null) => void;
  /** Switch a named 2D beat on or off (§F14.4). Idempotent. */
  cue: (name: CueName, on: boolean) => void;
  /** Full-screen DOM flash, opacity 1 → 0 over `ms` (one-shot; muted while seeking). */
  flash: (color: string, ms: number, opacity?: number) => void;
  /** Sounds (muted while seeking). */
  sfx: { play: (name: SfxName) => void; loop: (name: SfxName, on: boolean) => void };
}

export const phaseCard = (phase: PhaseNo): TitleCardSpec => ({ kind: "phase", phase });

/** Title card from `from` to `to` (seconds on the timeline). */
export function title(
  tl: gsap.core.Timeline,
  ctx: TimelineCtx,
  card: TitleCardSpec,
  from: number,
  to: number,
): void {
  tl.call(() => ctx.titleCard(card), [], from);
  tl.call(() => ctx.titleCard(null), [], to);
}

/** Switch a cue on at `from` and off at `to`. */
export function cueSpan(
  tl: gsap.core.Timeline,
  ctx: TimelineCtx,
  name: CueName,
  from: number,
  to: number,
): void {
  tl.call(() => ctx.cue(name, true), [], from);
  tl.call(() => ctx.cue(name, false), [], to);
}

/** A test/sandbox context that records nothing. */
export function silentCtx(params: CinematicParams = {}, demo = false): TimelineCtx {
  return {
    params,
    demo,
    retry: params.retry === true,
    titleCard: () => {},
    cue: () => {},
    flash: () => {},
    sfx: { play: () => {}, loop: () => {} },
  };
}

/** Adds a builder's beats to `tl`. `at(t)` maps a nominal time to the message duration. */
export type Builder = (tl: gsap.core.Timeline, ctx: TimelineCtx, at: (t: number) => number) => void;

/** Nominal (cinematics.json) duration in seconds of the plain variant each builder is laid out for. */
const NOMINAL_S: Record<CinematicId, number> = {
  prologue: 28,
  p1_intro: 1.2,
  p1_seat: 3,
  p1_outro: 6,
  p2_intro: 9,
  p2_extinguish: 3,
  p2_outro: 8,
  p3_intro: 7,
  lightning_strike: 1.5,
  p3_runway_reveal: 4,
  p3_touchdown: 6,
  landing: 7,
  ending: 6,
  crash: 5,
};

function num(v: string | number | boolean | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** "m:ss" for the ending card. */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function endingCard(params: CinematicParams): TitleCardSpec {
  return {
    kind: "text",
    key: "end.landed",
    lines: [
      { key: "end.fuel_left", params: { n: Math.round(num(params.fuel_left_s)) } },
      { key: "end.total_time", params: { t: formatClock(num(params.total_time_s)) } },
    ],
  };
}

/**
 * Builds a paused timeline of exactly `durationMs` (the message's duration). Beats are laid
 * out on the nominal durations and scaled to the message's (demo / retry variants).
 */
export function buildTimeline(
  builders: Record<CinematicId, Builder>,
  id: CinematicId,
  ctx: TimelineCtx,
  durationMs: number,
): gsap.core.Timeline {
  const D = durationMs / 1000;
  // p1_intro's retry variant is its own layout (3.2 s), not a stretched 1.2 s one.
  const nominal = id === "p1_intro" && ctx.retry ? 3.2 : NOMINAL_S[id];
  const scale = nominal > 0 ? D / nominal : 1;
  const at = (t: number) => t * scale;
  const tl = gsap.timeline({ paused: true });
  tl.to({}, { duration: D }, 0); // fixed total length: seeking and skipping are exact
  builders[id](tl, ctx, at);
  return tl;
}
