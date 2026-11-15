import { useShallow } from "zustand/react/shallow";
import { useT } from "../i18n/useT";
import { useStore } from "../state/store";

const SIZE = 280;
const C = SIZE / 2;
const BLIP_COLOR = { green: "#30A46C", amber: "#F5C518", red: "#E5484D" } as const;
// The fixed route (§F12.2): from (70, 210) to the runway at (215, 70), gently curved.
const START = { x: 70, y: 210 };
const CTRL = { x: 110, y: 90 };
const END = { x: 215, y: 70 };

function routePoint(t: number) {
  const u = 1 - t;
  return {
    x: u * u * START.x + 2 * u * t * CTRL.x + t * t * END.x,
    y: u * u * START.y + 2 * u * t * CTRL.y + t * t * END.y,
  };
}

const STORM_BLOBS = [
  { cx: 95, cy: 120, r: 30, dur: 18 },
  { cx: 180, cy: 150, r: 38, dur: 24 },
  { cx: 150, cy: 85, r: 26, dur: 21 },
  { cx: 120, cy: 200, r: 32, dur: 27 },
];

// The Tower radar (§F12.2). Never shows a side. M3b adds the stamp and confetti for `landed`.
export function Radar() {
  const t = useT();
  const radar = useStore(useShallow((s) => s.game?.radar ?? null));
  const progress = radar?.landed ? 1 : Math.min(1, Math.max(0, radar?.progress ?? 0));
  const p = routePoint(progress);
  const blip = BLIP_COLOR[radar?.blip ?? "green"];
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="aspect-square w-full max-w-[320px]"
      data-testid="radar"
    >
      <defs>
        <radialGradient id="blip-glow">
          <stop offset="0" stopColor={blip} stopOpacity="0.8" />
          <stop offset="1" stopColor={blip} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweep-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#30A46C" stopOpacity="0" />
          <stop offset="1" stopColor="#30A46C" stopOpacity="0.45" />
        </linearGradient>
        <clipPath id="radar-disc">
          <circle cx={C} cy={C} r={C - 4} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={C - 4} fill="#0B1A14" stroke="#1F4D3A" strokeWidth="3" />
      <g clipPath="url(#radar-disc)">
        {[0.33, 0.66].map((k) => (
          <circle
            key={k}
            cx={C}
            cy={C}
            r={(C - 4) * k}
            fill="none"
            stroke="#1F4D3A"
            strokeWidth="1.5"
          />
        ))}
        <line x1={C} y1="4" x2={C} y2={SIZE - 4} stroke="#1F4D3A" strokeWidth="1.5" />
        <line x1="4" y1={C} x2={SIZE - 4} y2={C} stroke="#1F4D3A" strokeWidth="1.5" />
        {radar?.storm &&
          STORM_BLOBS.map((b, i) => (
            <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="#8B8D98" opacity="0.28">
              <animate
                attributeName="cx"
                values={`${b.cx};${b.cx + 18};${b.cx}`}
                dur={`${b.dur}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        <g className="animate-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
          <path
            d={`M${C} ${C} L${C} 4 A ${C - 4} ${C - 4} 0 0 1 ${C + (C - 4) * Math.sin(Math.PI / 5)} ${C - (C - 4) * Math.cos(Math.PI / 5)} Z`}
            fill="url(#sweep-fade)"
          />
        </g>
        {radar?.runway && (
          <rect
            x={END.x - 4}
            y={END.y - 14}
            width="8"
            height="28"
            rx="2"
            fill="#F2E8D5"
            transform={`rotate(35 ${END.x} ${END.y})`}
          />
        )}
        {radar?.glide_path && !radar.landed && (
          <line
            x1={p.x}
            y1={p.y}
            x2={END.x}
            y2={END.y}
            stroke="#F2E8D5"
            strokeWidth="2"
            strokeDasharray="5 5"
            opacity="0.7"
          />
        )}
      </g>
      <text x={C + 6} y={C - (C - 4) * 0.66 - 4} fontSize="10" fill="#30A46C" opacity="0.7">
        10
      </text>
      <g
        style={{
          transform: `translate(${p.x}px, ${p.y}px)`,
          transition: "transform 1s ease-in-out",
        }}
        data-testid="blip"
      >
        <circle r="16" fill="url(#blip-glow)" />
        <circle r="6" fill={blip} />
        {radar?.icon === "mayday" && (
          <g transform="translate(0 -26)">
            <rect x="-34" y="-11" width="68" height="20" rx="4" fill="#E5484D" />
            <text
              textAnchor="middle"
              y="4"
              fontSize="12"
              fontWeight="800"
              fill="#fff"
              fontFamily="'Baloo 2', sans-serif"
            >
              {t("tower.mayday")}
            </text>
          </g>
        )}
        {radar?.icon === "fire" && (
          <g transform="translate(0 -24)">
            <path
              d="M0 -12 C 7 -4 8 2 0 8 C -8 2 -7 -4 -2 -9 C -2 -4 2 -3 0 -12 Z"
              fill="#FF7A1A"
              stroke="#FFD166"
              strokeWidth="1.5"
            />
            <text
              textAnchor="middle"
              y="22"
              fontSize="11"
              fontWeight="800"
              fill="#FFD166"
              fontFamily="'Baloo 2', sans-serif"
            >
              {t("tower.engine_fire")}
            </text>
          </g>
        )}
        {radar?.icon === "smoke" && (
          <g transform="translate(0 -22)" fill="#8B8D98">
            <circle cx="-6" cy="0" r="6" />
            <circle cx="3" cy="-4" r="7" />
            <circle cx="9" cy="2" r="5" />
          </g>
        )}
      </g>
    </svg>
  );
}
