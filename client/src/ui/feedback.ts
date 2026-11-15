// Shared numbers for the §F15 action feedback (FlyerFeedback, TowerFeedback, FuelDelta).

/** §F15: the wrong-action micro shake, `shakeFor(0.5, 0.35)`. */
export const WRONG_SHAKE = { amount: 0.5, seconds: 0.35 } as const;

// SPEC-ASSUMPTION: the fuel bar's "−10" / "+5" labels live 1.1 s (pop 150 ms, drift, fade) — §F15
// names the labels but not their timing; 1.1 s reads at a glance and is gone before the next try.
export const FUEL_DELTA_MS = 1100;

/** "−10" (a real minus sign) / "+5". Digits only, so it needs no translation. */
export function formatFuelDelta(delta: number): string {
  const n = Math.round(Math.abs(delta));
  return delta < 0 ? `−${n}` : `+${n}`;
}
