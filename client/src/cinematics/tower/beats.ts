import type { SfxName } from "../../audio/sfx";
import type { CueName, TitleCardSpec } from "../../state/store";
import type { Builder, TimelineCtx } from "../timelineKit";

// Tower beat helpers (§F14.4). State (cues, the title card) is *derived from the timeline time*
// on every render, never toggled by `tl.call`s: GSAP fires calls on backward seeks too and skips
// a call when seeking back from exactly its position, so toggles drift under the §F18.5 scrubber
// or a backward clock correction. With derived state, any seek, forward or backward, a skip
// (`progress(1)`) or a full play all leave the same state for the same time.
// One-shot effects (sounds, flashes) fire only when the playhead crosses them going forward; the
// runner also mutes them while seeking.

type Timeline = Parameters<Builder>[0];

/** End of a span that lasts to the end of the timeline: the state is the next `World` (§F14.1). */
export const HOLD = Infinity;

/** The stamp slam lasts 180 ms (§F12.6); the thump lands on impact, not on the cue. */
export const STAMP_IMPACT_S = 0.18;

/** TitleCard fades out over 0.4 s after it is cleared (§F0.4). */
export const TITLE_OUT_S = 0.4;

/** Lightning on the Tower screen: a 60 ms white overlay (§F14.4). */
export const LIGHTNING_MS = 60;
export const WHITE = "#FFFFFF";

interface Span<T> {
  value: T;
  from: number;
  to: number;
}

export interface Beats {
  /** Cue `name` is on for `from <= t < to` (`to = HOLD`: on through the end, incl. a skip). */
  cue(name: CueName, from: number, to?: number): void;
  /** The title card for `from <= t < to`. */
  title(card: TitleCardSpec, from: number, to: number): void;
  /** A one-shot sound when the playhead passes `t` going forward. */
  sound(name: SfxName, t: number): void;
  /** A one-shot full-screen flash when the playhead passes `t` going forward (§F10.1). */
  flash(t: number, color: string, ms: number, opacity?: number): void;
}

export function beats(tl: Timeline, ctx: TimelineCtx): Beats {
  const cueSpans = new Map<CueName, Span<true>[]>();
  const titleSpans: Span<TitleCardSpec>[] = [];
  // What this timeline last applied. The runner clears cues and the card before a new
  // cinematic starts, so "off / no card" is the starting state.
  const applied = new Map<CueName, boolean>();
  let appliedCard: TitleCardSpec | null = null;

  const inside = (t: number, s: Span<unknown>) => t >= s.from && t < s.to;
  const sync = () => {
    const t = tl.time();
    for (const [name, spans] of cueSpans) {
      const on = spans.some((s) => inside(t, s));
      if ((applied.get(name) ?? false) !== on) {
        applied.set(name, on);
        ctx.cue(name, on);
      }
    }
    const card = titleSpans.find((s) => inside(t, s))?.value ?? null;
    if (card !== appliedCard) {
      appliedCard = card;
      ctx.titleCard(card);
    }
  };
  // One tween over the whole timeline: its onUpdate runs on every render (play ticks and seeks
  // in either direction). It doesn't change the timeline's length.
  tl.to({}, { duration: tl.duration(), onUpdate: sync }, 0);

  return {
    cue(name, from, to = HOLD) {
      const list = cueSpans.get(name) ?? [];
      list.push({ value: true, from, to });
      cueSpans.set(name, list);
    },
    title(card, from, to) {
      titleSpans.push({ value: card, from, to });
    },
    sound(name, t) {
      tl.call(
        () => {
          if (tl.time() >= t) ctx.sfx.play(name);
        },
        [],
        t,
      );
    },
    flash(t, color, ms, opacity) {
      tl.call(
        () => {
          if (tl.time() >= t) ctx.flash(color, ms, opacity);
        },
        [],
        t,
      );
    },
  };
}
