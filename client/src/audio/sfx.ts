// Procedural sound engine (§F16.4). FINAL PUBLIC API: everything else in the client only calls
// these functions. The recipes live in recipes.ts, the bus graph in engine.ts.
//
//   master (volume × mute; default 0.5)
//    ├─ sfxBus      one-shots                         gain 1.0
//    ├─ ambienceBus loops (engine, rain, static, …)   gain 1.0, ducked to 0.5 while the radio is busy
//    └─ radioBus    radio_in / radio_out              gain 0.6
//
// One shared AudioContext, created on the first user gesture (`unlockAudio`). Until it runs,
// one-shots are dropped (so nothing piles up and blasts on unlock) while loop requests and
// parameters are remembered and started as soon as the context runs.
import { useStore } from "../state/store";
import { AudioEngine } from "./engine";
import type { SfxName, SfxParam } from "./names";

export { SFX_NAMES, isSfxName, type SfxName, type SfxParam } from "./names";

let ctx: AudioContext | null = null;
let engine: AudioEngine | null = null;
const wantedLoops = new Map<SfxName, boolean>();
const wantedParams = new Map<string, [SfxName, SfxParam, number | string]>();
let ducked = false;
const stateListeners = new Set<() => void>();

function supported(): boolean {
  return typeof AudioContext !== "undefined";
}

function running(): boolean {
  return ctx?.state === "running";
}

function applySettings(): void {
  const { volume, muted } = useStore.getState().settings;
  engine?.setMaster(volume, muted);
}

function onStateChange(): void {
  if (running() && engine) {
    for (const [name, on] of wantedLoops) engine.loop(name, on);
  }
  for (const l of stateListeners) l();
}

/** The one shared AudioContext (created lazily; resumed on a user gesture). */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const { volume, muted } = useStore.getState().settings;
    engine = new AudioEngine(ctx, ctx.destination, muted ? 0 : volume);
    for (const [name, key, value] of wantedParams.values()) engine.setParam(name, key, value);
    wantedParams.clear();
    engine.duck(ducked);
    useStore.subscribe((s, prev) => {
      if (s.settings.volume !== prev.settings.volume || s.settings.muted !== prev.settings.muted) {
        applySettings();
      }
    });
    ctx.addEventListener("statechange", onStateChange);
    onStateChange();
  }
  return ctx;
}

/** Resume the context from a user gesture (lobby click, Ready, "Click to enable sound"). */
export async function unlockAudio(): Promise<void> {
  if (!supported()) return;
  const c = getAudioContext();
  if (c.state !== "running") await c.resume();
}

/** True once the context is running (hides the "Click to enable sound" chip). */
export function audioUnlocked(): boolean {
  return running();
}

/** Subscribe to context state changes (the sound chip). Returns the unsubscribe. */
export function onAudioStateChange(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export const sfx = {
  /** Play a one-shot recipe. Dropped while the context is locked. */
  play(name: SfxName): void {
    if (running()) engine?.play(name);
  },
  /** Start or stop a looping recipe (idempotent). Remembered while the context is locked. */
  loop(name: SfxName, on: boolean): void {
    wantedLoops.set(name, on);
    if (running()) engine?.loop(name, on);
  },
  /** Change a parameter of a running voice (kept for later starts too). */
  setParam(name: SfxName, key: SfxParam, value: number | string): void {
    if (engine) engine.setParam(name, key, value);
    else wantedParams.set(`${name}:${key}`, [name, key, value]);
  },
};

/** Master volume 0..1 (the Settings slider; default 0.5). Persisted in the store settings. */
export function setMasterVolume(volume: number): void {
  useStore.getState().setSettings({ volume: Math.min(1, Math.max(0, volume)) });
  applySettings();
}

export function setMuted(muted: boolean): void {
  useStore.getState().setSettings({ muted });
  applySettings();
}

/** Ambience bus → 0.5× while anyone holds the radio channel (150 ms ramp), back to 1 after. */
export function duckAmbience(on: boolean): void {
  ducked = on;
  engine?.duck(on);
}

/** Stop every loop and forget the requests (a screen unmounts). */
export function stopAllLoops(): void {
  wantedLoops.clear();
  engine?.stopAll();
}

/** Test hook: which loops are wanted right now (independent of the context state). */
export function wantedLoopNames(): SfxName[] {
  return [...wantedLoops].filter(([, on]) => on).map(([name]) => name);
}
