import { cleanup, renderHook } from "@testing-library/react";
import { BoxGeometry, SphereGeometry } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOT_IDS, SHOTS, type ShotId } from "../src/cinematics/cameraRig";
import { presetFlyerView } from "../src/dev/fixtures";
import { FIRST_PERSON_RADIUS, isFirstPerson } from "../src/scene/characters/firstPerson";
import { fireLevel } from "../src/scene/env/drivers";
import { mergeParts } from "../src/scene/env/merge";
import {
  cinematicActive,
  REST_WORLD,
  stageOf,
  useWorldSync,
  type WorldApply,
} from "../src/scene/env/worldSync";
import { cinematic, gameState } from "./fixtures/messages";
import { getRef, registerRef } from "../src/scene/sceneRefs";
import { useStore } from "../src/state/store";

const vec = (p: readonly [number, number, number]) => ({ x: p[0], y: p[1], z: p[2] });
const FIRST_PERSON: ShotId[] = ["FLYER_DEFAULT", "OVERHEAD", "PEDESTAL", "FRONT", "RIGHT_WINDOW"];

describe("FlyerAvatar visibility (§F9.8): hidden in first-person shots", () => {
  it("every first-person shot hides the Flyer's own character", () => {
    for (const id of FIRST_PERSON) expect(isFirstPerson(vec(SHOTS[id].position)), id).toBe(true);
  });

  it("third-person shots show it", () => {
    const third = SHOT_IDS.filter(
      (id) => !FIRST_PERSON.includes(id) && id !== "LEFT_WINDOW" && id !== "PILOT",
    );
    expect(third).toEqual(["WIDE_INTERIOR", "EXT_SIDE", "EXT_CHASE", "EXT_FRONT_LOW"]);
    for (const id of third) expect(isFirstPerson(vec(SHOTS[id].position)), id).toBe(false);
  });

  it("LEFT_WINDOW looks away from the Flyer's seat, so the character is behind the camera", () => {
    const { position: p, target: t } = SHOTS.LEFT_WINDOW;
    const view = [t[0] - p[0], t[1] - p[1], t[2] - p[2]] as const;
    const toHead = [0.5 - p[0], 1.3 - p[1], 0.35 - p[2]] as const;
    expect(view[0] * toHead[0] + view[1] * toHead[1] + view[2] * toHead[2]).toBeLessThan(0);
  });

  it("PILOT shoots from beside the pedestal with the Flyer's head well out of frame", () => {
    const { position: p, target: t } = SHOTS.PILOT;
    const view = [t[0] - p[0], t[1] - p[1], t[2] - p[2]] as const;
    const toHead = [0.5 - p[0], 1.3 - p[1], 0.35 - p[2]] as const;
    const cos =
      (view[0] * toHead[0] + view[1] * toHead[1] + view[2] * toHead[2]) /
      (Math.hypot(...view) * Math.hypot(...toHead));
    // Half the horizontal FOV at 16:10 with the 55° vertical FOV is ~40°.
    expect((Math.acos(cos) * 180) / Math.PI).toBeGreaterThan(45);
  });

  it("uses a radius that stays well inside the nearest third-person shot", () => {
    const wide = vec(SHOTS.WIDE_INTERIOR.position);
    const d = Math.hypot(wide.x - 0.5, wide.y - 1.3, wide.z - 0.35);
    expect(d).toBeGreaterThan(FIRST_PERSON_RADIUS + 0.3);
  });
});

describe("stages: the cockpit set and the exterior-plane set never show each other", () => {
  it("puts cockpit shots on the cockpit stage and EXT_* on the exterior stage", () => {
    for (const id of SHOT_IDS) {
      const expected = id.startsWith("EXT_") ? "exterior" : "cockpit";
      expect(stageOf(vec(SHOTS[id].position)), id).toBe(expected);
    }
  });
});

describe("wing fire levels (§F9.7)", () => {
  it("maps every World fire level to flame / smoke amounts", () => {
    expect(fireLevel("full")).toMatchObject({ flames: 1, size: 1, smoke: 1 });
    expect(fireLevel("half")).toMatchObject({ flames: 0.5, size: 0.7 });
    expect(fireLevel("smoke")).toMatchObject({ flames: 0, smoke: 1 });
    expect(fireLevel("wisp")).toMatchObject({ flames: 0, smoke: 0.2 });
    expect(fireLevel("flicker")).toMatchObject({ flames: 0.25, flicker: 1 });
    expect(fireLevel("none")).toMatchObject({ flames: 0, smoke: 0 });
    for (const lv of ["full", "half", "smoke", "wisp", "flicker", "none"] as const) {
      expect(fireLevel(lv).boom).toBe(0);
    }
  });
});

describe("static merging (§F21 draw calls)", () => {
  it("bakes per-part colors into one geometry", () => {
    const a = new BoxGeometry(1, 1, 1);
    const b = new SphereGeometry(1, 8, 6);
    const expected =
      a.toNonIndexed().getAttribute("position").count +
      b.toNonIndexed().getAttribute("position").count;
    const merged = mergeParts([
      { geo: a, color: "#ff0000", at: [1, 0, 0] },
      { geo: b, color: "#0000ff", scale: 2 },
    ]);
    expect(merged.getAttribute("position").count).toBe(expected);
    const color = merged.getAttribute("color");
    expect(color.getX(0)).toBeCloseTo(1);
    expect(color.getZ(color.count - 1)).toBeCloseTo(1);
    expect(merged.getAttribute("uv")).toBeUndefined();
  });
});

