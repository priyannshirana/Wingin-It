import { useEffect, useRef, useState } from "react";
import { fxShake } from "../cinematics/cameraFx";
import { flashStationRim } from "../scene/rimFx";
import { useStore } from "../state/store";
import { CLICK_RECENT_MS, formatFuelDelta, FUEL_DELTA_MS, WRONG_SHAKE } from "./feedback";
import { useFxVisuals } from "./useFxVisuals";

interface Floater {
  id: number;
  x: number;
  y: number;
  delta: number;
}

const PIPS = '[data-testid="progress-pips"] > span';
const TEAL = "#2ec4b6";
let nextId = 1;

// The Flyer's §F15 action feedback (no input lock) and the §A12 fx visuals:
// - wrong: the red vignette pulse (Overlays), `shakeFor(0.5, 0.35)` and a red "−10" floating up
//   from where the control was clicked (the fuel bar's own "−10" is FuelDelta);
// - correct: the green rim flash on the station (scene/StationRim) and a pop on the new pip.
// The control's bounce / own animation is the part's job (§F9.6). Sounds: useWorldAudio.
export function FlyerFeedback() {
  useFxVisuals("flyer");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const lastClick = useRef<{ x: number; y: number; at: number } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Where the Flyer last clicked the 3D view (the control they used).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLCanvasElement) || !target.closest('[data-screen="flyer"]'))
        return;
      if (document.pointerLockElement) {
        const r = target.getBoundingClientRect();
        lastClick.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, at: Date.now() };
      } else {
        lastClick.current = { x: e.clientX, y: e.clientY, at: Date.now() };
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  useEffect(() => {
    let lastResult = useStore.getState().lastResult;
    const live = timers.current;
    const unsub = useStore.subscribe((s, p) => {
      const r = s.lastResult;
      if (r !== p.lastResult && r && r !== lastResult) {
        lastResult = r;
        if (r.success) {
          flashStationRim();
        } else {
          s.redPulse();
          fxShake(WRONG_SHAKE.amount, WRONG_SHAKE.seconds);
          const click = lastClick.current;
          if (click && Date.now() - click.at < CLICK_RECENT_MS && r.fuel_delta < 0) {
            const item = { id: nextId++, x: click.x, y: click.y, delta: r.fuel_delta };
            setFloaters((list) => [...list, item].slice(-3));
            const timer = setTimeout(() => {
              live.delete(timer);
              setFloaters((list) => list.filter((f) => f.id !== item.id));
            }, FUEL_DELTA_MS);
            live.add(timer);
          }
        }
      }
      const done = s.game?.completed ?? 0;
      const prevDone = p.game?.completed ?? 0;
      if (done > prevDone && s.game?.phase === p.game?.phase) popPip(done - 1);
    });
    return () => {
      unsub();
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      {floaters.map((f) => (
        <ClickFloater key={f.id} floater={f} />
      ))}
    </div>
  );
}

/** A teal ring bursting off the pip that just filled (the pip's own CSS pop plays underneath). */
function popPip(index: number): void {
  const pip = document.querySelectorAll<HTMLElement>(PIPS)[index];
  if (!pip || typeof pip.animate !== "function") return;
  pip.animate(
    [
      { scale: "1", boxShadow: `0 0 0 0 ${TEAL}` },
      { scale: "1.6", boxShadow: `0 0 0 6px rgb(46 196 182 / 0.6)`, offset: 0.35 },
      { scale: "1", boxShadow: `0 0 0 12px rgb(46 196 182 / 0)` },
    ],
    { duration: 450, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}

function ClickFloater({ floater }: { floater: Floater }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const e = el.current;
    if (!e || typeof e.animate !== "function") return;
    const a = e.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
        { opacity: 1, transform: "translate(-50%, -90%) scale(1.15)", offset: 0.15 },
        { opacity: 1, transform: "translate(-50%, -130%) scale(1)", offset: 0.6 },
        { opacity: 0, transform: "translate(-50%, -190%) scale(1)" },
      ],
      { duration: FUEL_DELTA_MS, easing: "ease-out", fill: "forwards" },
    );
    return () => a.cancel();
  }, []);
  return (
    <span
      ref={el}
      data-testid="click-delta"
      className="fixed font-display text-4xl font-extrabold text-lamp-red tabular-nums opacity-0 [text-shadow:0_3px_0_rgb(27_29_36/0.9),0_0_12px_rgb(229_72_77/0.6)]"
      style={{ left: floater.x, top: floater.y }}
    >
      {formatFuelDelta(floater.delta)}
    </span>
  );
}
