import { windowClock, type WindowShot } from "../towerWindowClock";
import type { Builder } from "../timelineKit";
import type { Beats } from "./beats";

type Timeline = Parameters<Builder>[0];

/**
 * The Tower window (§F12.7) open on `shot` for `len` seconds from `from`: its cue (the frame
 * slides in at `from` and out again 0.5 s after `from + len`) and the shot clock, tweened so the
 * plane's pose is the same for a play-through, a seek in either direction and a skip.
 */
export function windowShot(
  tl: Timeline,
  b: Beats,
  shot: WindowShot,
  from: number,
  len: number,
): void {
  b.cue(`tower_window_${shot}`, from, from + len);
  tl.fromTo(
    windowClock,
    { u: 0 },
    { u: 1, duration: len, ease: "none", immediateRender: false },
    from,
  );
}
