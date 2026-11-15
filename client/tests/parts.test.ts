import { describe, expect, it } from "vitest";
import { predictState, verbFor } from "../src/scene/parts/useInteractive";

describe("part verbs (§A6, §F9.5)", () => {
  it("maps each part type to its verb", () => {
    expect(verbFor({ type: "PushButton" }, { kind: "button" }, false)).toBe("press");
    expect(verbFor({ type: "ToggleSwitch" }, { kind: "toggle", value: "on" }, false)).toBe(
      "toggle",
    );
    expect(verbFor({ type: "PullHandle" }, { kind: "handle", value: "in" }, false)).toBe("pull");
    expect(verbFor({ type: "PullHandle" }, { kind: "handle", value: "out" }, false)).toBeNull();
    expect(verbFor({ type: "UpDownLever" }, { kind: "lever", value: "up" }, false)).toBe(
      "move_down",
    );
    expect(verbFor({ type: "UpDownLever" }, { kind: "lever", value: "down" }, false)).toBe(
      "move_up",
    );
    expect(verbFor({ type: "NotchLever" }, { kind: "notch", value: 1 }, false)).toBe("move_down");
    expect(verbFor({ type: "NotchLever" }, { kind: "notch", value: 1 }, true)).toBe("move_up");
    for (const type of ["Lamp", "FuelGauge", "Screen"] as const) {
      expect(verbFor({ type }, undefined, false)).toBeNull();
    }
  });

  it("predicts the optimistic pose state (the server still decides)", () => {
    expect(predictState({ kind: "toggle", value: "on" }, "toggle")).toEqual({
      kind: "toggle",
      value: "off",
    });
    expect(predictState({ kind: "handle", value: "in" }, "pull")).toEqual({
      kind: "handle",
      value: "out",
    });
    expect(predictState({ kind: "lever", value: "up" }, "move_down")).toEqual({
      kind: "lever",
      value: "down",
    });
    expect(predictState({ kind: "notch", value: 0 }, "move_down")).toEqual({
      kind: "notch",
      value: 1,
    });
    expect(predictState({ kind: "notch", value: 2 }, "move_down")).toEqual({
      kind: "notch",
      value: 2,
    });
    expect(predictState({ kind: "notch", value: 1 }, "move_up")).toEqual({
      kind: "notch",
      value: 0,
    });
    expect(predictState({ kind: "button" }, "press")).toEqual({ kind: "button" });
  });
});
