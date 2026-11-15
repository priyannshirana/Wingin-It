// The cinematic runner (§F14.1): builds the role's timeline for `store.cinematic`, starts it on
// the server clock (seeking forward when late or rejoining), applies the end state on skip or
// replacement, and re-syncs when a hidden tab becomes visible again.
import gsap from "gsap";
import { useEffect } from "react";
import { sfx } from "../audio/sfx";
import { DEV } from "../config";
import { serverNow } from "../net/clock";
import type { CinematicId } from "../net/protocol";
import { selectDemo } from "../state/selectors";
import { useStore } from "../state/store";
import type { TimelineCtx } from "./timelineKit";

/** The role's timeline builder (Flyer: timelines.ts, Tower: towerTimelines.ts). */
export type TimelineFactory = (
  id: CinematicId,
  ctx: TimelineCtx,
  durationMs: number,
) => gsap.core.Timeline;

/** A start this close to start_at_ms counts as on time (no seek, so t = 0 sounds play). */
const ON_TIME_S = 0.05;

let current: gsap.core.Timeline | null = null;
let skipCurrent: () => void = () => {};

export function useCinematicRunner(build: TimelineFactory): void {
  const id = useStore((s) => s.cinematic?.id);
  const startAt = useStore((s) => s.cinematic?.start_at_ms);
  const skipped = useStore((s) => s.cinematic?.skipped ?? false);

  useEffect(() => {
    const c = useStore.getState().cinematic;
    if (!c || c.skipped) return;
    const store = useStore.getState();
    const { setTitleCard, setCinePlaying, setCue, flash } = store;
    // While seeking (late join, skip) calls still fire so states land, but one-shots are muted.
    let seeking = false;
    const ctx: TimelineCtx = {
      params: c.params,
      demo: selectDemo(store),
      retry: c.params.retry === true,
      titleCard: setTitleCard,
      cue: setCue,
      flash: (color, ms, opacity) => {
        if (!seeking) flash(color, ms, opacity);
      },
      sfx: {
        play: (name) => {
          if (!seeking) sfx.play(name);
        },
        loop: (name, on) => sfx.loop(name, on),
      },
    };
    const built: { tl?: gsap.core.Timeline } = {};
    const gctx = gsap.context(() => {
      built.tl = build(c.id, ctx, c.duration_ms);
    });
    const timeline = built.tl;
    if (!timeline) return;
    const D = timeline.duration();
    if (DEV && Math.abs(D - c.duration_ms / 1000) > 0.05) {
      console.warn(`[wingin] timeline ${c.id} is ${D}s, message says ${c.duration_ms}ms`);
    }
    timeline.eventCallback("onComplete", () => setCinePlaying(false));
    current = timeline;
    let timer: ReturnType<typeof setTimeout> | null = null;
    skipCurrent = () => {
      // A skip inside the start lead must not let the pending start replay the timeline.
      if (timer) clearTimeout(timer);
      timer = null;
      seeking = true;
      timeline.progress(1, false);
      seeking = false;
    };
    setCinePlaying(true);

    // Every start goes through sync() (on time, late, or after a hidden tab returns), and sync()
    // cancels any pending start, so a throttled timer can never restart a running timeline.
    const sync = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (timeline.progress() >= 1) return true;
      const elapsed = (serverNow() - c.start_at_ms) / 1000;
      if (elapsed < 0) {
        timer = setTimeout(sync, -elapsed * 1000); // not yet: re-arm the start
        return false;
      }
      if (elapsed < ON_TIME_S) {
        timeline.play(0); // on time: play normally, sounds included
        return true;
      }
      seeking = true;
      timeline.seek(Math.min(elapsed, D), false); // late (or rejoin): seek forward, firing calls
      seeking = false;
      if (elapsed < D) timeline.play();
      return true;
    };
    const startIn = c.start_at_ms - serverNow();
    if (startIn > 0) {
      timer = setTimeout(sync, startIn);
    } else sync();

    const onVisible = () => {
      if (document.visibilityState === "visible" && timeline.progress() < 1) sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      seeking = true;
      timeline.progress(1, false); // replaced or unmounted → apply the end state
      seeking = false;
      timeline.kill();
      gctx.kill();
      if (current === timeline) current = null;
      setCinePlaying(false);
      useStore.getState().clearCues();
      setTitleCard(null);
    };
  }, [id, startAt, build]);

  // cinematic_skip: jump to the end so every end state is applied (§A10).
  useEffect(() => {
    if (skipped && current) skipCurrent();
  }, [skipped]);
}
