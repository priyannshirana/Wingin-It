import { describe, expect, it } from "vitest";
import {
  CINEMATIC_IDS,
  CINEMATICS_FILE,
  cinematicDurationMs,
  parseCinematicsFile,
} from "../src/content/cinematics";
import { ContentError } from "../src/content/read";

describe("cinematics.json (§A10)", () => {
  it("has every cinematic id with the contract durations", () => {
    expect(Object.keys(CINEMATICS_FILE.cinematics).sort()).toEqual([...CINEMATIC_IDS].sort());
    expect(CINEMATICS_FILE.lead_ms).toBe(300);
    expect(cinematicDurationMs("prologue")).toBe(28000);
    expect(cinematicDurationMs("prologue", { demo: true })).toBe(12000);
    expect(cinematicDurationMs("p1_intro")).toBe(1200);
    expect(cinematicDurationMs("p1_intro", { retry: true })).toBe(3200);
    expect(cinematicDurationMs("p2_intro", { retry: true })).toBe(9000);
    expect(cinematicDurationMs("ending", { demo: true })).toBe(4000);
    expect(cinematicDurationMs("crash")).toBe(5000);
  });

  it("marks only the crash as unskippable", () => {
    const unskippable = CINEMATIC_IDS.filter((id) => !CINEMATICS_FILE.cinematics[id].skippable);
    expect(unskippable).toEqual(["crash"]);
  });

  it("rejects unknown or missing ids", () => {
    expect(() => parseCinematicsFile({ lead_ms: 300, cinematics: {} })).toThrow(ContentError);
    const extra = {
      ...CINEMATICS_FILE,
      cinematics: {
        ...CINEMATICS_FILE.cinematics,
        bonus: { kind: "state", duration_ms: 1, skippable: true },
      },
    };
    expect(() => parseCinematicsFile(extra)).toThrow(ContentError);
  });
});
