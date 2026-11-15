// audio/mic.ts: the pre-roll ring keeps the last 2 chunks; a capture graph that fails after
// getUserMedia stops the tracks (recording indicator off) and a retry opens one fresh stream.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/state/store";

const ctx = vi.hoisted(() => ({ addModule: vi.fn<(url: URL) => Promise<void>>() }));

vi.mock("../src/audio/sfx", () => ({
  unlockAudio: () => Promise.resolve(),
  getAudioContext: () => ({ audioWorklet: { addModule: ctx.addModule } }),
}));

const { initMic, onWorkletChunk, preroll, resetMicForTests, PREROLL_CHUNKS } =
  await import("../src/audio/mic");

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } };
}

beforeEach(() => {
  useStore.getState().reset();
  resetMicForTests();
  ctx.addModule.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("mic", () => {
  it("keeps exactly the last 200 ms (2 chunks) as pre-roll", () => {
    expect(PREROLL_CHUNKS).toBe(2);
    const chunks = [1, 2, 3].map(() => new ArrayBuffer(3200));
    for (const c of chunks) onWorkletChunk(c);
    expect(preroll()).toEqual([chunks[1], chunks[2]]);
  });

  it("stops the tracks when the graph fails after getUserMedia, and retries cleanly", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const gum = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: gum },
      configurable: true,
    });
    ctx.addModule.mockRejectedValueOnce(new Error("worklet failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await initMic();
    expect(first.track.stop).toHaveBeenCalledTimes(1);
    expect(useStore.getState().mic.permission).toBe("denied");
    expect(warn).toHaveBeenCalled();

    ctx.addModule.mockRejectedValueOnce(new Error("again"));
    await initMic(); // the retry opens one new stream and cleans it up the same way
    expect(gum).toHaveBeenCalledTimes(2);
    expect(second.track.stop).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("a denied prompt is reported without a stream to clean up", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")),
      },
      configurable: true,
    });
    await initMic();
    expect(useStore.getState().mic.permission).toBe("denied");
    expect(ctx.addModule).not.toHaveBeenCalled();
  });
});
