// audio/sfx.ts: the shared-context gate (§F16.4). One-shots are dropped while locked; loop
// requests and params are remembered and applied on unlock; settings drive master; mute = 0.
// The real signal path is rendered in e2e/audio.spec.ts (OfflineAudioContext in Chromium).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  instances: 0,
  volume: -1,
  play: [] as string[],
  loop: [] as [string, boolean][],
  params: [] as [string, string, number | string][],
  master: [] as [number, boolean][],
  duck: [] as boolean[],
  stopAll: 0,
}));

vi.mock("../src/audio/engine", () => ({
  AudioEngine: class {
    constructor(_ctx: unknown, _dest: unknown, volume: number) {
      engine.instances++;
      engine.volume = volume;
    }
    play(n: string) {
      engine.play.push(n);
    }
    loop(n: string, on: boolean) {
      engine.loop.push([n, on]);
    }
    setParam(n: string, k: string, v: number | string) {
      engine.params.push([n, k, v]);
    }
    setMaster(v: number, m: boolean) {
      engine.master.push([v, m]);
    }
    duck(on: boolean) {
      engine.duck.push(on);
    }
    stopAll() {
      engine.stopAll++;
    }
  },
}));

class FakeAudioContext extends EventTarget {
  static created = 0;
  state: AudioContextState = "suspended";
  destination = {};
  constructor() {
    super();
    FakeAudioContext.created++;
  }
  resume(): Promise<void> {
    this.state = "running";
    this.dispatchEvent(new Event("statechange"));
    return Promise.resolve();
  }
}

type Sfx = typeof import("../src/audio/sfx");

async function load(): Promise<Sfx> {
  vi.resetModules(); // fresh singletons (context, engine, store) per test
  return import("../src/audio/sfx");
}

beforeEach(() => {
  engine.instances = 0;
  engine.play.length = 0;
  engine.loop.length = 0;
  engine.params.length = 0;
  engine.master.length = 0;
  engine.duck.length = 0;
  engine.stopAll = 0;
  FakeAudioContext.created = 0;
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sfx without Web Audio (jsdom, old browsers)", () => {
  it("never throws and reports locked", async () => {
    const m = await load();
    expect(() => {
      m.sfx.play("chime");
      m.sfx.loop("rain", true);
      m.sfx.setParam("static", "gain", 0.02);
      m.duckAmbience(true);
    }).not.toThrow();
    await m.unlockAudio();
    expect(m.audioUnlocked()).toBe(false);
    expect(engine.instances).toBe(0);
  });

  it("volume and mute persist through the store settings (wingin:settings)", async () => {
    const m = await load();
    const { useStore: store } = await import("../src/state/store");
    m.setMasterVolume(0.8);
    m.setMuted(true);
    expect(store.getState().settings).toMatchObject({ volume: 0.8, muted: true });
    expect(JSON.parse(localStorage.getItem("wingin:settings") ?? "{}")).toMatchObject({
      volume: 0.8,
      muted: true,
    });
    m.setMasterVolume(7);
    expect(store.getState().settings.volume).toBe(1);
  });
});

describe("sfx with a shared AudioContext", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  it("creates one context, drops one-shots while locked, starts wanted loops on unlock", async () => {
    const m = await load();
    m.sfx.play("chime"); // no context yet: dropped
    m.sfx.loop("engine_hum", true);
    m.sfx.loop("alarm_master", true);
    m.sfx.loop("alarm_master", false);
    m.sfx.setParam("engine_hum", "mode", "one_engine");
    expect(m.audioUnlocked()).toBe(false);

    await m.unlockAudio();
    await m.unlockAudio();
    expect(FakeAudioContext.created).toBe(1);
    expect(m.audioUnlocked()).toBe(true);
    expect(engine.params).toContainEqual(["engine_hum", "mode", "one_engine"]);
    expect(engine.loop).toContainEqual(["engine_hum", true]);
    expect(engine.loop).toContainEqual(["alarm_master", false]);
    expect(engine.play).toEqual([]);

    m.sfx.play("chime");
    expect(engine.play).toEqual(["chime"]);
    expect(m.wantedLoopNames()).toEqual(["engine_hum"]);
  });

  it("notifies state listeners (the sound chip) when the context starts", async () => {
    const m = await load();
    const seen: boolean[] = [];
    const off = m.onAudioStateChange(() => seen.push(m.audioUnlocked()));
    await m.unlockAudio();
    off();
    expect(seen.at(-1)).toBe(true);
  });

  it("master follows the persisted settings; mute zeroes it", async () => {
    localStorage.setItem("wingin:settings", JSON.stringify({ volume: 0.3, muted: true }));
    const m = await load();
    await m.unlockAudio();
    expect(engine.volume).toBe(0); // created muted
    m.setMuted(false);
    expect(engine.master.at(-1)).toEqual([0.3, false]);
    m.setMasterVolume(0.6);
    expect(engine.master.at(-1)).toEqual([0.6, false]);
  });

  it("ducking is remembered before the context exists and forwarded after", async () => {
    const m = await load();
    m.duckAmbience(true);
    await m.unlockAudio();
    expect(engine.duck).toEqual([true]);
    m.duckAmbience(false);
    expect(engine.duck).toEqual([true, false]);
    m.stopAllLoops();
    expect(engine.stopAll).toBe(1);
    expect(m.wantedLoopNames()).toEqual([]);
  });
});
