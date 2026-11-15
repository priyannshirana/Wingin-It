import { act, cleanup, renderHook } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCinematicRunner } from "../src/cinematics/runner";
import { resetClock } from "../src/net/clock";
import { useStore } from "../src/state/store";
import { cinematic } from "./fixtures/messages";

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  resetClock();
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("cinematic runner (§F14.1)", () => {
  it("a skip inside the start lead never replays the timeline", () => {
    const made: { tl?: gsap.core.Timeline; plays: number } = { plays: 0 };
    const build = () => {
      const tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: 1.2 }, 0);
      vi.spyOn(tl, "play").mockImplementation(() => {
        made.plays += 1;
        return tl;
      });
      made.tl = tl;
      return tl;
    };
    renderHook(() => useCinematicRunner(build));
    act(() => {
      useStore.getState().receive(cinematic({ start_at_ms: Date.now() + 300, duration_ms: 1200 }));
    });
    expect(made.tl).toBeDefined();
    act(() => {
      useStore.getState().receive({ type: "cinematic_skip", id: "p1_intro" });
    });
    expect(made.tl?.progress()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000); // well past start_at_ms
    });
    expect(made.plays).toBe(0);
    expect(made.tl?.progress()).toBe(1);
    expect(useStore.getState().cinePlaying).toBe(false);
  });

  it("a late cinematic seeks forward instead of starting at 0", () => {
    const made: { tl?: gsap.core.Timeline } = {};
    const build = () => {
      const tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: 3 }, 0);
      made.tl = tl;
      return tl;
    };
    renderHook(() => useCinematicRunner(build));
    act(() => {
      useStore
        .getState()
        .receive(cinematic({ id: "p1_seat", start_at_ms: Date.now() - 1500, duration_ms: 3000 }));
    });
    expect(made.tl?.time()).toBeCloseTo(1.5, 1);
  });
});

describe("cinematic runner: hidden tab (§F20)", () => {
  it("a throttled start timer never restarts a timeline that a visibility sync already started", () => {
    const made: { tl?: gsap.core.Timeline; playsFromZero: number } = { playsFromZero: 0 };
    const build = () => {
      const tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: 3 }, 0);
      const play = tl.play.bind(tl);
      vi.spyOn(tl, "play").mockImplementation((from?: number | string | null) => {
        if (from === 0) made.playsFromZero += 1;
        return play();
      });
      made.tl = tl;
      return tl;
    };
    renderHook(() => useCinematicRunner(build));
    act(() => {
      useStore
        .getState()
        .receive(cinematic({ id: "p1_seat", start_at_ms: Date.now() + 300, duration_ms: 3000 }));
    });
    // The tab was hidden; the browser holds the 300 ms start timer back. At 900 ms the user
    // returns: the visibility sync seeks to 0.6 s and plays.
    act(() => {
      vi.setSystemTime(Date.now() + 900);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(made.tl?.time()).toBeCloseTo(0.6, 1);
    // The throttled timer would fire now; it must not restart from 0.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(made.playsFromZero).toBe(0);
    expect(made.tl?.time()).toBeGreaterThan(0.5);
  });

  it("a visibility event before the start re-arms the start instead of dropping it", () => {
    const made: { tl?: gsap.core.Timeline } = {};
    const build = () => {
      const tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: 3 }, 0);
      made.tl = tl;
      return tl;
    };
    renderHook(() => useCinematicRunner(build));
    act(() => {
      useStore
        .getState()
        .receive(cinematic({ id: "p1_seat", start_at_ms: Date.now() + 300, duration_ms: 3000 }));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(made.tl?.paused()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(made.tl?.paused()).toBe(false);
  });
});
