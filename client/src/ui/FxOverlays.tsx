import { useEffect, useRef, type RefObject } from "react";
import { SIGNAL_BARS, SIGNAL_FLASH_MS, useFxOverlayStore } from "./fxVisuals";

const TEAL = "#2ec4b6";
const CREAM = "#f2e8d5";

// The screen-wide 2D one-shot of §A12 `both:signal_flash`, mounted inside each game screen (both
// roles): the signal bars flash full 3× over 1.2 s (§F15). (`both:static_dip` is audio only:
// audio/useWorldAudio.ts.)
export function FxOverlays() {
  const flash = useFxOverlayStore((s) => s.signalFlash);
  const anchor = useRef<HTMLDivElement>(null);
  useSignalFlash(flash, anchor);
  return <div ref={anchor} className="contents" />;
}

function useSignalFlash(id: number, anchor: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (id === 0) return;
    const root = anchor.current?.closest("[data-screen]") ?? document;
    const bars = Array.from(root.querySelectorAll<HTMLElement>(SIGNAL_BARS));
    const anims: Animation[] = [];
    const on = {
      backgroundColor: CREAM,
      boxShadow: `0 0 4px ${CREAM}, 0 0 12px ${TEAL}`,
      opacity: 1,
    };
    const off = { boxShadow: "0 0 0 transparent" };
    for (const bar of bars) {
      if (typeof bar.animate !== "function") continue;
      // Three on/off flashes (0.4 s each), every bar lit = full signal.
      anims.push(
        bar.animate(
          [
            { ...on, offset: 0 },
            { ...on, offset: 0.2 },
            { ...off, offset: 0.33 },
            { ...on, offset: 0.4 },
            { ...on, offset: 0.53 },
            { ...off, offset: 0.66 },
            { ...on, offset: 0.73 },
            { ...on, offset: 0.9 },
            { ...off, offset: 1 },
          ],
          { duration: SIGNAL_FLASH_MS, easing: "linear" },
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [id, anchor]);
}
