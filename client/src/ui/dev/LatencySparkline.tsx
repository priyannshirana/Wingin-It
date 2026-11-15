import { DEV_LABELS as L } from "./labels";

const W = 368;
const H = 64;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;
/** §F18.4: the release → subtitle target. */
export const LATENCY_TARGET_MS = 1500;

/**
 * §F18.4 latency sparkline: the last 20 release → subtitle latencies, one 2 px line, a dashed
 * target line at 1500 ms labelled directly, and the latest value labelled at the end. Each point
 * has a native hover tooltip with its value.
 */
export function LatencySparkline({ values }: { values: number[] }) {
  const max = Math.max(LATENCY_TARGET_MS * 1.35, ...values) * 1.05;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + plotH * (1 - v / max);
  const step = values.length > 1 ? (W - PAD_X * 2 - 56) / (values.length - 1) : 0;
  const x = (i: number) => PAD_X + i * step;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.at(-1);
  const targetY = y(LATENCY_TARGET_MS);
  return (
    <section data-testid="dev-latency">
      <h3 className="mb-1 text-[11px] tracking-widest text-teal uppercase">{L.latencies}</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block rounded bg-black/30"
        role="img"
        aria-label={`${L.latencies}: ${values.join(", ")}`}
      >
        <line
          x1={0}
          x2={W}
          y1={targetY}
          y2={targetY}
          stroke="rgba(255,255,255,0.35)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text x={4} y={targetY - 3} textAnchor="start" fontSize={10} fill="rgba(255,255,255,0.5)">
          {LATENCY_TARGET_MS} ms
        </text>
        {values.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke="#F2E8D5"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {values.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={v > LATENCY_TARGET_MS ? 3 : 2}
            fill={v > LATENCY_TARGET_MS ? "#E5484D" : "#F2E8D5"}
            stroke="#11131a"
            strokeWidth={1}
          >
            <title>{`${v} ms`}</title>
          </circle>
        ))}
        {last !== undefined && (
          <text
            x={x(values.length - 1) + 8}
            y={y(last) + 4}
            fontSize={11}
            fill="rgba(255,255,255,0.85)"
          >
            {last} ms
          </text>
        )}
      </svg>
    </section>
  );
}
