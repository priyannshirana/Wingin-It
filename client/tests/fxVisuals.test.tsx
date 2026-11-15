// §A12 effect grammar → visuals, §A9 role split, and the §F15 action feedback (I1).
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { S2C } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { actionResult, flyerView, phase1World } from "./fixtures/messages";

const calls = vi.hoisted(() => ({
  shake: [] as [number, number][],
  yaw: [] as string[],
  pitch: 0,
  flicker: [] as string[],
  stopFlicker: 0,
  rim: 0,
  burst: [] as [string, string][],
}));

vi.mock("../src/cinematics/cameraFx", () => ({
  fxShake: (a: number, s: number) => calls.shake.push([a, s]),
  fxYaw: (side: string) => calls.yaw.push(side),
  fxPitchDip: () => {
    calls.pitch++;
  },
}));
vi.mock("../src/scene/lampFlicker", () => ({
  flickerLamp: (id: string) => calls.flicker.push(id),
  stopFlickers: () => {
    calls.stopFlicker++;
  },
}));
vi.mock("../src/scene/rimFx", () => ({
  flashStationRim: () => {
    calls.rim++;
  },
}));
vi.mock("../src/scene/sceneRefs", () => ({
  getRef: (key: string) => ({
    burst: (kind: string) => calls.burst.push([key, kind]),
  }),
}));

const { parseVisual, visualFor, useFxOverlayStore, SIGNAL_BARS } =
  await import("../src/ui/fxVisuals");
const { useFxVisuals } = await import("../src/ui/useFxVisuals");
const { FlyerFeedback } = await import("../src/ui/FlyerFeedback");
const { TowerFeedback } = await import("../src/ui/TowerFeedback");
const { FxOverlays } = await import("../src/ui/FxOverlays");
const { FuelDelta } = await import("../src/ui/FuelDelta");
const { FUEL_DELTA_MS, formatFuelDelta } = await import("../src/ui/feedback");

const receive = (msg: S2C) => act(() => useStore.getState().receive(msg));
const fx = (...effects: string[]): S2C => ({ type: "fx", effects });

function FlyerHarness() {
  useFxVisuals("flyer");
  return null;
}