describe("scene refs registry", () => {
  it("registers, returns and unregisters (only the current owner unregisters)", () => {
    const sky = { storm: 0, dawn: 0, moon: 1, stars: 1, sun: 0 };
    const off = registerRef("sky", sky);
    expect(getRef("sky")).toBe(sky);
    const next = { ...sky };
    const offNext = registerRef("sky", next);
    off();
    expect(getRef("sky")).toBe(next);
    offNext();
    expect(getRef("sky")).toBeUndefined();
  });
});

describe("useWorldSync (World → drivers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useStore.getState().reset();
  });

  it("snaps on mount from the LOBBY world when no flyer_view has arrived", () => {
    const seen: [string, boolean][] = [];
    const apply: WorldApply = (w, tw) => seen.push([w.light_rig, tw.snap]);
    renderHook(() => useWorldSync(apply, 1));
    expect(seen).toEqual([[REST_WORLD.light_rig, true]]);
  });

  it("tweens on a new world, waits while a cinematic plays, re-syncs shortly after", () => {
    const seen: string[] = [];
    const apply: WorldApply = (w, tw) => seen.push(`${w.light_rig}:${tw.snap ? "snap" : "tween"}`);
    renderHook(() => useWorldSync(apply, 1));
    const { receive, setCinePlaying } = useStore.getState();
    receive(presetFlyerView({ preset: "p1_start" }));
    expect(seen.at(-1)).toBe("night_alarm:tween");

    // A cinematic owns the drivers: a world arriving mid-cinematic is not applied yet.
    setCinePlaying(true);
    receive(presetFlyerView({ preset: "p2_start" }));
    expect(seen.at(-1)).toBe("night_alarm:tween");

    // It is applied shortly after the cinematic ends (it arrived after the cinematic started).
    setCinePlaying(false);
    vi.advanceTimersByTime(700);
    expect(seen.at(-1)).toBe("fire:tween");
  });

  it("a follow-up cinematic cancels the re-sync, and a stale world waits for a newer one", () => {
    const seen: string[] = [];
    const apply: WorldApply = (w) => seen.push(w.light_rig);
    renderHook(() => useWorldSync(apply, 1));
    const { receive, setCinePlaying } = useStore.getState();
    receive(presetFlyerView({ preset: "p1_start" }));
    setCinePlaying(true);
    setCinePlaying(false);
    vi.advanceTimersByTime(300);
    setCinePlaying(true); // the next cinematic starts inside the re-sync window
    vi.advanceTimersByTime(1000);
    setCinePlaying(false);
    // p1_start predates this cinematic: no re-apply of the stale world right away …
    const before = seen.length;
    vi.advanceTimersByTime(700);
    expect(seen.length).toBe(before);
    // … the newer world applies the moment it arrives …
    receive(presetFlyerView({ preset: "p2_start" }));
    expect(seen.at(-1)).toBe("fire");
  });

  it("falls back to re-applying the current world when no newer one arrives", () => {
    const seen: string[] = [];
    const apply: WorldApply = (w) => seen.push(w.light_rig);
    renderHook(() => useWorldSync(apply, 1));
    const { receive, setCinePlaying } = useStore.getState();
    receive(presetFlyerView({ preset: "p1_start" }));
    setCinePlaying(true);
    setCinePlaying(false);
    const before = seen.length;
    vi.advanceTimersByTime(5000);
    expect(seen.length).toBe(before);
    vi.advanceTimersByTime(3100);
    expect(seen.length).toBe(before + 1);
  });

  it("never re-syncs while the room stays in CRASH (the POOF has no automatic end)", () => {
    const seen: string[] = [];
    const apply: WorldApply = (w) => seen.push(w.light_rig);
    renderHook(() => useWorldSync(apply, 1));
    const { receive, setCinePlaying } = useStore.getState();
    receive(presetFlyerView({ preset: "p2_start" }));
    receive(gameState({ status: "CRASH" }));
    receive(cinematic({ id: "crash", start_at_ms: Date.now(), duration_ms: 5000 }));
    setCinePlaying(true);
    setCinePlaying(false); // the 5 s timeline ended, the room is still CRASH
    receive(presetFlyerView({ preset: "p1_start" })); // e.g. a late or stale view
    const before = seen.length;
    vi.advanceTimersByTime(20_000);
    expect(seen.length).toBe(before);
    expect(cinematicActive(useStore.getState())).toBe(true);
  });
});

// The Lamp source as raw text through Vite (like privacy.test.ts).
const LAMP_SOURCE: string = Object.values(
  import.meta.glob<string>("../src/scene/parts/Lamp.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
).join("");

describe("lamps never draw `attention` (§A6)", () => {
  it("Lamp.tsx does not read the attention flag", () => {
    expect(LAMP_SOURCE.length).toBeGreaterThan(100);
    const src = LAMP_SOURCE;
    // Comments may mention it; code must not touch it.
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/attention/);
    expect(code).not.toMatch(/\bring\b|ringMat/);
  });
});
