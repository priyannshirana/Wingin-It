import { useMemo } from "react";
import { getStation } from "../../content/stations";
import type { Lang, StationId } from "../../net/protocol";
import { ControlGlyph } from "./ControlGlyph";
import { CALLOUT_FONT, LINE_H, layoutDiagram, U } from "./diagramLayout";

const INK = "#1F1F1F";
const PENCIL = "#C2410C";
const OUTLINE = 3.5 * U; // 3.5 px outlines at 1440 × 900

interface Props {
  station: StationId;
  lang: Lang;
  circled?: readonly string[];
  question?: readonly string[];
}

// The module page's diagram (§F12.3 left page, item 2): bold line art generated from the
// stations.json grid, every control in its DEFAULT position (never the live state), callout tags
// outside the panel, and this step's rings and "?" badges.
export function PanelDrawing({ station: id, lang, circled = [], question = [] }: Props) {
  const station = getStation(id);
  const layout = useMemo(() => layoutDiagram(station, lang), [station, lang]);
  const { W, H, panel } = layout;
  const circledSet = new Set(circled);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={station.name[lang]}
      data-testid="panel-drawing"
    >
      {/* the diagram frame */}
      <rect
        x={OUTLINE / 2}
        y={OUTLINE / 2}
        width={W - OUTLINE}
        height={H - OUTLINE}
        rx={14 * U}
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth={OUTLINE * 0.6}
      />
      {/* the station panel */}
      <rect
        x={panel.x}
        y={panel.y}
        width={panel.w}
        height={panel.h}
        rx={10 * U}
        fill="#F4EFE4"
        stroke={INK}
        strokeWidth={OUTLINE}
        strokeLinejoin="round"
      />

      {/* leader lines under the tags and glyphs */}
      {layout.callouts.map((c) => {
        const [first] = c.leader;
        return (
          <g
            key={`${c.key}-leader`}
            stroke={INK}
            strokeWidth={1.4 * U}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points={c.leader.map((p) => `${p.x},${p.y}`).join(" ")} />
            {c.bracket && (
              <line
                x1={c.bracket.a.x}
                y1={c.bracket.a.y}
                x2={c.bracket.b.x}
                y2={c.bracket.b.y}
                strokeWidth={2 * U}
              />
            )}
            {first && <circle cx={first.x} cy={first.y} r={2.6 * U} fill={INK} stroke="none" />}
          </g>
        );
      })}

      {layout.controls.map((p) => (
        <g
          key={p.control.id}
          transform={`translate(${p.cx} ${p.cy}) scale(${p.scale})`}
          data-object-id={p.control.id}
        >
          <ControlGlyph
            type={p.control.type}
            state={p.control.default}
            color={p.control.color}
            label={p.control.label}
            big={p.control.size === "big"}
            style={p.control.style}
            weight={OUTLINE / (2.5 * p.scale)}
          />
        </g>
      ))}

      {/* callout tags */}
      {layout.callouts.map((c) => {
        const hot = c.ids.some((cid) => circledSet.has(cid));
        return (
          <g key={c.key} data-testid="callout" data-ids={c.ids.join(" ")} data-name={c.text}>
            <rect
              x={c.box.x}
              y={c.box.y}
              width={c.box.w}
              height={c.box.h}
              rx={c.box.h / 2}
              fill="#FFFFFF"
              stroke={INK}
              strokeWidth={1.6 * U}
            />
            <text
              x={c.box.x + c.box.w / 2}
              y={c.box.y + c.box.h / 2 - ((c.lines.length - 1) * LINE_H) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="'Baloo 2', sans-serif"
              fontWeight="600"
              fontSize={CALLOUT_FONT}
              fill={INK}
            >
              {c.lines.map((line, i) => (
                <tspan key={i} x={c.box.x + c.box.w / 2} dy={i === 0 ? 0 : LINE_H}>
                  {line}
                </tspan>
              ))}
            </text>
            {hot && (
              <line
                data-testid="callout-underline"
                x1={c.box.x + c.box.h / 2}
                x2={c.box.x + c.box.w - c.box.h / 2}
                y1={c.box.y + c.box.h - 2.5 * U}
                y2={c.box.y + c.box.h - 2.5 * U}
                stroke={PENCIL}
                strokeWidth={2.5 * U}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}

      {/* this step's highlights */}
      {layout.controls
        .filter((p) => circledSet.has(p.control.id))
        .map((p, i) => (
          <ellipse
            key={`${p.control.id}-ring`}
            data-testid="circled"
            cx={p.cx}
            cy={p.cy}
            rx={p.r * 1.35 * (p.control.span > 1 ? 1.4 : 1)}
            ry={p.r * 1.25 * (p.control.rowspan > 1 ? 1.4 : 1)}
            fill="none"
            stroke={PENCIL}
            strokeWidth={4 * U}
            strokeDasharray={`${9 * U} ${6 * U}`}
            strokeLinecap="round"
            transform={`rotate(${i % 2 === 0 ? -6 : 5} ${p.cx} ${p.cy})`}
          />
        ))}
      {layout.controls
        .filter((p) => question.includes(p.control.id))
        .map((p) => {
          const r = 16 * U; // 32 px badge
          return (
            <g
              key={`${p.control.id}-q`}
              data-testid="question"
              transform={`translate(${p.cx + p.r * 1.05} ${p.cy - p.r * 0.95})`}
            >
              <circle r={r} fill={PENCIL} stroke="#FFFFFF" strokeWidth={2 * U} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="'Baloo 2', sans-serif"
                fontWeight="800"
                fontSize={r * 1.4}
                fill="#FFFFFF"
              >
                ?
              </text>
            </g>
          );
        })}
    </svg>
  );
}
