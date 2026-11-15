// installPartnerVoice: playback only in voice rooms, a fresh jitter buffer when the partner
// releases the channel, the radio squelch on the partner's key-up / release.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/state/store";
import { flyerPlayer, player, roomState, welcome } from "./fixtures/messages";

const audio = vi.hoisted(() => ({
  starts: [] as number[],
  played: [] as string[],
  time: 0,
  locked: false,
  nodes: 0,
  ramps: [] as number[],
}));

vi.mock("../src/audio/sfx", () => {
  const node = () => {
    audio.nodes++;
    const n = {
      type: "",
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: {
        value: 0,
        cancelScheduledValues: () => {},
        setValueAtTime: () => {},
        linearRampToValueAtTime: (v: number) => audio.ramps.push(v),
      },
      connect: (next: unknown) => next,
      disconnect: () => {},
    };
    return n;
  };
  const ctx = {
    get currentTime() {
      return audio.time;
    },
    createBiquadFilter: node,
    createGain: node,
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      connect: () => {},
      disconnect: () => {},
      start: (at: number) => audio.starts.push(at),
      stop: () => {},
    }),
  };
  return {
    runningRadioBus: () => (audio.locked ? null : { ctx, bus: node() }),
    sfx: { play: (name: string) => audio.played.push(name) },
  };
});

const { installPartnerVoice, receivePartnerAudio, JITTER_TARGET_S } =
  await import("../src/audio/partnerVoice");

const frame = () => new ArrayBuffer(3200);

function enterRoom(voice: boolean) {
  const s = useStore.getState();
  s.receive(welcome({ mock_speech: false, voice }));
  s.receive({
    type: "joined",
    player_id: "p-flyer",
    token: "t",
    role: "flyer",
    lang: "en",
    gender: "female",
    name: "Me",
  });
  s.receive(roomState({ mock_speech: false, voice, players: [player(), flyerPlayer()] }));
}

const channel = (busy_by: "flyer" | "tower" | null) =>
  useStore.getState().receive({ type: "channel", busy_by });

let uninstall: () => void = () => {};

beforeEach(() => {
  useStore.getState().reset();
  audio.starts.length = 0;
  audio.played.length = 0;
  audio.time = 0;
  audio.locked = false;
  audio.nodes = 0;
  audio.ramps.length = 0;
});
afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

describe("installPartnerVoice", () => {
  it("drops audio outside voice rooms", () => {
    uninstall = installPartnerVoice();
    enterRoom(false);
    channel("tower");
    receivePartnerAudio(frame());
    expect(audio.starts).toEqual([]);
    expect(audio.played).toEqual([]);
  });

  it("plays the partner, squelches, and re-primes after the channel is released", () => {
    vi.useFakeTimers();
    uninstall = installPartnerVoice();
    enterRoom(true);
    channel("tower");
    expect(audio.played).toEqual(["radio_in"]);
    receivePartnerAudio(frame());
    receivePartnerAudio(frame());
    expect(audio.starts).toHaveLength(2);
    expect(audio.starts[0]).toBeCloseTo(JITTER_TARGET_S);

    audio.time = 0.1; // 0.22 s of voice still scheduled (until 0.32)
    channel(null);
    vi.advanceTimersByTime(150);
    expect(audio.played).toEqual(["radio_in"]); // the last word is not covered
    vi.advanceTimersByTime(100);
    expect(audio.played).toEqual(["radio_in", "radio_out"]);
    audio.time = 1;
    channel("tower");
    receivePartnerAudio(frame());
    expect(audio.starts[2]).toBeCloseTo(1 + JITTER_TARGET_S);
  });

  it("a voice+mock room plays nothing", () => {
    uninstall = installPartnerVoice();
    enterRoom(true);
    useStore.getState().receive(welcome({ mock_speech: true, voice: true }));
    channel("tower");
    receivePartnerAudio(frame());
    expect(audio.starts).toEqual([]);
  });

  it("changing the partner volume live ramps the chain gain", () => {
    uninstall = installPartnerVoice();
    enterRoom(true);
    receivePartnerAudio(frame()); // builds the chain
    useStore.getState().setSettings({ partnerVolume: 0.5 });
    expect(audio.ramps.at(-1)).toBeCloseTo(0.5 * 1.6);
  });

  it("frames while the sound is locked are dropped and build no nodes", () => {
    uninstall = installPartnerVoice();
    enterRoom(true);
    audio.locked = true;
    channel("tower");
    receivePartnerAudio(frame());
    expect(audio.nodes).toBe(0);
    expect(audio.starts).toEqual([]);
  });

  it("no squelch for my own transmissions", () => {
    uninstall = installPartnerVoice();
    enterRoom(true);
    channel("flyer");
    channel(null);
    expect(audio.played).toEqual([]);
  });

  it("stops after uninstall (leaving the room)", () => {
    uninstall = installPartnerVoice();
    enterRoom(true);
    uninstall();
    receivePartnerAudio(frame());
    expect(audio.starts).toEqual([]);
  });
});
