// The visual half of the §A12 effect grammar (sound is audio/useWorldAudio.ts). `parseVisual`
// turns one effect string into a typed effect; `visualFor` applies §A9's role split, so the
// Tower never acts on a Flyer-only effect even if one reached it.
import { create } from "zustand";
import type { Role, Side } from "../net/protocol";

export type VisualEffect =
  | { kind: "shake"; amount: number; seconds: number }
  | { kind: "yaw"; side: Side }
  | { kind: "pitch_dip" }
  | { kind: "lamp_flicker"; objectId: string }
  | { kind: "flicker_stop" }
  | { kind: "burst"; burst: "foam" | "snuff" }
  | { kind: "signal_flash" };

/** `fx:*` effects are the Flyer's; `both:*` go to both screens (§A9, §A12). */
export type EffectAudience = "flyer" | "both";

export interface ParsedVisual {
  audience: EffectAudience;
  effect: VisualEffect;
}

const finite = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One effect string → its visual, or null (sounds, server-side effects, unknown or malformed). */
export function parseVisual(effect: string): ParsedVisual | null {
  const [head, ...rest] = effect.split(":");
  if (head === "both") {
    const name = rest.join(":");
    // `both:static_dip` is audio only (§F15): audio/useWorldAudio.ts drops the static gain.
    if (name === "signal_flash") return { audience: "both", effect: { kind: "signal_flash" } };
    return null;
  }
  if (head !== "fx") return null;
  const [name, a, b, ...extra] = rest;
  const flyer = (e: VisualEffect): ParsedVisual => ({ audience: "flyer", effect: e });
  switch (name) {
    case "shake": {
      const amount = finite(a);
      const seconds = finite(b);
      if (amount === null || seconds === null || extra.length > 0) return null;
      if (amount <= 0 || seconds <= 0) return null;
      return flyer({ kind: "shake", amount, seconds });
    }
    case "yaw":
      return a === "left" || a === "right" ? flyer({ kind: "yaw", side: a }) : null;
    case "pitch_dip":
      return a === undefined ? flyer({ kind: "pitch_dip" }) : null;
    case "lamp_flicker":
      return a ? flyer({ kind: "lamp_flicker", objectId: a }) : null;
    case "flicker_stop":
      return a === undefined ? flyer({ kind: "flicker_stop" }) : null;
    case "burst":
      return a === "foam" || a === "snuff" ? flyer({ kind: "burst", burst: a }) : null;
    default:
      return null;
  }
}

/** The visual this role should play for `effect`, or null. */
export function visualFor(role: Role, effect: string): VisualEffect | null {
  const parsed = parseVisual(effect);
  if (!parsed) return null;
  if (parsed.audience === "flyer" && role !== "flyer") return null;
  return parsed.effect;
}

/** §A12: the signal icon flashes full bars for 1.2 s. */
export const SIGNAL_FLASH_MS = 1200;

/** Where a screen's signal bars are (SignalBars.tsx renders them; it stays untouched). */
export const SIGNAL_BARS = '[data-testid="signal"] [aria-hidden="true"] > span';

/** Id of the latest signal flash; each bump replays it once. */
interface FxOverlayState {
  signalFlash: number;
  bumpSignalFlash: () => void;
  reset: () => void;
}

export const useFxOverlayStore = create<FxOverlayState>()((set) => ({
  signalFlash: 0,
  bumpSignalFlash: () => set((s) => ({ signalFlash: s.signalFlash + 1 })),
  reset: () => set({ signalFlash: 0 }),
}));
