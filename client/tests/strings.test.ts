import { describe, expect, it } from "vitest";
import type { ErrorCode } from "../src/net/protocol";
import {
  ERROR_REACTIONS,
  GENDERED_KEYS,
  STRINGS,
  TOAST_KEYS,
  translate,
  type StringEntry,
} from "../src/i18n/strings";

const entries: [string, StringEntry][] = Object.entries(STRINGS);

const ALL_ERROR_CODES: ErrorCode[] = [
  "bad_message",
  "room_not_found",
  "room_full",
  "role_taken",
  "not_joined",
  "not_allowed_now",
  "not_your_role",
  "channel_busy",
  "mock_only",
  "lifeline_not_available",
  "no_lifelines",
  "translation_failed",
  "transcribe_failed",
  "dev_disabled",
  "demo_only",
  "rate_limited",
  "internal",
];

describe("strings (§F7)", () => {
  it("has a non-empty en and hi value for every key", () => {
    expect(entries.length).toBeGreaterThan(120);
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

  it("gives every gendered key distinct m and f Hindi forms, and only those keys", () => {
    const gendered = entries.filter(([, e]) => typeof e.hi !== "string").map(([k]) => k);
    expect(gendered.sort()).toEqual([...GENDERED_KEYS].sort());
    for (const key of GENDERED_KEYS) {
      const hi = STRINGS[key].hi;
      expect(typeof hi, key).toBe("object");
      if (typeof hi !== "string") expect(hi.m, key).not.toBe(hi.f);
    }
  });

  it("t() picks the Hindi form by the person's gender; English never varies", () => {
    expect(translate("hi", "ptt.busy_flyer", undefined, "male")).toBe("फ़्लायर बोल रहा है");
    expect(translate("hi", "ptt.busy_flyer", undefined, "female")).toBe("फ़्लायर बोल रही है");
    expect(translate("hi", "toast.partner_back", undefined, "female")).toBe("साथी वापस आ गई!");
    expect(translate("en", "ptt.busy_flyer", undefined, "female")).toBe("Flyer is talking");
    expect(translate("en", "ptt.busy_flyer", undefined, "male")).toBe("Flyer is talking");
  });

  it("interpolates {name} params and leaves unknown ones", () => {
    expect(translate("en", "title.phase", { n: 2, name: "Engine Fire" })).toBe(
      "PHASE 2 — Engine Fire",
    );
    expect(translate("hi", "manual.step", { i: 3, n: 7 })).toBe("कदम 3 / 7");
    expect(translate("en", "hud.seconds")).toBe("{n}s");
  });

  it("deck.header_one is singular in both en and hi (§I4 plural fix)", () => {
    expect(translate("en", "deck.header_one", { n: 1 })).toBe("Your partner taught you 1 word");
    expect(translate("hi", "deck.header_one", { n: 1 })).toBe("आपके साथी ने आपको 1 शब्द सिखाया");
    // Plural form is unaffected.
    expect(translate("en", "deck.header", { n: 2 })).toBe("Your partner taught you 2 words");
    expect(translate("hi", "deck.header", { n: 2 })).toBe("आपके साथी ने आपको 2 शब्द सिखाए");
  });

  it("maps every ToastKey to a string", () => {
    for (const [toastKey, stringKey] of Object.entries(TOAST_KEYS)) {
      expect(stringKey).toBe(toastKey);
      expect(STRINGS[stringKey]).toBeDefined();
    }
  });

  it("maps every error code (§F7.3)", () => {
    expect(Object.keys(ERROR_REACTIONS).sort()).toEqual([...ALL_ERROR_CODES].sort());
    expect(ERROR_REACTIONS.channel_busy).toEqual({ kind: "toast", key: "toast.channel_busy" });
    expect(ERROR_REACTIONS.transcribe_failed).toEqual({ kind: "toast", key: "toast.didnt_catch" });
    expect(ERROR_REACTIONS.room_not_found.kind).toBe("not_found");
    expect(ERROR_REACTIONS.lifeline_not_available.kind).toBe("silent");
  });
});
