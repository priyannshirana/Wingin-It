interface Props {
  /** 0..1 */
  level: number;
  bars: number;
  /** Height of the tallest bar in px. */
  height?: number;
  className?: string;
}

/** A row of rising bars: green, then yellow, then red for the loudest (§F8.3, §F11). */
export function LevelMeter({ level, bars, height = 28, className = "" }: Props) {
  const lit = Math.round(Math.min(1, Math.max(0, level)) * bars);
  return (
    <div
      className={`flex items-end gap-[3px] ${className}`}
      data-testid="level-meter"
      data-lit={lit}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, i) => {
        const zone = i / bars;
        const color =
          zone >= 0.8 ? "bg-lamp-red" : zone >= 0.55 ? "bg-lamp-yellow" : "bg-lamp-green";
        return (
          <span
            key={i}
            className={`w-[6px] rounded-full transition-colors duration-75 ${i < lit ? color : "bg-white/15"}`}
            style={{ height: Math.round(height * (0.35 + (0.65 * (i + 1)) / bars)) }}
          />
        );
      })}
    </div>
  );
}
