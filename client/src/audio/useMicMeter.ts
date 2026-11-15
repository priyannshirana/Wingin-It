import { useEffect, useState } from "react";
import { level as micLevel } from "./mic";

/** §F8.3: the mic "works" once the level stays above 0.15 for 300 ms. */
export const MIC_OK_LEVEL = 0.15;
export const MIC_OK_MS = 300;

const STEPS = 24; // quantize so React only re-renders when a meter bar would change

/**
 * Polls the mic level on animation frames while `active`. `heard` latches true once the level
 * has stayed above MIC_OK_LEVEL for MIC_OK_MS (the lobby's "Mic works!").
 */
export function useMicMeter(active: boolean): { level: number; heard: boolean } {
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let above: number | null = null;
    let latched = false;
    const tick = (now: number) => {
      const v = micLevel();
      setLevel(Math.round(v * STEPS) / STEPS);
      if (!latched) {
        if (v > MIC_OK_LEVEL) {
          above ??= now;
          if (now - above >= MIC_OK_MS) {
            latched = true;
            setHeard(true);
          }
        } else above = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return { level: active ? level : 0, heard };
}
