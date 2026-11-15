import { useEffect, useMemo, useRef, useState } from "react";
import { getStation, STATIONS_FILE } from "../../content/stations";
import type { Lang, StationId } from "../../net/protocol";
import { DIAGRAM_H, DIAGRAM_U, DIAGRAM_W } from "./bookGeometry";
import { ControlGlyph } from "./ControlGlyph";
import {
  DIGIT_PX,
  labelCapUnits,
  layoutDiagram,
  placeHighlights,
  ringPath,
  type DiagramLayout,
} from "./diagramLayout";
import { measureTagPx, useFontsVersion } from "./measureText";
import { useBookScale } from "./useBookScale";

const INK = "#1F1F1F";
const PENCIL = "#C2410C";

interface Props {
  station: StationId;
  lang: Lang;
  circled?: readonly string[];
  question?: readonly string[];
}

// Layouts are pure; cache them (the placement search can take a few hundred ms for a dense
// station) per station, language, scale and font-load version.
const cache = new Map<string, DiagramLayout>();
function cachedLayout(id: StationId, lang: Lang, fonts: number): DiagramLayout {
  const key = `${id}|${lang}|${DIAGRAM_U}|${fonts}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = layoutDiagram(getStation(id), lang, {
      u: DIAGRAM_U,
      measure: measureTagPx,
      maxAspect: DIAGRAM_H / DIAGRAM_W,
    });
    cache.set(key, hit);
  }
  return hit;
}

// The left page's diagram (§F12.3 left page, item 2): bold line art generated from the
// stations.json grid, every control in its DEFAULT position (never the live state), callout tags
// outside the panel, and this step's rings and "?" badges. Tags are CALLOUT_PX at the design
// size; digits and arrows are kept ≥ DIGIT_PX on screen whatever the spread's scale.
export function PanelDrawing({ station: id, lang, circled = [], question = [] }: Props) {
  const station = getStation(id);
  const fonts = useFontsVersion();
  const layout = useMemo(() => cachedLayout(id, lang, fonts), [id, lang, fonts]);
  const { W, H, panel, u } = layout;
  const circledSet = new Set(circled);
  // Rings and "?" badges placed clear of every glyph, tag, leader and each other.
  const circledKey = circled.join(" ");
  const questionKey = question.join(" ");
  const marks = useMemo(
    () =>
      placeHighlights(
        layout,
        circledKey.split(" ").filter(Boolean),
        questionKey.split(" ").filter(Boolean),
      ),
    [layout, circledKey, questionKey],
  );
  const bookScale = useBookScale();
  const box = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSlot({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Warm the other stations' layouts for this language while the browser is idle.
  useEffect(() => {
    if (typeof requestIdleCallback === "undefined") return;
    const ids = STATIONS_FILE.stations.map((s) => s.id).filter((s) => s !== id);
    const handle = requestIdleCallback(() => ids.forEach((s) => cachedLayout(s, lang, fonts)));
    return () => cancelIdleCallback(handle);
  }, [id, lang, fonts]);

  // On-screen px per viewBox unit (meet: the tighter of the two axes).
  const pxPerUnit =
    slot && slot.w > 0 && slot.h > 0
      ? bookScale * Math.min(slot.w / W, slot.h / H)
      : bookScale / DIAGRAM_U;
  const outline = 3.5 * u; // 3.5 px outlines at the design size
  // Digits / arrows: DIGIT_PX on screen (aimed 1.5% above, clear of float rounding), up to the
  // size the rings were made room for.
  const labelUnits = Math.min((DIGIT_PX * 1.015) / pxPerUnit, labelCapUnits(u));

  return (
    <div ref={box} className="h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={station.name[lang]}
        data-testid="panel-drawing"
        data-preferred={layout.preferred ? "1" : "0"}
      >
        {/* the diagram frame */}
        <rect
          x={outline / 2}
          y={outline / 2}
          width={W - outline}
          height={H - outline}
          rx={14 * u}
          fill="#FFFFFF"
          stroke={INK}
          strokeWidth={outline * 0.6}
        />
        {/* the station panel */}
        <rect
          data-testid="panel-frame"
          x={panel.x}
          y={panel.y}
          width={panel.w}
          height={panel.h}
          rx={10 * u}
          fill="#F4EFE4"
          stroke={INK}
          strokeWidth={outline}
          strokeLinejoin="round"
        />

        {/* leader lines under the tags and glyphs */}
        {layout.callouts.map((c) => {
          const [first] = c.leader;
          return (
            <g
              key={`${c.key}-leader`}
              stroke={INK}
              strokeWidth={1.4 * u}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points={c.leader.map((p) => `${p.x},${p.y}`).join(" ")} />
              {c.bracket && (
                <line
                  data-testid="bracket"
                  x1={c.bracket.a.x}
                  y1={c.bracket.a.y}
                  x2={c.bracket.b.x}
                  y2={c.bracket.b.y}
                  strokeWidth={2 * u}
                />
              )}
              {first && <circle cx={first.x} cy={first.y} r={2.6 * u} fill={INK} stroke="none" />}
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
              weight={outline / (2.5 * p.scale)}
              minLabel={labelUnits / p.scale}
            />
          </g>
        ))}

        {/* callout tags */}
        {layout.callouts.map((c) => {
          const hot = c.ids.some((cid) => circledSet.has(cid));
          return (
            <g key={c.key} data-testid="callout" data-ids={c.ids.join(" ")} data-name={c.text}>
              <rect
                data-testid="callout-pill"
                x={c.box.x}
                y={c.box.y}
                width={c.box.w}
                height={c.box.h}
                rx={c.box.h / 2}
                fill="#FFFFFF"
                stroke={INK}
                strokeWidth={1.6 * u}
              />
              <text
                data-testid="callout-text"
                x={c.box.x + c.box.w / 2}
                y={c.box.y + c.box.h / 2 - ((c.lines.length - 1) * layout.lineH) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="'Baloo 2', sans-serif"
                fontWeight="600"
                fontSize={layout.font}
                fill={INK}
              >
                {c.lines.map((line, i) => (
                  <tspan key={i} x={c.box.x + c.box.w / 2} dy={i === 0 ? 0 : layout.lineH}>
                    {line}
                  </tspan>
                ))}
              </text>
              {hot && (
                <line
                  data-testid="callout-underline"
                  x1={c.box.x + c.box.h / 2}
                  x2={c.box.x + c.box.w - c.box.h / 2}
                  y1={c.box.y + c.box.h - 2.5 * u}
                  y2={c.box.y + c.box.h - 2.5 * u}
                  stroke={PENCIL}
                  strokeWidth={2.5 * u}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}

        {/* this step's highlights */}
        {marks.rings.map((ring) => (
          <path
            key={`ring-${ring.ids.join("+")}`}
            data-testid="circled"
            data-ids={ring.ids.join(" ")}
            d={ringPath(ring)}
            fill="none"
            stroke={PENCIL}
            strokeWidth={ring.stroke}
            strokeDasharray={`${9 * u} ${6 * u}`}
            strokeLinecap="round"
            transform={`rotate(${ring.rot} ${ring.x + ring.w / 2} ${ring.y + ring.h / 2})`}
          />
        ))}
        {marks.badges.map((b) => (
          <g
            key={`q-${b.ids.join("+")}`}
            data-testid="question"
            data-ids={b.ids.join(" ")}
            transform={`translate(${b.cx} ${b.cy})`}
          >
            <circle r={b.r} fill={PENCIL} stroke="#FFFFFF" strokeWidth={2 * u} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="'Baloo 2', sans-serif"
              fontWeight="800"
              fontSize={b.r * 1.4}
              fill="#FFFFFF"
            >
              ?
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
