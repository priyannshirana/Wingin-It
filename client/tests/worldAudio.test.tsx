// §F16.4 useWorldAudio: loops follow World flags (Flyer) / signal level (Tower); low_fuel; the
// §F15 sound column (chime / buzzer / sparkle, sfx: / sfx_stop: / static_dip); ducking.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, World } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { actionResult, flyerView, gameState, phase1World } from "./fixtures/messages";

const calls = vi.hoisted(() => ({
  loop: [] as [string, boolean][],
  play: [] as string[],
  param: [] as [string, string, number | string][],
  duck: [] as boolean[],
  stopAll: 0,
}));

vi.mock("../src/audio/sfx", () => ({
  sfx: {
    play: (n: string) => calls.play.push(n),
    loop: (n: string, on: boolean) => calls.loop.push([n, on]),
    setParam: (n: string, k: string, v: number | string) => calls.param.push([n, k, v]),
  },
  duckAmbience: (on: boolean) => calls.duck.push(on),
  stopAllLoops: () => {
    calls.stopAll++;
  },
}));

const { planAudio, useWorldAudio, STATIC_DIP_MS } = await import("../src/audio/useWorldAudio");

function Harness({ role }: { role: Role }) {
  useWorldAudio(role);
  return null;
}

/** The latest requested state of each loop. */
function loops(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [n, on] of calls.loop) out[n] = on;
  return out;
}

const receive = (msg: Parameters<ReturnType<typeof useStore.getState>["receive"]>[0]) =>
  act(() => useStore.getState().receive(msg));

function setWorld(over: Partial<World>) {
  receive(flyerView({ world: phase1World(over) }));
}

beforeEach(() => {
  useStore.getState().reset();
  calls.loop.length = 0;
  calls.play.length = 0;
  calls.param.length = 0;
  calls.duck.length = 0;
  calls.stopAll = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useWorldAudio (Flyer)", () => {
  it("starts and stops loops with the World flags", () => {
    useStore.getState().receive(gameState({ status: "PLAYING" }));
    useStore.getState().receive(flyerView({ world: phase1World() }));
    render(<Harness role="flyer" />);
    // Phase 1 start: alarm on, pilot slumped (snore), engine humming; no fire, rain or static.
    expect(loops()).toMatchObject({
      alarm_master: true,
      engine_hum: true,
      snore: true,
      fire_bell: false,
      fuel_hiss: false,
      rain: false,
      static: false,
      warning_beep: false,
    });

    setWorld({ alarm: false, warning_beep: true });
    expect(loops()).toMatchObject({ alarm_master: false, warning_beep: true });

    setWorld({
      alarm: false,
      fire_bell: true,
      fuel_hiss: true,
      static_level: 0.02,
      fire: { side: "left", level: "full" },
    });
    expect(loops()).toMatchObject({ fire_bell: true, fuel_hiss: true, static: true });
    expect(calls.param).toContainEqual(["static", "gain", 0.02]);

    setWorld({
      weather: "storm",
      static_level: 0.04,
      engine_hum: "one_engine",
      pilot: { slumped: false, seat_back: true, awake: true },
    });
    expect(loops()).toMatchObject({ rain: true, snore: false, fire_bell: false });
    expect(calls.param).toContainEqual(["rain", "gain", 0.08]);
    expect(calls.param).toContainEqual(["engine_hum", "mode", "one_engine"]);

    setWorld({ weather: "rain_light" });
    expect(calls.param).toContainEqual(["rain", "gain", 0.04]);
  });

  it("only re-sends loops whose flag changed", () => {
    useStore.getState().receive(gameState());
    useStore.getState().receive(flyerView({ world: phase1World() }));
    render(<Harness role="flyer" />);
    const before = calls.loop.length;
    setWorld({}); // a new flyer_view with the same flags
    expect(calls.loop.length).toBe(before);
  });

  it("stops every loop when the screen unmounts", () => {
    useStore.getState().receive(flyerView({ world: phase1World() }));
    const { unmount } = render(<Harness role="flyer" />);
    unmount();
    expect(calls.stopAll).toBe(1);
    expect(calls.duck.at(-1)).toBe(false);
  });

  it("plays sfx: one-shots and sfx_stop: loops from fx, never replaying old batches", () => {
    useStore.getState().receive({ type: "fx", effects: ["sfx:clunk"] }); // before mount
    useStore.getState().receive(flyerView({ world: phase1World() }));
    render(<Harness role="flyer" />);
    expect(calls.play).toEqual([]);
    receive({ type: "fx", effects: ["sfx:chime_soft", "sfx_stop:alarm_master", "fx:burst:foam"] });
    expect(calls.play).toEqual(["chime_soft", "whoosh"]);
    expect(calls.loop.at(-1)).toEqual(["alarm_master", false]);
    receive({ type: "fx", effects: ["sfx:not_a_sound", "tower:stamp"] });
    expect(calls.play).toEqual(["chime_soft", "whoosh"]); // unknown + tower-only ignored
  });
});

