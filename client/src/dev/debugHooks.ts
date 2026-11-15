// `window.__wingin` (§F18.5): the hooks Playwright (the e2e visual suite or the MCP browser) uses
// to set a frame and read performance. Dev builds only; the sandbox routes install them.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { CinematicId, Side } from "../net/protocol";

export interface WinginStats {
  fps: number;
  calls: number;
  triangles: number;
}

export interface WinginDebug {
  /** Resolves after the first rendered frame with fonts loaded (plus a short settle). */
  ready: Promise<void>;
  setWorld: (preset: string, opts?: { fire_side?: Side }) => Promise<void>;
  /** Cut, then wait 2 frames. */
  setShot: (shot: string) => Promise<void>;
  seek: (
    id: CinematicId,
    t: number,
    params?: Record<string, string | number | boolean>,
  ) => Promise<void>;
  stats: () => WinginStats;
  /** Free look (§F10.3, `/dev/scene?look=1`): snap the head to yaw/pitch in degrees (+ = left/up). */
  look?: (yaw: number, pitch: number) => Promise<void>;
  /** Free look: freeze the current view (look → interact, with the 0.3 s settle). */
  freeze?: () => Promise<{ station: string | null }>;
}

declare global {
  interface Window {
    __wingin?: WinginDebug;
  }
}

// ---------------------------------------------------------------------------
// Frame probe: counts frames and the renderer's per-frame totals (all passes, incl. bloom).
// ---------------------------------------------------------------------------

const FPS_WINDOW_MS = 1000;
const probe = { fps: 0, calls: 0, triangles: 0, windowStart: 0, windowFrames: 0 };
const frameWaiters: { left: number; resolve: () => void }[] = [];
// Nothing below runs at import time (no promises, no DOM): with DEV off the probe is dead code
// and the whole module tree-shakes out of production bundles.
const firstFrame = { seen: false, waiters: [] as (() => void)[] };

function afterFirstFrame(): Promise<void> {
  if (firstFrame.seen) return Promise.resolve();
  return new Promise((resolve) => firstFrame.waiters.push(resolve));
}

/** Record one rendered frame (called from `useFrameProbe`). Exported for tests. */
export function recordFrame(now: number, calls: number, triangles: number): void {
  if (!firstFrame.seen) {
    firstFrame.seen = true;
    for (const resolve of firstFrame.waiters.splice(0)) resolve();
  }
  probe.calls = calls;
  probe.triangles = triangles;
  if (probe.windowStart === 0) probe.windowStart = now;
  probe.windowFrames += 1;
  const span = now - probe.windowStart;
  if (span >= FPS_WINDOW_MS) {
    probe.fps = Math.round((probe.windowFrames * 1000) / span);
    probe.windowStart = now;
    probe.windowFrames = 0;
  }
  for (let i = frameWaiters.length - 1; i >= 0; i--) {
    const w = frameWaiters[i];
    if (!w) continue;
    w.left -= 1;
    if (w.left <= 0) {
      frameWaiters.splice(i, 1);
      w.resolve();
    }
  }
}

/** Resolves after `n` more rendered frames. */
export function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => frameWaiters.push({ left: n, resolve }));
}

export function stats(): WinginStats {
  return { fps: probe.fps, calls: probe.calls, triangles: probe.triangles };
}

/**
 * Inside the <Canvas>: reads `renderer.info` once per frame. `autoReset` is off so the totals
 * cover every pass of the frame (scene + postprocessing), then reset here before the next one.
 */
export function useFrameProbe(): void {
  const get = useThree((s) => s.get);
  useEffect(
    () => () => {
      get().gl.info.autoReset = true;
    },
    [get],
  );
  useFrame(({ gl }) => {
    gl.info.autoReset = false;
    recordFrame(performance.now(), gl.info.render.calls, gl.info.render.triangles);
    gl.info.reset();
  });
}

// ---------------------------------------------------------------------------
// window.__wingin
// ---------------------------------------------------------------------------

export interface DebugImpl {
  setWorld: WinginDebug["setWorld"];
  setShot: WinginDebug["setShot"];
  seek?: WinginDebug["seek"];
  look?: WinginDebug["look"];
  freeze?: WinginDebug["freeze"];
}

const SETTLE_FRAMES = 30; // troika labels + the first sync tweens settle

let readyPromise: Promise<void> | null = null;

/** First rendered frame + fonts loaded + a short settle; created on first install. */
function ready(): Promise<void> {
  if (!readyPromise) {
    // jsdom (unit tests) has no FontFaceSet.
    const fonts: Promise<unknown> = "fonts" in document ? document.fonts.ready : Promise.resolve();
    readyPromise = Promise.all([afterFirstFrame(), fonts]).then(() => waitFrames(SETTLE_FRAMES));
  }
  return readyPromise;
}

/** Install `window.__wingin` for the current sandbox; returns the uninstall function. */
export function installDebugHooks(impl: DebugImpl): () => void {
  const hooks: WinginDebug = {
    ready: ready(),
    setWorld: impl.setWorld,
    setShot: impl.setShot,
    seek:
      impl.seek ??
      (() =>
        // The scene sandbox has no timelines; /dev/cinematic (M3 wave 2) provides seek.
        Promise.reject(new Error("seek not available until the cinematic scrubber"))),
    stats,
    ...(impl.look ? { look: impl.look } : {}),
    ...(impl.freeze ? { freeze: impl.freeze } : {}),
  };
  window.__wingin = hooks;
  return () => {
    if (window.__wingin === hooks) delete window.__wingin;
  };
}
