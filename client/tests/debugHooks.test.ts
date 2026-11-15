import { afterEach, describe, expect, it, vi } from "vitest";
import { installDebugHooks, recordFrame, stats, waitFrames } from "../src/dev/debugHooks";

afterEach(() => {
  delete window.__wingin;
});

describe("window.__wingin (§F18.5)", () => {
  it("installs ready / setWorld / setShot / seek / stats and uninstalls cleanly", async () => {
    const setWorld = vi.fn(() => Promise.resolve());
    const setShot = vi.fn(() => Promise.resolve());
    const uninstall = installDebugHooks({ setWorld, setShot });
    const hooks = window.__wingin;
    expect(hooks).toBeDefined();
    if (!hooks) return;
    expect(hooks.ready).toBeInstanceOf(Promise);
    await hooks.setWorld("p2_start", { fire_side: "left" });
    expect(setWorld).toHaveBeenCalledWith("p2_start", { fire_side: "left" });
    await hooks.setShot("RIGHT_WINDOW");
    expect(setShot).toHaveBeenCalledWith("RIGHT_WINDOW");
    expect(typeof hooks.stats().fps).toBe("number");
    uninstall();
    expect(window.__wingin).toBeUndefined();
  });

  it("seek rejects in the scene sandbox (the cinematic scrubber provides it)", async () => {
    installDebugHooks({ setWorld: () => Promise.resolve(), setShot: () => Promise.resolve() });
    await expect(window.__wingin?.seek("p2_intro", 0.8)).rejects.toThrow(/cinematic scrubber/);
  });

  it("a newer install wins; an older uninstall leaves it alone", () => {
    const a = installDebugHooks({
      setWorld: () => Promise.resolve(),
      setShot: () => Promise.resolve(),
    });
    const first = window.__wingin;
    const b = installDebugHooks({
      setWorld: () => Promise.resolve(),
      setShot: () => Promise.resolve(),
    });
    const second = window.__wingin;
    expect(second).not.toBe(first);
    a();
    expect(window.__wingin).toBe(second);
    b();
    expect(window.__wingin).toBeUndefined();
  });

  it("stats() reports the last frame's draw calls / triangles and fps over 1 s", () => {
    // 61 frames ~16.7 ms apart = 1 s → 60 fps
    const t0 = 50_000;
    for (let i = 0; i <= 60; i++) recordFrame(t0 + (i * 1000) / 60, 120 + i, 9000);
    const s = stats();
    expect(s.calls).toBe(180);
    expect(s.triangles).toBe(9000);
    expect(s.fps).toBeGreaterThanOrEqual(59);
    expect(s.fps).toBeLessThanOrEqual(61);
  });

  it("waitFrames resolves after exactly n rendered frames", async () => {
    let done = false;
    const p = waitFrames(3).then(() => {
      done = true;
    });
    recordFrame(100_000, 1, 1);
    recordFrame(100_016, 1, 1);
    await Promise.resolve();
    expect(done).toBe(false);
    recordFrame(100_033, 1, 1);
    await p;
    expect(done).toBe(true);
  });

  it("ready resolves once frames have rendered (fonts + settle)", async () => {
    installDebugHooks({ setWorld: () => Promise.resolve(), setShot: () => Promise.resolve() });
    const ready = window.__wingin?.ready;
    for (let i = 0; i < 40; i++) {
      recordFrame(200_000 + i * 16, 1, 1);
      await Promise.resolve();
    }
    await expect(ready).resolves.toBeUndefined();
  });
});
