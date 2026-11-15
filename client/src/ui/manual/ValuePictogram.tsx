import { PALETTE } from "../../content/stations";
import type { Swatch } from "../../net/protocol";

const INK = "#1F1F1F";

interface Props {
  swatch: Swatch;
  /** branch_on FIRE_SIDE: a small flame next to the arrow (§F12.3 item 4). */
  flame?: boolean;
  size?: number;
}

// A rule-grid column header pictogram (≥ 48 px): a color-filled light bulb, a bold ← / → arrow,
// or a ✓ / ✗ badge. Original line art in the manual's bold style.
export function ValuePictogram({ swatch, flame = false, size = 56 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "-32 -32 64 64",
    "aria-hidden": true,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  switch (swatch.kind) {
    case "color":
      return (
        <svg {...common} data-testid="value-pictogram" data-kind="color">
          {[-60, -30, 0, 30, 60].map((deg) => (
            <line
              key={deg}
              x1="0"
              y1="-22"
              x2="0"
              y2="-28"
              stroke={INK}
              strokeWidth="3"
              transform={`rotate(${deg} 0 -4)`}
            />
          ))}
          <path
            d="M-12 8 C -19 1 -18 -18 0 -18 C 18 -18 19 1 12 8 L 11 13 L -11 13 Z"
            fill={PALETTE[swatch.color]}
            stroke={INK}
            strokeWidth="3.5"
          />
          <rect
            x="-8"
            y="14"
            width="16"
            height="8"
            rx="2.5"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth="3"
          />
        </svg>
      );
    case "side": {
      const left = swatch.side === "left";
      return (
        <svg {...common} data-testid="value-pictogram" data-kind="side">
          <path
            d={
              left
                ? "M18 -9 L-2 -9 L-2 -20 L-24 0 L-2 20 L-2 9 L18 9 Z"
                : "M-18 -9 L2 -9 L2 -20 L24 0 L2 20 L2 9 L-18 9 Z"
            }
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth="3.5"
          />
          {flame && (
            <path
              data-testid="flame"
              transform={`translate(${left ? 16 : -16} -18) scale(0.55)`}
              d="M0 -16 C 10 -6 12 2 0 12 C -12 2 -10 -6 -3 -12 C -3 -5 3 -4 0 -16 Z"
              fill="#FF7A1A"
              stroke={INK}
              strokeWidth="4"
            />
          )}
        </svg>
      );
    }
    case "yesno": {
      const yes = swatch.value === "yes";
      return (
        <svg {...common} data-testid="value-pictogram" data-kind="yesno">
          <circle r="24" fill={yes ? "#30A46C" : "#E5484D"} stroke={INK} strokeWidth="3.5" />
          <path
            d={yes ? "M-11 1 L-3 9 L12 -8" : "M-9 -9 L9 9 M9 -9 L-9 9"}
            stroke="#FFFFFF"
            strokeWidth="6"
            fill="none"
          />
        </svg>
      );
    }
    default:
      return null;
  }
}
