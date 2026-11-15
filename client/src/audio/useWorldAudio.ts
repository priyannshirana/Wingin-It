// Store → sound (§F16.4 useWorldAudio, the §F15 sound column, §F16.3 ducking). Mounted once per
// game screen. The Flyer derives its loops from `World`; the Tower runs only static (by signal
// level) and the shared cues. Both screens: low_fuel, chime / buzzer / sparkle, ducking.
import { useEffect } from "react";
import { LOW_FUEL_S } from "../config";
import type { Role, World } from "../net/protocol";
import { useStore, type StoreState } from "../state/store";
import { isSfxName, type SfxName } from "./names";
import { duckAmbience, sfx, stopAllLoops } from "./sfx";

/** `both:static_dip`: static drops to 0 for 1.2 s, then returns. */
export const STATIC_DIP_MS = 1200;

/** Tower static gain by signal level (§F16.4): 0 / 0.02 / 0.04. */
const TOWER_STATIC: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.02, 3: 0.04 };

/** What the loops should be doing right now. Pure, so the mapping is testable on its own. */
export interface AudioPlan {
  loops: Partial<Record<SfxName, boolean>>;
  engineMode: World["engine_hum"] | null;
  staticGain: number;
  rainGain: number;
}

const IN_FLIGHT = new Set(["PROLOGUE", "PHASE_INTRO", "PLAYING", "PHASE_OUTRO", "ENDING", "CRASH"]);

export function planAudio(s: StoreState, role: Role): AudioPlan {
  const g = s.game;
  const lowFuel = !!g && g.fuel_draining && g.fuel_s < LOW_FUEL_S && g.status === "PLAYING";
  if (role === "tower") {
    const staticGain = TOWER_STATIC[g?.signal_level ?? 0] ?? 0;
    return {
      loops: { static: staticGain > 0, low_fuel: lowFuel },
      engineMode: null,
      staticGain,
      rainGain: 0,
    };
  }
  const w = s.flyer.world;
  if (!w) {
    return { loops: { low_fuel: lowFuel }, engineMode: null, staticGain: 0, rainGain: 0 };
  }
  const rainGain =
    w.weather === "rain" || w.weather === "storm" ? 0.08 : w.weather === "rain_light" ? 0.04 : 0;
  const flying = IN_FLIGHT.has(s.status) || s.status === "PAUSED";
  return {
    loops: {
      alarm_master: w.alarm,
      warning_beep: w.warning_beep,
      fire_bell: w.fire_bell,
      fuel_hiss: w.fuel_hiss,
      // "off" keeps the voice and lets it fade out over 3 s (§F16.4).
      engine_hum: flying,
      rain: rainGain > 0,
      static: w.static_level > 0,
      snore: w.pilot.slumped && !w.pilot.awake,
      low_fuel: lowFuel,
    },
    engineMode: w.engine_hum,
    staticGain: w.static_level,
    rainGain,
  };
}

export function useWorldAudio(role: Role): void {
  useEffect(() => {
    let prev: AudioPlan | null = null;
    let dipUntil = 0;
    let dipTimer: ReturnType<typeof setTimeout> | null = null;
    let staticGain = 0;

    const applyStatic = () => {
      sfx.setParam("static", "gain", Date.now() < dipUntil ? 0 : staticGain);
    };

    const apply = (s: StoreState) => {
      const plan = planAudio(s, role);
      if (plan.engineMode !== null && plan.engineMode !== prev?.engineMode) {
        sfx.setParam("engine_hum", "mode", plan.engineMode);
      }
      if (plan.rainGain > 0 && plan.rainGain !== prev?.rainGain) {
        sfx.setParam("rain", "gain", plan.rainGain);
      }
      if (plan.staticGain !== prev?.staticGain) {
        staticGain = plan.staticGain;
        applyStatic();
      }
      // Only touch the loops whose derived value changed, so a cinematic's own sfx.loop calls
      // (e.g. the alarm cut at a beat) are never fought by an unrelated store update.
      for (const [name, on] of Object.entries(plan.loops)) {
        if (!isSfxName(name)) continue;
        if (prev?.loops[name] !== on) sfx.loop(name, on === true);
      }
      prev = plan;
    };

    // Seen ids / times, so mounting never replays what happened before this screen existed.
    const s0 = useStore.getState();
    let lastFx = s0.fx[s0.fx.length - 1]?.id ?? 0;
    let lastResult = s0.lastResult; // each action_result is a new object
    let seenToasts = new Set(s0.toasts.map((t) => t.id));

    const oneShots = (s: StoreState) => {
      const r = s.lastResult;
      if (r && r !== lastResult) {
        lastResult = r;
        sfx.play(r.success ? "chime" : "buzzer");
      }
      for (const t of s.toasts) {
        if (seenToasts.has(t.id)) continue;
        if (t.key === "toast.crossover") sfx.play("sparkle");
      }
      seenToasts = new Set(s.toasts.map((t) => t.id));
      for (const batch of s.fx) {
        if (batch.id <= lastFx) continue;
        lastFx = batch.id;
        for (const effect of batch.effects) runEffect(effect);
      }
    };

    const runEffect = (effect: string) => {
      const [head, ...rest] = effect.split(":");
      const arg = rest.join(":");
      if (head === "both" && arg === "static_dip") {
        dipUntil = Date.now() + STATIC_DIP_MS;
        applyStatic();
        if (dipTimer) clearTimeout(dipTimer);
        dipTimer = setTimeout(applyStatic, STATIC_DIP_MS);
        return;
      }
      if (role === "flyer") {
        if (head === "sfx" && isSfxName(arg)) sfx.play(arg);
        else if (head === "sfx_stop" && isSfxName(arg)) sfx.loop(arg, false);
        // SPEC-ASSUMPTION: "soft whoosh" for snuff is the same whoosh recipe — §F16.4 has one
        // whoosh and sfx.play takes no gain; the snuff puff is visually smaller already.
        else if (head === "fx" && (arg === "burst:foam" || arg === "burst:snuff")) {
          sfx.play("whoosh");
        }
      } else if (head === "tower" && isSfxName(arg)) {
        sfx.play(arg);
      }
    };

    apply(useStore.getState());
    const unsub = useStore.subscribe((s, p) => {
      if (s.flyer.world !== p.flyer.world || s.game !== p.game || s.status !== p.status) {
        apply(s);
      }
      if (s.lastResult !== p.lastResult || s.toasts !== p.toasts || s.fx !== p.fx) oneShots(s);
      if (s.channel !== p.channel) duckAmbience(s.channel !== null);
    });
    duckAmbience(useStore.getState().channel !== null);

    return () => {
      unsub();
      if (dipTimer) clearTimeout(dipTimer);
      duckAmbience(false);
      stopAllLoops();
    };
  }, [role]);
}
