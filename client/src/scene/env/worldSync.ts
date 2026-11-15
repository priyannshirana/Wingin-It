// World → scene drivers (§A11, §F9.9). Every scene component keeps its animatable numbers in a
// plain "drivers" object (sceneRefs.ts) and syncs it from `World` here. While a cinematic plays
// the timeline owns the drivers, so syncing waits: a world that arrives mid-cinematic is applied
// shortly after the timeline ends (by contract its end state already matches, so that's a no-op).
import gsap from "gsap";
import { useEffect } from "react";
import type { World } from "../../net/protocol";
import { serverNow } from "../../net/clock";
import { type StoreState, useStore } from "../../state/store";

/** The LOBBY world (§A11): what the scene shows before the server's first `flyer_view`. */
export const REST_WORLD: World = {
  light_rig: "night_calm",
  alarm: false,
  warning_beep: false,
  pilot: { slumped: false, seat_back: false, awake: true },
  ap_screen: false,
  fire: { side: null, level: "none" },
  propeller_stopped: null,
  fire_bell: false,
  fuel_hiss: false,
  engine_hum: "normal",
  weather: "clouds_night",
  fog: 0.004,
  turbulence: 0,
  static_level: 0,
  landing_lights: false,
  runway: "hidden",
  overhead_all_green: false,
};

/** The world the scene should rest in right now. */
export function currentWorld(): World {
  return useStore.getState().flyer.world ?? REST_WORLD;
}

/**
 * Sandbox switch (/dev/scene): when true every sync snaps instead of tweening, so a preset
 * renders its exact resting frame at once.
 */
export const worldSync = { instant: false };

/** After a cinematic ends, wait this long before re-syncing (a following cinematic cancels it). */
const RESYNC_MS = 600;

/** Tweens drivers toward their world values; tracked so a starting cinematic can stop them. */
export class SyncTweens {
  private list: gsap.core.Tween[] = [];
  snap = true;
  private readonly seconds: number;
  constructor(seconds: number) {
    this.seconds = seconds;
  }

  to(target: object, vars: gsap.TweenVars, seconds = this.seconds): void {
    if (this.snap || seconds <= 0) {
      gsap.set(target, vars);
      return;
    }
    this.list.push(gsap.to(target, { ease: "power2.inOut", ...vars, duration: seconds }));
  }

  kill(): void {
    for (const t of this.list) t.kill();
    this.list = [];
  }
}

export type WorldApply = (world: World, tw: SyncTweens) => void;

/**
 * With no newer world after a cinematic, re-sync anyway after this long (a lost message must not
 * leave the scene in a timeline's pose forever).
 */
const FALLBACK_MS = 8000;

/**
 * A cinematic owns the scene: while its timeline plays, before it starts (inside the start lead),
 * and for `crash` for as long as the room stays in CRASH (it has no automatic end).
 */
export function cinematicActive(s: StoreState): boolean {
  if (s.cinePlaying) return true;
  const c = s.cinematic;
  if (!c || c.skipped) return false;
  if (c.id === "crash") return s.status === "CRASH" || s.crashed;
  return serverNow() < c.start_at_ms + c.duration_ms;
}

/**
 * Calls `apply(world, tw)` on mount (snapping) and on every new world while no cinematic is
 * active (tweening over `seconds`). A world that arrives during a cinematic is applied shortly
 * after it ends; if none newer than the cinematic's start arrives, the current world is re-applied
 * only after a long fallback, so a late `flyer_view` never yanks the scene back to a stale world
 * (e.g. behind the crash POOF). `apply` must be stable (module-level or memoized).
 */
export function useWorldSync(apply: WorldApply, seconds: number): void {
  useEffect(() => {
    const tw = new SyncTweens(seconds);
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Did a world arrive since the current / last cinematic became active? (A flag, not
    // timestamps: a world and a cinematic can land in the same millisecond.)
    let freshWorld = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const run = (snap: boolean) => {
      clear();
      tw.kill();
      tw.snap = snap || worldSync.instant;
      apply(currentWorld(), tw);
    };
    const later = (ms: number) => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        if (!cinematicActive(useStore.getState())) run(false);
      }, ms);
    };
    run(true);
    let prev = useStore.getState();
    let wasActive = cinematicActive(prev);
    const unsubscribe = useStore.subscribe((s) => {
      const p = prev;
      prev = s;
      const active = cinematicActive(s);
      const newWorld = s.flyer.world !== p.flyer.world;
      if (active !== wasActive) {
        wasActive = active;
        if (active) {
          freshWorld = newWorld; // a world arriving with the cinematic message counts as newer
          clear();
          tw.kill(); // the timeline owns the drivers now
        } else {
          // Ended: apply a world that arrived after the cinematic started (a following cinematic
          // inside RESYNC_MS cancels this); otherwise wait for one, with a long fallback.
          later(freshWorld || newWorld ? RESYNC_MS : FALLBACK_MS);
        }
        return;
      }
      if (newWorld && active) freshWorld = true;
      if (newWorld && !active) run(false);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      tw.kill();
    };
  }, [apply, seconds]);
}

/** Exponential smoothing factor for `rate` per second (frame-rate independent). */
export function dampK(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Which "stage" the camera is on: the cockpit set (around the origin) or the exterior-plane set
 * (around EXTERIOR_PLANE, 300 m ahead). Each stage hides the other so the Flyer never sees its own
 * plane through the windshield and the exterior shots never see the cockpit box.
 */
export type Stage = "cockpit" | "exterior";

const COCKPIT_RADIUS_SQ = 60 * 60;

export function stageOf(p: { x: number; y: number; z: number }): Stage {
  return p.x * p.x + p.y * p.y + p.z * p.z < COCKPIT_RADIUS_SQ ? "cockpit" : "exterior";
}
