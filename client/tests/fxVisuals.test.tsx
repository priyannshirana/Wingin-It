// §A12 effect grammar → visuals, §A9 role split, and the §F15 action feedback (I1).
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { S2C } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { actionResult, flyerView, gameState, phase1World } from "./fixtures/messages";

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

const { parseVisual, visualFor, useFxOverlayStore } = await import("../src/ui/fxVisuals");
const { useFxVisuals, BURST_FLASH } = await import("../src/ui/useFxVisuals");
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
    expect(parseVisual("both:static_dip")).toEqual({
      audience: "both",
      effect: { kind: "static_dip" },
    });
    expect(parseVisual("both:signal_flash")?.audience).toBe("both");
    expect(parseVisual("fx:yaw:left")?.audience).toBe("flyer");
  });

  it("ignores sounds, server-side effects and malformed strings", () => {
    for (const e of [
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
    expect(visualFor("tower", "both:static_dip")).toEqual({ kind: "static_dip" });
    expect(visualFor("tower", "both:signal_flash")).toEqual({ kind: "signal_flash" });
  });
});

describe("useFxVisuals", () => {
  it("dispatches the Flyer's camera, lamp and overlay effects", () => {
    render(<FlyerHarness />);
    receive(fx("fx:shake:0.5:0.4", "fx:yaw:right", "fx:pitch_dip", "sfx:clunk"));
    receive(fx("fx:lamp_flicker:PD_FIRE_LAMP_R", "fx:flicker_stop"));
    receive(fx("both:static_dip", "both:signal_flash"));
    expect(calls.shake).toEqual([[0.5, 0.4]]);
    expect(calls.yaw).toEqual(["right"]);
    expect(calls.pitch).toBe(1);
    expect(calls.flicker).toEqual(["PD_FIRE_LAMP_R"]);
    expect(calls.stopFlicker).toBe(1);
    expect(useFxOverlayStore.getState()).toMatchObject({ staticDip: 1, signalFlash: 1 });
  });

  it("puts the burst on the burning wing and flashes white", () => {
    receive(flyerView({ world: phase1World({ fire: { side: "left", level: "full" } }) }));
    render(<FlyerHarness />);
    receive(fx("fx:burst:foam"));
    expect(calls.burst).toEqual([["wingFireLeft", "foam"]]);
    expect(useStore.getState().flashFx).toMatchObject({
      color: BURST_FLASH.color,
      ms: BURST_FLASH.ms,
      opacity: BURST_FLASH.opacity,
    });
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
  it.each(["flyer", "tower"] as const)("shows the static burst on both:static_dip (%s)", (role) => {
    render(<FxOverlays role={role} />);
    expect(screen.queryByTestId("static-dip")).toBeNull();
    act(() => useFxOverlayStore.getState().bump("staticDip"));
    expect(screen.getByTestId("static-dip")).toBeTruthy();
  });
});

describe("FlyerFeedback (§F15)", () => {
  it("wrong action: red pulse, shakeFor(0.5, 0.35) and a −10 at the clicked control", () => {
    receive(gameState());
    render(
      <div data-screen="flyer">
        <canvas data-testid="cv" />
        <FlyerFeedback />
      </div>,
    );
    const canvas = screen.getByTestId("cv");
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 200 }),
      );
    });
    const pulse = useStore.getState().redPulseId;
    receive(actionResult({ success: false, reason: "wrong_object", fuel_delta: -10 }));
    expect(useStore.getState().redPulseId).toBe(pulse + 1);
    expect(calls.shake).toEqual([[0.5, 0.35]]);
    const label = screen.getByTestId("click-delta");
    expect(label.textContent).toBe("−10");
    expect(label.style.left).toBe("300px");
    expect(label.style.top).toBe("200px");
    expect(calls.rim).toBe(0);
  });

  it("wrong action without a recent click: no floating label (the fuel bar still shows it)", () => {
    render(<FlyerFeedback />);
    receive(actionResult({ success: false, reason: "dev", fuel_delta: -10 }));
    expect(screen.queryByTestId("click-delta")).toBeNull();
    expect(calls.shake).toHaveLength(1);
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

describe("FuelDelta (§F15, both screens)", () => {
  it("shows −10 on a wrong action and +5 on a crossover, then clears", () => {
    vi.useFakeTimers();
    render(<FuelDelta />);
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

  it("ignores successes and other toasts", () => {
    render(<FuelDelta />);
    receive(actionResult({ success: true, fuel_delta: 0 }));
    receive({ type: "toast", kind: "warning", key: "toast.didnt_catch", params: {} });
    expect(screen.queryAllByTestId("fuel-delta")).toHaveLength(0);
  });

  it("formats with a real minus sign", () => {
    expect(formatFuelDelta(-10)).toBe("−10");
    expect(formatFuelDelta(5)).toBe("+5");
  });
});
