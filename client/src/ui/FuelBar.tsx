import { LOW_FUEL_S } from "../config";
import { useT } from "../i18n/useT";
import { useStore } from "../state/store";
import { FuelDelta } from "./FuelDelta";

/** Fuel seconds + a thin bar: green > 50%, amber > 20 s, red ≤ 20 s and pulsing (§F11). */
export function FuelBar({ className = "" }: { className?: string }) {
  const t = useT();
  const fuel = useStore((s) => s.game?.fuel_s ?? 0);
  const max = useStore((s) => s.game?.fuel_max_s ?? 1);
  const frac = Math.min(1, Math.max(0, fuel / Math.max(1, max)));
  const low = fuel <= LOW_FUEL_S;
  const color = frac > 0.5 ? "bg-lamp-green" : !low ? "bg-lamp-yellow" : "bg-lamp-red";
  return (
    <div className={`relative flex flex-col gap-1 ${className}`} data-testid="fuel">
      <div className="flex items-baseline justify-between gap-3 font-display text-cream">
        <span className="text-sm tracking-widest text-cream/70">{t("hud.fuel")}</span>
        <span className="text-2xl font-extrabold tabular-nums">
          {t("hud.seconds", { n: Math.ceil(fuel) })}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${color} ${low ? "animate-fuel-pulse" : ""}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <FuelDelta />
    </div>
  );
}
