import { useEffect, useRef, useState } from "react";
import { CROSSOVER_BONUS_S } from "../config";
import { useStore } from "../state/store";
import { formatFuelDelta, FUEL_DELTA_MS } from "./feedback";

interface DeltaItem {
  id: number;
  delta: number;
}

let nextId = 1;

// §F15: the fuel bar's "−10" (wrong action, both screens) and "+5" (crossover: the Flyer's bar
// only; the Tower gets just the toast). Mounted inside FuelBar; only results / toasts that arrive
// after mounting show.
export function FuelDelta({ bonus }: { bonus: boolean }) {
  const [items, setItems] = useState<DeltaItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const s0 = useStore.getState();
    let lastResult = s0.lastResult;
    let seenToasts = new Set(s0.toasts.map((t) => t.id));
    const live = timers.current;
    const push = (delta: number) => {
      const item = { id: nextId++, delta };
      setItems((list) => [...list, item].slice(-3));
      const timer = setTimeout(() => {
        live.delete(timer);
        setItems((list) => list.filter((i) => i.id !== item.id));
      }, FUEL_DELTA_MS);
      live.add(timer);
    };
    const unsub = useStore.subscribe((s, p) => {
      if (s.lastResult !== p.lastResult && s.lastResult && s.lastResult !== lastResult) {
        lastResult = s.lastResult;
        if (s.lastResult.fuel_delta < 0) push(s.lastResult.fuel_delta);
      }
      if (bonus && s.toasts !== p.toasts) {
        for (const t of s.toasts) {
          if (!seenToasts.has(t.id) && t.key === "toast.crossover") push(CROSSOVER_BONUS_S);
        }
        seenToasts = new Set(s.toasts.map((t) => t.id));
      }
    });
    return () => {
      unsub();
      live.forEach(clearTimeout);
      live.clear();
    };
  }, [bonus]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {items.map((item) => (
        <DeltaLabel key={item.id} delta={item.delta} />
      ))}
    </div>
  );
}

function DeltaLabel({ delta }: { delta: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const down = delta < 0;
  useEffect(() => {
    const e = el.current;
    if (!e || typeof e.animate !== "function") return;
    // The penalty slides down with the bar; the bonus floats up. Pop in, hold, fade.
    const dy = down ? 14 : -8;
    const a = e.animate(
      [
        { opacity: 0, transform: "translateY(0) scale(1.5)" },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.15 },
        { opacity: 1, transform: `translateY(${dy * 0.5}px) scale(1)`, offset: 0.6 },
        { opacity: 0, transform: `translateY(${dy}px) scale(0.95)` },
      ],
      { duration: FUEL_DELTA_MS, easing: "ease-out", fill: "forwards" },
    );
    return () => a.cancel();
  }, [down]);
  return (
    <span
      ref={el}
      data-testid="fuel-delta"
      data-kind={down ? "penalty" : "bonus"}
      className={`absolute top-full right-0 -mt-1 font-display text-2xl leading-none font-extrabold tabular-nums opacity-0 [text-shadow:0_2px_0_rgb(0_0_0/0.5)] ${
        down ? "text-lamp-red" : "text-lamp-green"
      }`}
    >
      {formatFuelDelta(delta)}
    </span>
  );
}
