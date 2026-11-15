import gsap from "gsap";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WindowShot } from "../../cinematics/towerWindowClock";
import { useStore } from "../../state/store";

// The window's three.js chunk loads only when a window beat starts (§F12.7).
const TowerWindow = lazy(() => import("./TowerWindow").then((m) => ({ default: m.TowerWindow })));

const SLIDE_S = 0.5;
const SHOTS: readonly WindowShot[] = ["takeoff", "landing", "crash"];

/**
 * The Tower window frame (§F12.7): a thick slate frame with tinted glass that slides down over
 * the radar and manual in 0.5 s while a window cue is on, dims the desk, and slides away after
 * it. The canvas is mounted only while the frame is on screen.
 */
export function TowerWindowHost() {
  const active = useStore((s) => SHOTS.find((n) => s.cues[`tower_window_${n}`] === true) ?? null);
  const [shown, setShown] = useState<WindowShot | null>(null);
  if (active && shown !== active) setShown(active); // follows the cue; only the exit lingers
  useEffect(() => {
    if (active) return;
    const timer = setTimeout(() => setShown(null), SLIDE_S * 1000 + 100);
    return () => clearTimeout(timer);
  }, [active]);
  if (!shown) return null;
  return <Frame shot={shown} open={active !== null} />;
}

function Frame({ shot, open }: { shot: WindowShot; open: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    gsap.set(frame.current, { yPercent: -125 }); // starts above the screen, then slides down
  }, []);
  useLayoutEffect(() => {
    const tween = gsap.to(frame.current, {
      yPercent: open ? 0 : -125,
      duration: SLIDE_S,
      ease: open ? "power2.out" : "power2.in",
      overwrite: true,
    });
    const fade = gsap.to(dim.current, {
      opacity: open ? 0.6 : 0,
      duration: SLIDE_S,
      overwrite: true,
    });
    return () => {
      tween.kill();
      fade.kill();
    };
  }, [open]);
  return (
    <>
      <div
        ref={dim}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[23] bg-black opacity-0"
      />
      <div
        ref={frame}
        data-testid="tower-window"
        data-shot={shot}
        className="pointer-events-none fixed top-[9%] left-[12.5%] z-[24] h-[78%] w-[75%] overflow-hidden rounded-[28px] border-[18px] border-slate bg-night shadow-[0_24px_60px_rgb(0_0_0/0.55),inset_0_0_0_3px_rgb(0_0_0/0.35)]"
      >
        <Suspense fallback={null}>
          <TowerWindow shot={shot} />
        </Suspense>
        {/* tinted glass with a soft reflection streak */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, rgb(255 255 255/0) 22%, rgb(255 255 255/0.13) 30%, rgb(255 255 255/0) 38%, rgb(255 255 255/0) 58%, rgb(255 255 255/0.07) 62%, rgb(255 255 255/0) 66%), rgb(40 70 90/0.08)",
          }}
        />
      </div>
    </>
  );
}
