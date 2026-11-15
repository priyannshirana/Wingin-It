import gsap from "gsap";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WindowShot } from "../../cinematics/towerWindowClock";
import { useStore } from "../../state/store";

// The window's three.js chunk loads only when a window beat starts (§F12.7).
const TowerWindow = lazy(() => import("./TowerWindow").then((m) => ({ default: m.TowerWindow })));

const SLIDE_S = 0.5;
const MULLION_X = [27, 80] as const;
const WOOD_V = "linear-gradient(90deg, #4a2f1e, #8a5d3c 35%, #a67650 50%, #6b4630 75%, #3a2416)";
const WOOD_H = "linear-gradient(180deg, #4a2f1e, #8a5d3c 35%, #a67650 50%, #6b4630 75%, #3a2416)";
const SHOTS: readonly WindowShot[] = ["takeoff", "landing", "crash"];

/**
 * The Tower window frame (§F12.7): a chunky painted-wood frame with mullions, glare and a sill that slides down over
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
        className="pointer-events-none fixed top-[8%] left-[11%] z-[24] h-[76%] w-[78%]"
      >
        {/* glass: the 3D view, a cool tint and two diagonal glare streaks */}
        <div className="absolute inset-0 overflow-hidden rounded-[6px] bg-night">
          <Suspense fallback={null}>
            <TowerWindow shot={shot} />
          </Suspense>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(118deg, rgb(255 255 255/0) 14%, rgb(255 255 255/0.16) 20%, rgb(255 255 255/0.16) 23%, rgb(255 255 255/0) 29%, rgb(255 255 255/0) 40%, rgb(255 255 255/0.08) 43%, rgb(255 255 255/0) 47%), linear-gradient(180deg, rgb(150 200 220/0.12), rgb(40 80 100/0.1))",
            }}
          />
        </div>
        {/* mullions and transom, clear of the plane / smoke at x 45-70% */}
        {MULLION_X.map((x) => (
          <div
            key={x}
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-[14px] -translate-x-1/2"
            style={{ left: `${x}%`, background: WOOD_V }}
          />
        ))}
        <div
          aria-hidden="true"
          className="absolute right-0 left-0 h-[14px] -translate-y-1/2"
          style={{ top: "15%", background: WOOD_H }}
        />
        {/* chunky painted frame */}
        <div
          aria-hidden="true"
          className="absolute -inset-[22px] rounded-[10px] border-[22px]"
          style={{
            borderColor: "#6b4630",
            boxShadow:
              "inset 0 0 0 3px #3a2416, inset 0 0 0 7px #9a6a46, inset 0 4px 14px rgb(0 0 0/0.6), 0 0 0 3px #2b1a10, 0 24px 60px rgb(0 0 0/0.55)",
          }}
        />
        {/* sill */}
        <div
          aria-hidden="true"
          className="absolute -right-[46px] -bottom-[48px] -left-[46px] h-[26px] rounded-[6px]"
          style={{
            background: "linear-gradient(180deg, #b88558, #8a5a38 55%, #5a3820)",
            boxShadow: "0 10px 24px rgb(0 0 0/0.55), inset 0 2px 0 rgb(255 255 255/0.25)",
          }}
        />
      </div>
    </>
  );
}
