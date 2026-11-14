import { describe, expect, it } from "vitest";
import { STRINGS, translate, type StringEntry } from "../src/i18n/strings";

const entries: [string, StringEntry][] = Object.entries(STRINGS);

describe("strings (§F7)", () => {
  it("has a non-empty en and hi value for every key", () => {
    for (const [key, entry] of entries) {
      expect(entry.en.trim(), key).not.toBe("");
      const hi = entry.hi;
      if (typeof hi === "string") {
        expect(hi.trim(), key).not.toBe("");
      } else {
        expect(hi.m.trim(), key).not.toBe("");
        expect(hi.f.trim(), key).not.toBe("");
      }
    }
  });

  it("looks up the viewer's language", () => {
    expect(translate("en", "app.tagline")).toBe(STRINGS["app.tagline"].en);
    expect(translate("hi", "app.tagline")).toBe(STRINGS["app.tagline"].hi);
  });
});
