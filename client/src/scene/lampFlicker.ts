// §A12 `fx:lamp_flicker:<OBJ>` / `fx:flicker_stop` (§F15): a lamp's emissive flickers for 0.6 s,
// through the lamp's own override handle (sceneRefs), so the frozen Lamp part stays untouched.
import gsap from "gsap";
import { getLamp } from "./sceneRefs";

export const FLICKER_S = 0.6;
/** A fixed noise pattern (emissive intensity per step), so every run flickers the same way. */
const PATTERN = [0.3, 2.5, 0, 1.6, 0.15, 2.5, 0.5, 0, 2.1, 0.4, 2.5, 0.8] as const;

const running = new Map<string, gsap.core.Timeline>();

/** Release one lamp back to its server state. */
function release(id: string): void {
  running.get(id)?.kill();
  running.delete(id);
  getLamp(id)?.setOverride(null);
}

export function flickerLamp(id: string, seconds = FLICKER_S): void {
  if (!getLamp(id)) return;
  release(id);
  const step = seconds / PATTERN.length;
  const tl = gsap.timeline({ onComplete: () => release(id) });
  PATTERN.forEach((intensity, i) => {
    // Re-read the handle at each step: the lamp may remount (station change) mid-flicker.
    tl.call(() => getLamp(id)?.setOverride(intensity), undefined, i * step);
  });
  tl.to({}, { duration: seconds }, 0);
  running.set(id, tl);
}

/** Stop every panel flicker this module started (never a timeline's own lamp override). */
export function stopFlickers(): void {
  for (const id of [...running.keys()]) release(id);
}

export function isFlickering(id: string): boolean {
  return running.has(id);
}
