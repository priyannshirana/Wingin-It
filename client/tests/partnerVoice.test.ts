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

interface FakeSource {
  id: number;
  at: number;
  stopped: boolean;
}

/** A context whose clock the test moves; records every source (its chunk id = first sample). */
function fakeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    createBuffer: (_ch: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource: () => {
      const rec: FakeSource = { id: -1, at: -1, stopped: false };
      return {
        buffer: null as { getChannelData: () => Float32Array } | null,
        onended: null as unknown,
        connect: () => {},
        disconnect: () => {},
        start(at: number) {
          rec.at = at;
          rec.id = Math.round((this.buffer?.getChannelData()[0] ?? 0) * 32768);
          sources.push(rec);
        },
        stop: () => {
          rec.stopped = true;
        },
      };
    },
  };
  const starts = () => sources.filter((x) => !x.stopped).map((x) => x.at);
  const playing = () => sources.filter((x) => !x.stopped).map((x) => x.id);
  // The fake implements only what the player touches.
  return { ctx: ctx as unknown as VoiceContext & { currentTime: number }, starts, playing };
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
    expect(starts()[0]).toBeCloseTo(10 + JITTER_TARGET_S);
    expect(starts()[1]).toBeCloseTo(10 + JITTER_TARGET_S + dur);
    expect(p.bufferedSeconds()).toBeCloseTo(JITTER_TARGET_S + 2 * dur);
  });

  it("after reset (new transmission) starts behind the jitter target, never over the old tail", () => {
    const { ctx, starts } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    p.push(chunk()); // plays 0.12 → 0.22
    ctx.currentTime = 0.15; // quick re-key while the old chunk still plays
    p.reset();
    p.push(chunk());
    expect(starts().at(-1)).toBeCloseTo(Math.max(0.22, 0.15 + JITTER_TARGET_S));
    ctx.currentTime = 1; // a later transmission after silence
    p.reset();
    p.push(chunk());
    expect(starts().at(-1)).toBeCloseTo(1 + JITTER_TARGET_S);
  });

  it("re-primes after an underrun", () => {
    const { ctx, starts } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    p.push(chunk());
    ctx.currentTime = 2; // the queue ran dry long ago
    p.push(chunk());
    expect(starts().at(-1)).toBeCloseTo(2 + JITTER_TARGET_S);
  });

  it("a PTT burst (2 pre-roll + 3 buffered) keeps the newest audio, drops only pre-roll", () => {
    const { ctx, starts, playing } = fakeCtx();
    ctx.currentTime = 5;
    const p = new PartnerVoicePlayer(ctx, out);
    for (let id = 1; id <= 5; id++) p.push(chunk(1600, id)); // ids 1-2 pre-roll, 3-5 first word
    expect(playing()).toEqual([3, 4, 5]);
    expect(p.dropped).toBe(2);
    expect(starts()[0]).toBeCloseTo(5 + JITTER_TARGET_S);
    expect(p.bufferedSeconds()).toBeLessThanOrEqual(MAX_BUFFER_S + 1e-9);
    // steady streaming afterwards stays within the cap and keeps every new chunk
    for (let id = 6; id <= 12; id++) {
      ctx.currentTime += dur;
      expect(p.push(chunk(1600, id))).toBe("queued");
    }
    expect(playing().slice(-7)).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(p.bufferedSeconds()).toBeLessThanOrEqual(MAX_BUFFER_S + 1e-9);
  });

  it("over the cap mid-stream it skips the oldest unplayed chunk, not the newest", () => {
    const { ctx, playing } = fakeCtx();
    const p = new PartnerVoicePlayer(ctx, out);
    for (let id = 1; id <= 3; id++) p.push(chunk(1600, id)); // 0.12 → 0.42
    ctx.currentTime = 0.13; // chunk 1 is playing
    p.push(chunk(1600, 4));
    p.push(chunk(1600, 5)); // queued until 0.62: 0.49 s ahead
    expect(p.push(chunk(1600, 6))).toBe("trimmed"); // 0.72 - 0.13 > 0.5
    expect(playing()).toEqual([1, 3, 4, 5, 6]);
    expect(p.bufferedSeconds()).toBeLessThanOrEqual(MAX_BUFFER_S + 1e-9);
  });

  it("ignores empty frames", () => {
    const { ctx, starts } = fakeCtx();
    expect(new PartnerVoicePlayer(ctx, out).push(new ArrayBuffer(0))).toBe("empty");
    expect(starts()).toEqual([]);
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
