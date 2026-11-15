// The partner's live voice in voice rooms: PCM16 decode, the jitter buffer, and the socket's
// binary-frame routing (binary frames reach the player, never the store reducer).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodePcm16,
  JITTER_TARGET_S,
  MAX_BUFFER_S,
  PartnerVoicePlayer,
  VOICE_RATE,
  type VoiceContext,
} from "../src/audio/partnerVoice";
import { useStore } from "../src/state/store";
import { FakeWebSocket } from "./fixtures/fakeWebSocket";
import { roomState, welcome } from "./fixtures/messages";

const pv = vi.hoisted(() => ({ frames: [] as ArrayBuffer[] }));

vi.mock("../src/audio/partnerVoice", async (orig) => {
  const real = await orig<typeof import("../src/audio/partnerVoice")>();
  return { ...real, receivePartnerAudio: (c: ArrayBuffer) => pv.frames.push(c) };
});

const { connect, leaveRoom } = await import("../src/net/socket");

/** A chunk of `samples` PCM16 samples (100 ms = 1,600 samples = 3,200 bytes). */
function chunk(samples = 1600, value = 0): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(samples * 2));
  for (let i = 0; i < samples; i++) view.setInt16(i * 2, value, true);
  return view.buffer;
}

/** A context whose clock the test moves; records every `start(at)`. */
function fakeCtx() {
  const starts: number[] = [];
  const ctx = {
    currentTime: 0,
    createBuffer: (_ch: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null as unknown,
      onended: null as unknown,
      connect: () => {},
      disconnect: () => {},
      start: (at: number) => starts.push(at),
      stop: () => {},
    }),
  };
  // The fake implements only what the player touches.
  return { ctx: ctx as unknown as VoiceContext & { currentTime: number }, starts };
}

describe("decodePcm16", () => {
  it("reads little-endian Int16 into [-1, 1)", () => {
    const view = new DataView(new ArrayBuffer(8));
    view.setInt16(0, 0, true);
    view.setInt16(2, 16384, true);
    view.setInt16(4, -32768, true);
    view.setInt16(6, 32767, true);
    const out = new Float32Array(4);
    expect(decodePcm16(view.buffer, out)).toBe(4);
    expect([...out]).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it("ignores a trailing odd byte and never writes past the output", () => {
    expect(decodePcm16(new ArrayBuffer(7), new Float32Array(8))).toBe(3);
    expect(decodePcm16(new ArrayBuffer(16), new Float32Array(2))).toBe(2);
  });
});

describe("PartnerVoicePlayer jitter buffer", () => {
  const out = {} as AudioNode;
  const dur = 1600 / VOICE_RATE;

  it("primes behind the jitter target and schedules chunks back to back", () => {
    const { ctx, starts } = fakeCtx();
    ctx.currentTime = 10;
    const p = new PartnerVoicePlayer(ctx, out);
    p.push(chunk());
    p.push(chunk());
    expect(starts[0]).toBeCloseTo(10 + JITTER_TARGET_S);
    expect(starts[1]).toBeCloseTo(10 + JITTER_TARGET_S + dur);
    expect(p.bufferedSeconds()).toBeCloseTo(JITTER_TARGET_S + 2 * dur);
  });

  it("re-primes after reset (channel released): the next transmission starts fresh", () => {
    const { ctx, starts } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    for (let i = 0; i < 3; i++) p.push(chunk());
    ctx.currentTime = 0.05; // queue still well ahead of the clock
    p.reset();
    p.push(chunk());
    expect(starts.at(-1)).toBeCloseTo(0.05 + JITTER_TARGET_S);
  });

  it("re-primes after an underrun", () => {
    const { ctx, starts } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    p.push(chunk());
    ctx.currentTime = 2; // the queue ran dry long ago
    p.push(chunk());
    expect(starts.at(-1)).toBeCloseTo(2 + JITTER_TARGET_S);
  });

  it("drops chunks that would queue more than MAX_BUFFER_S", () => {
    const { ctx, starts } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    const results = Array.from({ length: 10 }, () => p.push(chunk()));
    expect(results).toContain("dropped");
    expect(p.bufferedSeconds()).toBeLessThanOrEqual(MAX_BUFFER_S + 1e-9);
    expect(starts.length).toBe(results.filter((r) => r === "queued").length);
    // the clock moves on, the queue drains, and chunks are accepted again
    ctx.currentTime = 0.3;
    expect(p.push(chunk())).toBe("queued");
  });

  it("ignores empty frames", () => {
    const { ctx, starts } = fakeCtx();
    expect(new PartnerVoicePlayer(ctx, out).push(new ArrayBuffer(0))).toBe("empty");
    expect(starts).toEqual([]);
  });
});

describe("socket binary frames", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    pv.frames.length = 0;
    useStore.getState().reset();
  });
  afterEach(() => {
    leaveRoom();
    vi.unstubAllGlobals();
  });

  it("hands binary frames to the partner-voice player and never to the store", () => {
    connect("VOIC");
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error("no socket");
    ws.emit(welcome({ room_code: "VOIC", voice: true }));
    const receive = vi.spyOn(useStore.getState(), "receive");
    const frame = chunk(1600, 1234);
    ws.emitBinary(frame);
    expect(pv.frames).toEqual([frame]);
    expect(receive).not.toHaveBeenCalled();
    ws.emit(roomState({ code: "VOIC", voice: true }));
    expect(receive).toHaveBeenCalledTimes(1);
    expect(useStore.getState().room?.voice).toBe(true);
    expect(useStore.getState().welcome?.voice).toBe(true);
  });
});