describe("useWorldAudio (both screens)", () => {
  it.each<Role>(["flyer", "tower"])("%s: chime on success, buzzer on a wrong action", (role) => {
    useStore.getState().receive(gameState());
    render(<Harness role={role} />);
    receive(actionResult({ success: true }));
    receive(actionResult({ success: false, reason: "wrong_object", fuel_delta: -10 }));
    expect(calls.play).toEqual(["chime", "buzzer"]);
  });

  it("sparkle on a crossover toast", () => {
    render(<Harness role="tower" />);
    receive({ type: "toast", kind: "crossover", key: "toast.crossover", params: { word: "laal" } });
    receive({ type: "toast", kind: "info", key: "toast.info", params: { text: "x" } });
    expect(calls.play).toEqual(["sparkle"]);
  });

  it("low_fuel while draining under 20 s", () => {
    useStore.getState().receive(gameState({ fuel_s: 40, fuel_draining: true }));
    render(<Harness role="tower" />);
    expect(loops().low_fuel).toBe(false);
    receive(gameState({ fuel_s: 19.5, fuel_draining: true }));
    expect(loops().low_fuel).toBe(true);
    receive(gameState({ fuel_s: 19.5, fuel_draining: false })); // paused by a cinematic
    expect(loops().low_fuel).toBe(false);
  });

  it("ducks the ambience while anyone holds the channel", () => {
    render(<Harness role="flyer" />);
    expect(calls.duck).toEqual([false]);
    receive({ type: "channel", busy_by: "tower" });
    receive({ type: "channel", busy_by: null });
    receive({ type: "channel", busy_by: "flyer" });
    expect(calls.duck).toEqual([false, true, false, true]);
  });

  it("both:static_dip drops static to 0 for 1.2 s", () => {
    vi.useFakeTimers();
    useStore.getState().receive(gameState({ signal_level: 3, phase: 3 }));
    render(<Harness role="tower" />);
    expect(calls.param.at(-1)).toEqual(["static", "gain", 0.04]);
    receive({ type: "fx", effects: ["both:static_dip"] });
    expect(calls.param.at(-1)).toEqual(["static", "gain", 0]);
    act(() => {
      vi.advanceTimersByTime(STATIC_DIP_MS);
    });
    expect(calls.param.at(-1)).toEqual(["static", "gain", 0.04]);
  });
});

describe("planAudio (Tower)", () => {
  it("static follows the signal level only; no World loops", () => {
    const s = useStore.getState();
    s.receive(flyerView({ world: phase1World({ alarm: true }) })); // never sent to a Tower anyway
    for (const [level, gain] of [
      [1, 0],
      [2, 0.02],
      [3, 0.04],
    ] as const) {
      s.receive(gameState({ signal_level: level }));
      const plan = planAudio(useStore.getState(), "tower");
      expect(plan.staticGain).toBe(gain);
      expect(plan.loops.static).toBe(gain > 0);
      expect(Object.keys(plan.loops).sort()).toEqual(["low_fuel", "static"]);
    }
  });
});
