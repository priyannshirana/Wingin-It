import type { ObjectState, PartType } from "../../net/protocol";
import { ARROW_HALF, isArrow } from "./diagramLayout";
import { meaningfulFill } from "./glyphColor";

const INK = "#1F1F1F";
const PAPER = "#FFFFFF";

interface Props {
  type: PartType;
  state: ObjectState;
  /** A palette name ("red") or a raw color string from the card. */
  color: string;
  label: string | null;
  big?: boolean;
  style?: "mushroom" | "guarded" | null;
  /** Multiplies every stroke width (outlines are 3.5 px at 1440 × 900 wherever it's drawn). */
  weight?: number;
  /**
   * Minimum font size of the digit / arrow, in glyph units (the diagram passes the size that
   * makes it ≥ DIGIT_PX on screen whatever the glyph scale). When it is larger than the authored
   * size the label is centered on the control with a halo, so it stays inside the glyph's box.
   */
  minLabel?: number;
}

const HALO = "#FFFFFF";

/**
 * One control as bold vector line art centered on (0, 0), about 48 units across, in `state`.
 * The diagram passes the default state; the rule grid passes the target state.
 */
export function ControlGlyph({
  type,
  state,
  color,
  label,
  big = false,
  style = null,
  weight = 1,
  minLabel = 0,
}: Props) {
  const fill = meaningfulFill(color) ?? PAPER;
  const sw = 2.5 * weight;
  const w = (n: number) => n * weight;
  /** The digit / arrow at its authored spot, or centered and enlarged to the minimum size. */
  const digit = (x: number, y: number, size: number, onFill = false) => {
    if (!label) return null;
    const grow = minLabel > size;
    const light = onFill && meaningfulFill(color) !== null;
    if (isArrow(label)) {
      // ← / → drawn as a bold arrow (font independent; the same width everywhere)
      const fs = grow ? minLabel : size;
      const cx = grow ? 0 : x;
      const cy = grow ? 1 : y;
      const dir = label === "←" ? -1 : 1;
      const L = ARROW_HALF * fs;
      const hd = 0.24 * fs;
      const d = `M${cx - L} ${cy} H${cx + L} M${cx + dir * L - dir * hd} ${cy - hd} L${cx + dir * L} ${cy} L${cx + dir * L - dir * hd} ${cy + hd}`;
      return (
        <g
          data-testid="glyph-label"
          data-size={fs}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {grow && <path d={d} stroke={light ? INK : HALO} strokeWidth={fs * 0.34} />}
          <path d={d} stroke={light ? PAPER : INK} strokeWidth={fs * 0.12} />
        </g>
      );
    }
    return (
      <text
        data-testid="glyph-label"
        data-size={grow ? minLabel : size}
        x={grow ? 0 : x}
        y={grow ? 1 : y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight="800"
        fontSize={grow ? minLabel : size}
        fill={light ? PAPER : INK}
        stroke={grow ? (light ? INK : HALO) : undefined}
        strokeWidth={grow ? minLabel * 0.22 : undefined}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {label}
      </text>
    );
  };

  const body = (() => {
    switch (type) {
      case "PushButton":
        return (
          <>
            {big ? (
              <circle r="22" fill={fill} stroke={INK} strokeWidth={sw} />
            ) : (
              <rect
                x="-16"
                y="-16"
                width="32"
                height="32"
                rx="8"
                fill={fill}
                stroke={INK}
                strokeWidth={sw}
              />
            )}
            {digit(0, 1, 20, true)}
          </>
        );
      case "ToggleSwitch": {
        const on = state.kind === "toggle" && state.value === "on";
        if (style === "mushroom") {
          return (
            <>
              <circle r="18" fill={fill} stroke={INK} strokeWidth={sw} />
              {on && (
                <circle
                  r="24"
                  fill="none"
                  stroke={INK}
                  strokeWidth={w(1.5)}
                  strokeDasharray={`${w(3)} ${w(4)}`}
                />
              )}
            </>
          );
        }
        const s = big ? 1.3 : 1;
        return (
          <g transform={`scale(${s})`}>
            {style === "guarded" && (
              <path
                d="M-15 -16 L15 -16 L18 -27 L-18 -27 Z"
                fill="#E5484D"
                fillOpacity="0.35"
                stroke={INK}
                strokeWidth={w(1.8)}
              />
            )}
            <rect
              x="-11"
              y="-15"
              width="22"
              height="30"
              rx="5"
              fill={fill}
              stroke={INK}
              strokeWidth={sw}
            />
            <line x1="0" y1="0" x2="0" y2={on ? -16 : 16} stroke={INK} strokeWidth={w(4.5)} />
            <circle cx="0" cy={on ? -17 : 17} r="4.5" fill={INK} />
            {digit(-21, 0, 15)}
          </g>
        );
      }
      case "PullHandle": {
        const out = state.kind === "handle" && state.value === "out";
        const s = big ? 1.3 : 1;
        return (
          <g transform={`scale(${s})`}>
            <circle r="6" fill={PAPER} stroke={INK} strokeWidth={w(2)} />
            <line x1="0" y1="0" x2="0" y2={out ? 13 : 7} stroke={INK} strokeWidth={w(3.5)} />
            <rect
              x="-17"
              y={out ? 11 : 5}
              width="34"
              height="11"
              rx="5.5"
              fill={fill}
              stroke={INK}
              strokeWidth={sw}
            />
            {out && (
              <path
                d="M23 2 L23 20 M18.5 15.5 L23 20 L27.5 15.5"
                stroke={INK}
                strokeWidth={w(2.2)}
                fill="none"
              />
            )}
            {digit(0, -15, 15)}
          </g>
        );
      }
      case "UpDownLever":
      case "NotchLever": {
        let y = -12;
        if (state.kind === "lever") y = state.value === "up" ? -12 : 12;
        if (state.kind === "notch") y = [-12, 0, 12][state.value] ?? -12;
        return (
          <>
            <rect
              x="-6"
              y="-20"
              width="12"
              height="40"
              rx="6"
              fill={PAPER}
              stroke={INK}
              strokeWidth={sw}
            />
            {type === "NotchLever" &&
              [-12, 0, 12].map((ty) => (
                <line key={ty} x1="10" y1={ty} x2="17" y2={ty} stroke={INK} strokeWidth={w(2.2)} />
              ))}
            <circle cy={y} r="8" fill={PAPER} stroke={INK} strokeWidth={sw} />
            {digit(-17, 0, 15)}
          </>
        );
      }
      case "Lamp": {
        // A light-bulb icon: outlined bulb, a screw base and short rays.
        const s = big ? 1.35 : 1;
        const tint = meaningfulFill(color);
        return (
          <g transform={`scale(${s})`}>
            {[-60, -30, 0, 30, 60].map((deg) => (
              <line
                key={deg}
                x1="0"
                y1="-19"
                x2="0"
                y2="-24"
                stroke={INK}
                strokeWidth={w(2)}
                transform={`rotate(${deg} 0 -4)`}
              />
            ))}
            <path
              d="M-10 6 C -16 0 -15 -15 0 -15 C 15 -15 16 0 10 6 L 9 10 L -9 10 Z"
              fill={tint ?? PAPER}
              stroke={INK}
              strokeWidth={sw}
            />
            <rect
              x="-7"
              y="11"
              width="14"
              height="7"
              rx="2"
              fill={PAPER}
              stroke={INK}
              strokeWidth={w(2)}
            />
            {digit(0, -1, 12, true)}
          </g>
        );
      }
      case "FuelGauge":
        return (
          <>
            <circle r="21" fill={PAPER} stroke={INK} strokeWidth={sw} />
            <path
              d="M-17 11 A 20 20 0 0 1 -20 -4"
              stroke="#E5484D"
              strokeWidth={w(4)}
              fill="none"
            />
            <line x1="0" y1="0" x2="10" y2="-14" stroke={INK} strokeWidth={w(2.8)} />
            <circle r="3" fill={INK} />
          </>
        );
      case "Screen":
        return (
          <>
            <rect
              x="-21"
              y="-14"
              width="42"
              height="28"
              rx="5"
              fill={PAPER}
              stroke={INK}
              strokeWidth={sw}
            />
            <path d="M-9 0 L9 0 M1 -7 L1 7 M-11 -3 L-11 3" stroke={INK} strokeWidth={w(2.2)} />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <g data-glyph={type} strokeLinejoin="round" strokeLinecap="round">
      {body}
    </g>
  );
}
