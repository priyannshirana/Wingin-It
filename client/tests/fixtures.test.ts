import { describe, expect, it } from "vitest";
import { CINEMATIC_IDS } from "../src/content/cinematics";
import { STATIONS_FILE } from "../src/content/stations";
import {
  FixtureError,
  fixtureRoomState,
  parseLamps,
  PRESET_BEFORE,
  PRESET_NAMES,
  presetFlyerView,
  presetShot,
  presetStation,
  presetWorld,
} from "../src/dev/fixtures";
import { SHOT_IDS } from "../src/cinematics/cameraRig";
import { REST_WORLD } from "../src/scene/env/worldSync";
import { selectGenderOf } from "../src/state/selectors";
import { useStore } from "../src/state/store";

describe("dev fixtures: world presets (§F18.5, §A11)", () => {
  it("lobby is the §A11 LOBBY world (= what the scene shows before any flyer_view)", () => {
    expect(presetWorld("lobby")).toEqual(REST_WORLD);
    expect(REST_WORLD).toMatchObject({
      light_rig: "night_calm",
      alarm: false,
      pilot: { slumped: false, seat_back: false, awake: true },
      weather: "clouds_night",
      fog: 0.004,
      runway: "hidden",
    });
  });

  it("phase-start presets match the §A11 phase start worlds", () => {
    expect(presetWorld("p1_start")).toMatchObject({
      light_rig: "night_alarm",
      alarm: true,
      pilot: { slumped: true, seat_back: false },
      ap_screen: false,
      fire: { side: null, level: "none" },
    });
    expect(presetWorld("p2_start", { fire_side: "left" })).toMatchObject({
      light_rig: "fire",
      pilot: { slumped: true, seat_back: true },
      ap_screen: true,
      fire: { side: "left", level: "full" },
      fire_bell: true,
      fuel_hiss: true,
      fog: 0.006,
      static_level: 0.02,
      overhead_all_green: true,
    });
    expect(presetWorld("p3_start", { fire_side: "right" })).toMatchObject({
      light_rig: "storm",
      fire: { side: "right", level: "wisp" },
      propeller_stopped: "right",
      engine_hum: "one_engine",
      weather: "storm",
      fog: 0.035,
      turbulence: 0.15,
      static_level: 0.04,
    });
    expect(presetWorld("landed")).toMatchObject({
      light_rig: "dawn",
      pilot: { slumped: false, seat_back: true, awake: true },
      engine_hum: "off",
      weather: "clear_dawn",
      landing_lights: true,
      runway: "stopped",
    });
  });

  it("covers the in-between states the shot list needs", () => {
    expect(presetWorld("p2_half").fire.level).toBe("half");
    expect(presetWorld("p2_extinguished")).toMatchObject({
      fire: { level: "wisp" },
      fire_bell: false,
      light_rig: "night_calm",
    });
    expect(presetWorld("p3_runway")).toMatchObject({ runway: "far", landing_lights: true });
    expect(presetWorld("p3_rolling").runway).toBe("rolling");
  });

  it("defaults the fire side to the demo's RIGHT", () => {
    expect(presetWorld("p2_start").fire.side).toBe("right");
  });

  it("defaults each in-phase preset to its station shot (§F18.5)", () => {
    for (const name of PRESET_NAMES) {
      expect(SHOT_IDS).toContain(presetShot(name));
      const station = presetStation(name);
      if (station && name !== "landed") expect(presetShot(name)).toBe(station.toUpperCase());
    }
    expect(presetShot("lobby")).toBe("WIDE_INTERIOR");
    expect(presetShot("landed")).toBe("FLYER_DEFAULT");
  });

  it("names a starting preset for every cinematic", () => {
    for (const id of CINEMATIC_IDS) expect(PRESET_NAMES).toContain(PRESET_BEFORE[id]);
  });
});

describe("dev fixtures: flyer_view and room_state", () => {
  it("builds a Part A flyer_view with every station object and nothing interactive", () => {
    const view = presetFlyerView({ preset: "p2_start", fire_side: "left" });
    expect(view.type).toBe("flyer_view");
    expect(view.interactive).toEqual([]);
    expect(view.quick_replies).toBeNull();
    const ids = STATIONS_FILE.stations.flatMap((s) => s.controls.map((c) => c.id));
    expect(Object.keys(view.objects).sort()).toEqual([...ids].sort());
    // the rolled fire-side lamp is lit on that side only
    expect(view.objects.PD_FIRE_LAMP_L).toMatchObject({ kind: "lamp", color: "red" });
    expect(view.objects.PD_FIRE_LAMP_R).toMatchObject({ kind: "lamp", color: null });
  });

  it("lamp overrides win over the preset", () => {
    const view = presetFlyerView({
      preset: "p1_start",
      lamps: parseLamps("OH_MASTER_LAMP:blue"),
    });
    expect(view.objects.OH_MASTER_LAMP).toEqual({
      kind: "lamp",
      color: "blue",
      blinking: false,
      attention: false,
    });
  });

  it("drives the store like a server: the Flyer's gender comes from room_state", () => {
    useStore.getState().reset();
    useStore.getState().receive(fixtureRoomState("male"));
    useStore.getState().receive(presetFlyerView({ preset: "p3_start" }));
    const s = useStore.getState();
    expect(selectGenderOf(s, "flyer")).toBe("male");
    expect(s.flyer.station).toBe("front");
    expect(s.flyer.world?.weather).toBe("storm");
    useStore.getState().reset();
  });
});

describe("dev fixtures: ?lamps= parser", () => {
  it("parses color, blink and ring flags", () => {
    expect(parseLamps("OH_MASTER_LAMP:red:blink:ring,FP_GEAR_LAMP_3:red")).toEqual({
      OH_MASTER_LAMP: { kind: "lamp", color: "red", blinking: true, attention: true },
      FP_GEAR_LAMP_3: { kind: "lamp", color: "red", blinking: false, attention: false },
    });
    expect(parseLamps("FP_WARN_LAMP:off")).toEqual({
      FP_WARN_LAMP: { kind: "lamp", color: null, blinking: false, attention: false },
    });
    expect(parseLamps(null)).toEqual({});
    expect(parseLamps("")).toEqual({});
  });

  it("rejects unknown lamps, non-lamps, colors and flags", () => {
    expect(() => parseLamps("NOPE:red")).toThrow(FixtureError);
    expect(() => parseLamps("OH_BTN_1:red")).toThrow(FixtureError);
    expect(() => parseLamps("OH_MASTER_LAMP:pink")).toThrow(FixtureError);
    expect(() => parseLamps("OH_MASTER_LAMP:red:wobble")).toThrow(FixtureError);
  });
});
