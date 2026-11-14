import { describe, expect, it } from "vitest";
import {
  cellPitch,
  controlLocalPosition,
  findControl,
  getStation,
  parseStationsFile,
  PART_TYPES,
  STATE_KIND_FOR_PART,
  STATIONS_FILE,
} from "../src/content/stations";
import { ContentError } from "../src/content/read";

describe("stations.json", () => {
  it("parses all three stations with their grids", () => {
    expect(STATIONS_FILE.stations.map((s) => [s.id, s.grid.cols, s.grid.rows])).toEqual([
      ["overhead", 7, 4],
      ["pedestal", 4, 4],
      ["front", 8, 3],
    ]);
  });

  it("gives every control a part type whose default state has the matching kind", () => {
    for (const control of STATIONS_FILE.stations.flatMap((s) => s.controls)) {
      expect(PART_TYPES).toContain(control.type);
      expect(control.default.kind).toBe(STATE_KIND_FOR_PART[control.type]);
    }
  });

  it("keeps 3D labels to digits, arrows and ASCII (no Devanagari in troika Text)", () => {
    for (const control of STATIONS_FILE.stations.flatMap((s) => s.controls)) {
      if (control.label !== null) expect(control.label).toMatch(/^[0-9←→↑↓]+$/);
    }
  });

  it("applies span/rowspan/size/style defaults", () => {
    const ext = findControl("PD_EXT_BTN")?.control;
    expect(ext).toMatchObject({ span: 2, rowspan: 1, size: "big", style: null });
    expect(findControl("FP_FUEL_GAUGE")?.control).toMatchObject({ span: 1, rowspan: 2 });
    expect(findControl("FP_ENGINE_SW")?.control.style).toBe("guarded");
    expect(findControl("OH_BTN_1")?.control).toMatchObject({ size: "normal", style: null });
    expect(findControl("NOPE")).toBeUndefined();
  });

  it("rejects an unknown part type", () => {
    const bad = {
      ...STATIONS_FILE,
      stations: STATIONS_FILE.stations.map((station, i) =>
        i === 0
          ? {
              ...station,
              controls: station.controls.map((c, j) => (j === 0 ? { ...c, type: "Knob" } : c)),
            }
          : station,
      ),
    };
    expect(() => parseStationsFile(bad)).toThrow(ContentError);
  });

  it("rejects a control outside its grid", () => {
    const bad = {
      ...STATIONS_FILE,
      stations: STATIONS_FILE.stations.map((station) => ({
        ...station,
        controls: station.controls.map((c) => ({ ...c, col: c.col + 20 })),
      })),
    };
    expect(() => parseStationsFile(bad)).toThrow(/leaves the grid/);
  });
});

describe("grid → panel face mapping (§F9.3)", () => {
  it("uses face size / grid as the cell pitch", () => {
    expect(cellPitch(getStation("overhead")).x).toBeCloseTo(0.1714, 3);
    expect(cellPitch(getStation("overhead")).y).toBeCloseTo(0.15, 5);
    expect(cellPitch(getStation("pedestal"))).toEqual({ x: 0.125, y: 0.175 });
    expect(cellPitch(getStation("front")).x).toBeCloseTo(0.25, 5);
    expect(cellPitch(getStation("front")).y).toBeCloseTo(0.1167, 3);
  });

  it("maps row 0 to the top edge and centers spanned cells", () => {
    const overhead = getStation("overhead");
    const btn1 = controlLocalPosition(overhead, { row: 1, col: 0, span: 1, rowspan: 1 });
    expect(btn1.x).toBeCloseTo((0.5 - 3.5) * (1.2 / 7), 6);
    expect(btn1.y).toBeCloseTo((2 - 1 - 0.5) * 0.15, 6);
    expect(btn1.z).toBe(0);

    const pedestal = getStation("pedestal");
    const ext = findControl("PD_EXT_BTN")?.control;
    if (!ext) throw new Error("PD_EXT_BTN missing");
    expect(controlLocalPosition(pedestal, ext).x).toBeCloseTo(0, 6); // span 2 over cols 1–2

    const front = getStation("front");
    const gauge = findControl("FP_FUEL_GAUGE")?.control;
    if (!gauge) throw new Error("FP_FUEL_GAUGE missing");
    const g = controlLocalPosition(front, gauge);
    expect(g.x).toBeCloseTo(3.5 * 0.25, 6);
    expect(g.y).toBeCloseTo((1.5 - 0 - 1) * (0.35 / 3), 6); // rowspan 2 over rows 0–1
  });

  it("keeps every control inside its panel face", () => {
    for (const station of STATIONS_FILE.stations) {
      const pitch = cellPitch(station);
      const halfW = (station.grid.cols * pitch.x) / 2;
      const halfH = (station.grid.rows * pitch.y) / 2;
      for (const control of station.controls) {
        const p = controlLocalPosition(station, control);
        expect(Math.abs(p.x)).toBeLessThan(halfW);
        expect(Math.abs(p.y)).toBeLessThan(halfH);
      }
    }
  });
});