beforeEach(() => {
  useStore.getState().reset();
  useFxOverlayStore.getState().reset();
  calls.shake.length = 0;
  calls.yaw.length = 0;
  calls.pitch = 0;
  calls.flicker.length = 0;
  calls.stopFlicker = 0;
  calls.rim = 0;
  calls.burst.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("parseVisual (§A12 grammar)", () => {
  it("parses every visual effect with its params", () => {
    expect(parseVisual("fx:shake:0.5:0.4")?.effect).toEqual({
      kind: "shake",
      amount: 0.5,
      seconds: 0.4,
    });
    expect(parseVisual("fx:yaw:left")?.effect).toEqual({ kind: "yaw", side: "left" });
    expect(parseVisual("fx:yaw:right")?.effect).toEqual({ kind: "yaw", side: "right" });
    expect(parseVisual("fx:pitch_dip")?.effect).toEqual({ kind: "pitch_dip" });
    expect(parseVisual("fx:lamp_flicker:PD_FIRE_LAMP_R")?.effect).toEqual({
      kind: "lamp_flicker",
      objectId: "PD_FIRE_LAMP_R",
    });
    expect(parseVisual("fx:flicker_stop")?.effect).toEqual({ kind: "flicker_stop" });
    expect(parseVisual("fx:burst:foam")?.effect).toEqual({ kind: "burst", burst: "foam" });
    expect(parseVisual("fx:burst:snuff")?.effect).toEqual({ kind: "burst", burst: "snuff" });
    expect(parseVisual("both:signal_flash")).toEqual({
      audience: "both",
      effect: { kind: "signal_flash" },
    });
    expect(parseVisual("both:signal_flash")?.audience).toBe("both");
    expect(parseVisual("fx:yaw:left")?.audience).toBe("flyer");
  });

  it("ignores sounds, audio-only effects, server-side effects and malformed strings", () => {
    for (const e of [
      "both:static_dip", // audio only (§F15)
      "sfx:clunk",
      "sfx_stop:alarm_master",
      "world:alarm=false",
      "lamp:OH_AP_LAMP=green",
      "cin:p1_seat",
      "tower:ding",
      "fx:shake:big:0.4",
      "fx:shake:0.5",
      "fx:shake:0:1",
      "fx:yaw:up",
      "fx:yaw:{FIRE_SIDE.lower}",
      "fx:burst:water",
      "fx:lamp_flicker:",
      "fx:nope",
      "both:nope",
      "",
    ]) {
      expect(parseVisual(e), e).toBeNull();
    }
  });

  it("never gives the Tower a Flyer-only effect (§A9)", () => {
    for (const e of [
      "fx:yaw:left",
      "fx:burst:foam",
      "fx:lamp_flicker:PD_FIRE_LAMP_L",
      "fx:shake:1:1",
    ]) {
      expect(visualFor("tower", e), e).toBeNull();
      expect(visualFor("flyer", e), e).not.toBeNull();
    }
    expect(visualFor("tower", "both:signal_flash")).toEqual({ kind: "signal_flash" });
  });
});

describe("useFxVisuals", () => {
  it("dispatches the Flyer's camera, lamp and overlay effects", () => {
    render(<FlyerHarness />);
    receive(fx("fx:shake:0.5:0.4", "fx:yaw:right", "fx:pitch_dip", "sfx:clunk"));
    receive(fx("fx:lamp_flicker:PD_FIRE_LAMP_R", "fx:flicker_stop"));
    receive(fx("both:static_dip", "both:signal_flash"));
    receive(fx("both:static_dip"));
    expect(calls.shake).toEqual([[0.5, 0.4]]);
    expect(calls.yaw).toEqual(["right"]);
    expect(calls.pitch).toBe(1);
    expect(calls.flicker).toEqual(["PD_FIRE_LAMP_R"]);
    expect(calls.stopFlicker).toBe(1);
    expect(useFxOverlayStore.getState().signalFlash).toBe(1);
  });

  it("puts the burst puff on the burning wing, with no screen flash", () => {
    receive(flyerView({ world: phase1World({ fire: { side: "left", level: "full" } }) }));
    render(<FlyerHarness />);
    receive(fx("fx:burst:foam"));
    expect(calls.burst).toEqual([["wingFireLeft", "foam"]]);
    expect(useStore.getState().flashFx).toBeNull();
  });

  it("never replays one-shots that arrived before mounting", () => {
    receive(fx("fx:yaw:left", "both:signal_flash"));
    render(<FlyerHarness />);
    expect(calls.yaw).toEqual([]);
    expect(useFxOverlayStore.getState().signalFlash).toBe(0);
    receive(fx("fx:yaw:left"));
    expect(calls.yaw).toEqual(["left"]);
  });

  it("the Tower plays only both:* (no camera, lamp, burst or flash)", () => {
    render(<TowerFeedback />);
    receive(fx("fx:yaw:left", "fx:shake:1:1", "fx:pitch_dip", "fx:lamp_flicker:PD_FIRE_LAMP_L"));
    receive(fx("fx:burst:foam", "both:signal_flash"));
    expect(calls).toMatchObject({ shake: [], yaw: [], pitch: 0, flicker: [], burst: [] });
    expect(useStore.getState().flashFx).toBeNull();
    expect(useFxOverlayStore.getState().signalFlash).toBe(1);
  });
});

describe("FxOverlays", () => {
  it("flashes the signal bars on both:signal_flash and shows nothing for static_dip", () => {
    render(
      <div data-screen="tower">
        <div data-testid="signal">
          <div aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <FxOverlays />
      </div>,
    );
    const bars = Array.from(document.querySelectorAll<HTMLElement>(SIGNAL_BARS));
    expect(bars).toHaveLength(3);
    const animated: HTMLElement[] = [];
    for (const b of bars) {
      b.animate = (() => {
        animated.push(b);
        return { cancel: () => {} };
      }) as unknown as HTMLElement["animate"];
    }
    const before = document.body.innerHTML;
    receive(fx("both:static_dip"));
    expect(document.body.innerHTML).toBe(before);
    act(() => useFxOverlayStore.getState().bumpSignalFlash());
    expect(animated).toEqual(bars);
  });
});

describe("FlyerFeedback (§F15)", () => {
  it("wrong action: red pulse and shakeFor(0.5, 0.35); no floating label of its own", () => {
    render(<FlyerFeedback />);
    const pulse = useStore.getState().redPulseId;
    receive(actionResult({ success: false, reason: "wrong_object", fuel_delta: -10 }));
    expect(useStore.getState().redPulseId).toBe(pulse + 1);
    expect(calls.shake).toEqual([[0.5, 0.35]]);
    expect(calls.rim).toBe(0);
    expect(document.body.textContent).not.toContain("−10");
  });

  it("correct action: the green station rim flash, no pulse or shake", () => {
    render(<FlyerFeedback />);
    const pulse = useStore.getState().redPulseId;
    receive(actionResult({ success: true }));
    expect(calls.rim).toBe(1);
    expect(useStore.getState().redPulseId).toBe(pulse);
    expect(calls.shake).toEqual([]);
  });

  it("does not replay a result that arrived before mounting", () => {
    receive(actionResult({ success: true }));
    render(<FlyerFeedback />);
    expect(calls.rim).toBe(0);
  });
});

describe("FuelDelta (§F15)", () => {
  it("Flyer: shows −10 on a wrong action and +5 on a crossover, then clears", () => {
    vi.useFakeTimers();
    render(<FuelDelta bonus />);
    receive(actionResult({ success: false, reason: "wrong_count", fuel_delta: -10 }));
    receive({ type: "toast", kind: "crossover", key: "toast.crossover", params: { word: "laal" } });
    const labels = screen.getAllByTestId("fuel-delta");
    expect(labels.map((l) => [l.dataset.kind, l.textContent])).toEqual([
      ["penalty", "−10"],
      ["bonus", "+5"],
    ]);
    act(() => {
      vi.advanceTimersByTime(FUEL_DELTA_MS + 1);
    });
    expect(screen.queryAllByTestId("fuel-delta")).toHaveLength(0);
  });

  it("Tower: −10 only; the crossover is just the toast", () => {
    render(<FuelDelta bonus={false} />);
    receive({ type: "toast", kind: "crossover", key: "toast.crossover", params: { word: "laal" } });
    expect(screen.queryAllByTestId("fuel-delta")).toHaveLength(0);
    receive(actionResult({ success: false, reason: "wrong_order", fuel_delta: -10 }));
    expect(screen.getByTestId("fuel-delta").textContent).toBe("−10");
  });

  it("ignores successes and other toasts", () => {
    render(<FuelDelta bonus />);
    receive(actionResult({ success: true, fuel_delta: 0 }));
    receive({ type: "toast", kind: "warning", key: "toast.didnt_catch", params: {} });
    expect(screen.queryAllByTestId("fuel-delta")).toHaveLength(0);
  });

  it("formats with a real minus sign", () => {
    expect(formatFuelDelta(-10)).toBe("−10");
    expect(formatFuelDelta(5)).toBe("+5");
  });
});
