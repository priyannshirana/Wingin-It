// Layout of the module page's panel diagram (§F12.3 left page, item 2). Pure and deterministic.
//
// - The station panel is scaled from the stations.json grid; side gutters are sized from the
//   (wrapped) callout tags of the outer columns, so those tags sit at the sides.
// - Every callout is a tag outside the panel joined to its control by a leader polyline: first a
//   straight run from the control to the panel edge along a lane that no other glyph blocks,
//   then a short run to the tag. Tags stay near their control (leaders stay roughly straight).
// - A geometric pass rejects any placement whose leader would cross another leader, run through
//   another control's glyph, or touch another tag. The unit tests check the same invariants.
import type { ControlDef, StationDef } from "../../content/stations";
import type { Lang } from "../../net/protocol";

/** viewBox units per CSS px at 1440 × 900 (measured: the diagram renders at ~0.42 px / unit). */
export const U = 2.4;
export const W = 1000;
export const CALLOUT_FONT = 14 * U; // Baloo 2 600, ≥ 14 px
export const LINE_H = CALLOUT_FONT * 1.05;
const PAD_X = 6 * U;
const PAD_Y = 3 * U;
const MARGIN = 6 * U;
const TAG_GAP = 4 * U;
const SHIFT_OUTER = 1.6; // cells, tiers ≥ 1
const EDGE_ROOM = 10 * U;
// Inner padding of the panel frame: edge-row brackets and digits stay clear of its thick border.
const PANEL_PAD = 9 * U; // between the panel edge and the nearest tags
const GLYPH_FILL = 1.0; // × 0.75 → glyphs fill 75% of a cell
const GLYPH_HALF = 24; // half the authored glyph size (units, before scale)

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

export interface PlacedControl {
  control: ControlDef;
  cx: number;
  cy: number;
  scale: number;
  /** Half size of the glyph's box (rings, "?" badges, collision checks). */
  r: number;
}

export type Side = "top" | "bottom" | "left" | "right";

export interface Callout {
  key: string;
  lines: string[]; // 1–2 lines
  text: string; // the full name (lines joined with a space)
  ids: string[]; // controls it names (one, or a numbered row)
  side: Side;
  box: Box;
  /** Polyline from the control (first point) to the tag (last point). */
  leader: Pt[];
  /** Numbered rows: the bracket across the members. */
  bracket: { a: Pt; b: Pt } | null;
  /** Tag tier counted out from the panel edge (side gutters: 0). */
  tier: number;
}

export interface DiagramLayout {
  W: number;
  H: number;
  panel: Box;
  controls: PlacedControl[];
  callouts: Callout[];
}

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

const NUMBER_WORDS = new Set(["नंबर", "number", "no."]);

// SPEC-ASSUMPTION: English group names are pluralized with a simple -s / -es rule ("buttons",
// "switches", "levers"); Hindi nouns stay as they are ("बटन", "स्विच", "लीवर"). The names in
// stations.json are all regular, so no dictionary is needed.
function pluralize(word: string): string {
  return /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}

/** The shared word of a numbered row's names, with the number removed (§F12.3). */
export function groupName(names: readonly string[], lang: Lang): string {
  const lists = names.map((n) => n.split(" "));
  const first = lists[0] ?? [];
  const common = first.filter(
    (word) => lists.every((l) => l.includes(word)) && !NUMBER_WORDS.has(word.toLowerCase()),
  );
  const base = common.join(" ") || (first.at(-1) ?? "");
  return lang === "en" ? pluralize(base) : base;
}

/** Rough text width: Baloo 2 600 averages ~0.5 em per character. */
export function textWidth(text: string): number {
  return Array.from(text).length * CALLOUT_FONT * 0.5;
}

/** One line, or the most balanced two-line split (whichever is narrower). */
export function wrapTag(text: string, maxOneLine: number): string[] {
  const words = text.split(" ");
  if (words.length < 2 || textWidth(text) <= maxOneLine) return [text];
  let best: string[] = [text];
  let bestW = textWidth(text);
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const w = Math.max(...lines.map(textWidth));
    if (w < bestW) {
      bestW = w;
      best = lines;
    }
  }
  return best;
}

const tagSize = (lines: string[]) => ({
  w: Math.max(...lines.map(textWidth)) + PAD_X * 2,
  h: lines.length * LINE_H + PAD_Y * 2,
});

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
  );
}

/** Below this distance (viewBox units) two things count as touching: float noise is not a gap. */
export const GEOM_EPS = 1e-6;

/** Signed distance of c from the line through a→b (0 within GEOM_EPS). */
function side(a: Pt, b: Pt, c: Pt): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d =
    len === 0
      ? Math.hypot(c.x - a.x, c.y - a.y)
      : ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / len;
  return Math.abs(d) <= GEOM_EPS ? 0 : d;
}

/** c lies within the bounding box of a–b (with GEOM_EPS slack). */
function within(a: Pt, b: Pt, c: Pt): boolean {
  return (
    Math.min(a.x, b.x) - GEOM_EPS <= c.x &&
    c.x <= Math.max(a.x, b.x) + GEOM_EPS &&
    Math.min(a.y, b.y) - GEOM_EPS <= c.y &&
    c.y <= Math.max(a.y, b.y) + GEOM_EPS
  );
}

/**
 * Do segments p1p2 and q1q2 cross, touch (T or shared endpoint) or overlap (collinear)?
 * Robust to float noise: points within GEOM_EPS of a line count as on it.
 */
export function segmentsIntersect(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d1 = side(q1, q2, p1);
  const d2 = side(q1, q2, p2);
  const d3 = side(p1, p2, q1);
  const d4 = side(p1, p2, q2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return (
    (d1 === 0 && within(q1, q2, p1)) ||
    (d2 === 0 && within(q1, q2, p2)) ||
    (d3 === 0 && within(p1, p2, q1)) ||
    (d4 === 0 && within(p1, p2, q2))
  );
}

/** Does segment ab pass through box (with an optional inset so grazing an edge is fine)? */
export function segmentHitsBox(a: Pt, b: Pt, box: Box, inset = 0): boolean {
  const x0 = box.x + inset;
  const y0 = box.y + inset;
  const x1 = box.x + box.w - inset;
  const y1 = box.y + box.h - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  const inside = (p: Pt) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  if (inside(a) || inside(b)) return true;
  const c = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return c.some((p, i) => segmentsIntersect(a, b, p, c[(i + 1) % 4] ?? p));
}

/** The square box a control's glyph occupies (spans are drawn at one glyph size). */
export function glyphBox(p: PlacedControl): Box {
  return { x: p.cx - p.r, y: p.cy - p.r, w: p.r * 2, h: p.r * 2 };
}

/** Every drawn line of a callout: its leader polyline plus its row bracket. */
export function segmentsOf(c: Pick<Callout, "leader" | "bracket">): (readonly [Pt, Pt])[] {
  const out = polySegments(c.leader);
  if (c.bracket) out.push([c.bracket.a, c.bracket.b] as const);
  return out;
}

const polySegments = (pts: Pt[]): (readonly [Pt, Pt])[] =>
  pts.slice(1).map((b, i) => [pts[i] ?? b, b] as const);

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

interface Item {
  key: string;
  text: string;
  members: ControlDef[];
  side: Side; // preferred
}

const isDigit = (label: string | null) => label !== null && /^\d$/.test(label);

export function layoutDiagram(station: StationDef, lang: Lang): DiagramLayout {
  const { cols, rows } = station.grid;

  // 1. Callout items: one per numbered row, one per other control.
  const groups = new Map<string, ControlDef[]>();
  for (const c of station.controls) {
    if (!isDigit(c.label)) continue;
    const key = `${c.row}:${c.type}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const items: Item[] = [];
  const grouped = new Set<string>();
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    for (const m of members) grouped.add(m.id);
    const first = members[0];
    if (!first) continue;
    items.push({
      key: `group-${key}`,
      text: groupName(
        members.map((m) => m.manual_name[lang]),
        lang,
      ),
      members,
      side: first.row + first.rowspan / 2 <= rows / 2 ? "top" : "bottom",
    });
  }
  for (const c of station.controls) {
    if (grouped.has(c.id)) continue;
    // §F12.3: the outer columns' names go at the sides; the rest above / below by grid half.
    const side: Side =
      c.col === 0
        ? "left"
        : c.col + c.span === cols
          ? "right"
          : c.row + c.rowspan / 2 <= rows / 2
            ? "top"
            : "bottom";
    items.push({ key: c.id, text: c.manual_name[lang], members: [c], side });
  }

  // Exact-middle-row singles (odd row counts) go to whichever of top / bottom is less crowded.
  const count = (side: Side) => items.filter((it) => it.side === side).length;
  for (const it of items) {
    const c = it.members[0];
    if (!c || it.members.length > 1 || (it.side !== "top" && it.side !== "bottom")) continue;
    if (c.row + c.rowspan / 2 !== rows / 2) continue;
    if (count("top") > count("bottom") + 1) it.side = "bottom";
  }

  // A numbered row whose way out is fully covered by another numbered row's span (e.g. the
  // overhead switches above the handles) takes the other side: any lane would cross that bracket.
  const span = (it: Item) => {
    const cs = it.members.map((m) => m.col + m.span / 2);
    return { lo: Math.min(...cs), hi: Math.max(...cs), row: it.members[0]?.row ?? 0 };
  };
  const groupItems = items.filter((it) => it.members.length > 1);
  const coveredToward = (it: Item, dir: "top" | "bottom") => {
    const me = span(it);
    return groupItems.some((g) => {
      if (g === it) return false;
      const o = span(g);
      const between = dir === "top" ? o.row < me.row : o.row > me.row;
      return between && o.lo <= me.lo && o.hi >= me.hi;
    });
  };
  for (const g of groupItems) {
    if (g.side !== "top" && g.side !== "bottom") continue;
    if (!coveredToward(g, g.side)) continue;
    // Prefer a side gutter that already exists (the less crowded one); else the other band.
    const gutters = (["left", "right"] as const)
      .filter((side) => items.some((it) => it.side === side))
      .sort((a, b) => count(a) - count(b));
    const other = g.side === "top" ? "bottom" : "top";
    g.side = gutters[0] ?? (coveredToward(g, other) ? g.side : other);
  }

  // 2. Side gutters fit the widest (wrapped) side tag.
  const sideWidth = (side: Side) =>
    items
      .filter((it) => it.side === side)
      .reduce((w, it) => Math.max(w, tagSize(wrapTag(it.text, 0)).w), 0);
  const gutterL = sideWidth("left") > 0 ? sideWidth("left") + EDGE_ROOM : 0;
  const gutterR = sideWidth("right") > 0 ? sideWidth("right") + EDGE_ROOM : 0;
  const panelW = W - MARGIN * 2 - gutterL - gutterR;
  const cellW = (panelW - PANEL_PAD * 2) / cols;
  const cellH = Math.min(cellW * 0.95, 150);
  const scale = (Math.min(cellW, cellH) / (GLYPH_HALF * 2)) * (GLYPH_FILL * 0.75);
  const panelH = cellH * rows + PANEL_PAD * 2;
  const topTagW = Math.max(cellW * 1.9, 150);

  const panelX = MARGIN + gutterL;
  const twoLineH = 2 * LINE_H + PAD_Y * 2;
  // The panel starts low enough for MAX_TIERS of tags; the layout is translated up afterwards.
  const MAX_TIERS = 4;
  const panelY = MARGIN + EDGE_ROOM + MAX_TIERS * (twoLineH + TAG_GAP);
  const panel: Box = { x: panelX, y: panelY, w: panelW, h: panelH };
  const gridX = panelX + PANEL_PAD;
  const gridY = panelY + PANEL_PAD;

  const controls: PlacedControl[] = station.controls.map((c) => {
    const s = scale * (c.size === "big" ? 1.15 : 1);
    return {
      control: c,
      cx: gridX + (c.col + c.span / 2) * cellW,
      cy: gridY + (c.row + c.rowspan / 2) * cellH,
      scale: s,
      r: GLYPH_HALF * s + 2 * U,
    };
  });
  const byId = new Map(controls.map((p) => [p.control.id, p]));
  const boxes = controls.map((p) => ({ id: p.control.id, box: glyphBox(p) }));

  /** Is the straight run a→b clear of every glyph except `own`? */
  const laneClear = (a: Pt, b: Pt, own: Set<string>) =>
    boxes.every(({ id, box }) => own.has(id) || !segmentHitsBox(a, b, box, 1));

  const placed: Callout[] = [];
  const ok = (
    leader: Pt[],
    box: Box,
    own: Set<string>,
    side?: Side,
    bracket: Callout["bracket"] = null,
  ) => {
    const mine = segmentsOf({ leader, bracket });
    if (boxesOverlap(box, panel, TAG_GAP)) return false;
    if (
      side &&
      reserved.some(
        (r) => r.side === side && r.x > box.x - TAG_GAP * 2 && r.x < box.x + box.w + TAG_GAP * 2,
      )
    ) {
      return false;
    }
    if (box.x < MARGIN - 0.5 || box.x + box.w > W - MARGIN + 0.5) return false;
    for (const other of placed) {
      if (boxesOverlap(box, other.box, TAG_GAP)) return false;
      const theirs = segmentsOf(other);
      for (const [a, b] of mine) {
        if (segmentHitsBox(a, b, other.box)) return false;
        for (const [c, d] of theirs) {
          if (segmentsIntersect(a, b, c, d)) return false;
        }
      }
      for (const [c, d] of theirs) {
        if (segmentHitsBox(c, d, box)) return false;
      }
    }
    return polySegments(leader).every(([a, b]) => laneClear(a, b, own));
  };

  // Order: by side, then along the side, so neighbouring leaders stay in order (no crossings).
  const order = (it: Item) => {
    const ms = it.members.map((m) => byId.get(m.id)).filter((p): p is PlacedControl => !!p);
    const x = ms.reduce((s, p) => s + p.cx, 0) / Math.max(1, ms.length);
    const y = ms.reduce((s, p) => s + p.cy, 0) / Math.max(1, ms.length);
    return it.side === "left" || it.side === "right" ? y : x;
  };
  const sides: Side[] = ["left", "right", "top", "bottom"];
  const along = (dir: 1 | -1 | 0) =>
    sides.flatMap((side) => {
      // Rows' brackets are rigid, so numbered rows go first; singles route around them.
      const list = items
        .filter((it) => it.side === side)
        .sort(
          (a, b) =>
            Number(b.members.length > 1) - Number(a.members.length > 1) || order(a) - order(b),
        );
      if (dir === -1) return list.reverse();
      if (dir === 0) {
        // centre-out: the middle of each side first
        const mid = (list.length - 1) / 2;
        return [...list].sort(
          (a, b) => Math.abs(list.indexOf(a) - mid) - Math.abs(list.indexOf(b) - mid),
        );
      }
      return list;
    });
  // Deterministic retries: the greedy pass depends on order, so try a few and keep the first
  // order in which every callout finds a clean placement.
  const orders = [along(1), along(-1), along(0)];

  /** The first glyph-clear lane x an item would use on its own side (null for side gutters). */
  function firstLane(it: Item): number | null {
    if (it.side === "left" || it.side === "right") return null;
    const ms = it.members.map((m) => byId.get(m.id)).filter((p): p is PlacedControl => !!p);
    const own = new Set(ms.map((m) => m.control.id));
    for (const { laneX, prefix } of laneCandidates(it, ms)) {
      const edgeY = it.side === "top" ? panel.y : panel.y + panel.h;
      const route = [...prefix, { x: laneX, y: edgeY }];
      if (polySegments(route).every(([a, b]) => laneClear(a, b, own))) return laneX;
    }
    return null;
  }

  /** Lanes still needed by unplaced items, per side: a tag may not cover them. */
  let reserved: { key: string; side: Side; x: number }[] = [];
  const failures: string[] = [];
  const attempt = (list: Item[], reserve: boolean): boolean => {
    placed.length = 0;
    reserved = reserve
      ? list.flatMap((it) => {
          const x = firstLane(it);
          return x === null ? [] : [{ key: it.key, side: it.side, x }];
        })
      : [];
    for (const it of list) {
      reserved = reserved.filter((r) => r.key !== it.key);
      const ms = it.members.map((m) => byId.get(m.id)).filter((p): p is PlacedControl => !!p);
      const own = new Set(ms.map((m) => m.control.id));
      const result =
        placeOne(it, ms, own) ??
        // A preferred side with no clean lane: try the opposite side, then the others.
        (["top", "bottom", "left", "right"] as const)
          .filter((s) => s !== it.side)
          .map((s) => placeOne({ ...it, side: s }, ms, own))
          .find((c) => c !== null) ??
        null;
      if (!result) {
        failures.push(it.key);
        return false;
      }
      placed.push(result);
    }
    return true;
  };
  // Lane reservation is only a heuristic (it keeps tags off lanes that later leaders need); the
  // real crossing checks always run, so the unreserved fallbacks can't produce a bad layout.
  const tried = [
    ...orders.map((o) => () => attempt(o, true)),
    ...orders.map((o) => () => attempt(o, false)),
  ];
  if (!tried.some((run) => run())) {
    throw new Error(
      `diagram callouts have no clean placement: ${station.id} (${lang}), stuck at ${failures.join(", ")}`,
    );
  }

  /** Lane candidates: straight out of the glyph, or (singles) an elbow that steps sideways into
   * the gap at the cell boundary and runs along it, for controls boxed in above and below. */
  function laneCandidates(it: Item, ms: PlacedControl[]): { laneX: number; prefix: Pt[] }[] {
    const up = it.side === "top";
    const r = Math.max(...ms.map((m) => m.r));
    const rowEdge = up
      ? Math.min(...ms.map((m) => m.cy)) - r
      : Math.max(...ms.map((m) => m.cy)) + r;
    const bracketY = up ? rowEdge - 1.5 * U : rowEdge + 1.5 * U;
    const x1 = Math.min(...ms.map((m) => m.cx));
    const x2 = Math.max(...ms.map((m) => m.cx));
    const lanes: { laneX: number; prefix: Pt[] }[] = [];
    if (ms.length > 1) {
      for (const lx of laneXs(x1, x2, cellW))
        lanes.push({ laneX: lx, prefix: [{ x: lx, y: bracketY }] });
    } else if (ms[0]) {
      const m = ms[0];
      lanes.push({ laneX: m.cx, prefix: [{ x: m.cx, y: rowEdge }] });
      const left = gridX + m.control.col * cellW;
      const right = gridX + (m.control.col + m.control.span) * cellW;
      const elbows = [
        { bx: left, sx: m.cx - m.r },
        { bx: right, sx: m.cx + m.r },
      ].sort((a, b) => Math.abs(a.bx - m.cx) - Math.abs(b.bx - m.cx));
      for (const { bx, sx } of elbows) {
        lanes.push({
          laneX: bx,
          prefix: [
            { x: sx, y: m.cy },
            { x: bx, y: m.cy },
          ],
        });
      }
    }
    return lanes;
  }

  function placeOne(it: Item, ms: PlacedControl[], own: Set<string>): Callout | null {
    const side = it.side;
    const isGroup = ms.length > 1;
    const lines = wrapTag(it.text, side === "left" || side === "right" ? 0 : topTagW);
    const { w, h } = tagSize(lines);
    const r = Math.max(...ms.map((m) => m.r));

    if (side === "left" || side === "right") {
      const m = ms[0];
      if (!m) return null;
      const edgeXg = side === "left" ? panel.x : panel.x + panel.w;
      const tagXg = side === "left" ? panel.x - EDGE_ROOM - w : panel.x + panel.w + EDGE_ROOM;
      if (isGroup) {
        // A numbered row named in a side gutter: its bracket runs just above or below the row,
        // and the leader leaves from the bracket's outer end straight out to the panel edge.
        const gx1 = Math.min(...ms.map((p) => p.cx));
        const gx2 = Math.max(...ms.map((p) => p.cx));
        const rowY = ms.reduce((sum, p) => sum + p.cy, 0) / ms.length;
        for (const dir of [1, -1] as const) {
          const by = rowY + dir * (r + 1.5 * U);
          const bracket = { a: { x: gx1, y: by }, b: { x: gx2, y: by } };
          const start: Pt = side === "left" ? bracket.a : bracket.b;
          const atEdge: Pt = { x: edgeXg, y: by };
          if (!laneClear(bracket.a, bracket.b, own) || !laneClear(start, atEdge, own)) continue;
          for (const dy of shifts(cellH * 0.55, 4 * U)) {
            const box = { x: tagXg, y: by - h / 2 + dy, w, h };
            const end: Pt = {
              x: side === "left" ? tagXg + w : tagXg,
              y: clamp(by, box.y + h * 0.3, box.y + h * 0.7),
            };
            const leader = [start, atEdge, end];
            if (ok(leader, box, own, undefined, bracket)) {
              return {
                key: it.key,
                lines,
                text: lines.join(" "),
                ids: [...own],
                side,
                box,
                leader,
                bracket,
                tier: 0,
              };
            }
          }
        }
        return null;
      }
      const start: Pt = { x: side === "left" ? m.cx - m.r : m.cx + m.r, y: m.cy };
      const edgeX = side === "left" ? panel.x : panel.x + panel.w;
      const tagX = side === "left" ? panel.x - EDGE_ROOM - w : panel.x + panel.w + EDGE_ROOM;
      // Slide the tag up / down along the gutter, staying near the control's row.
      for (const dy of shifts(cellH * 0.55, 4 * U)) {
        const box = { x: tagX, y: m.cy - h / 2 + dy, w, h };
        const end: Pt = {
          x: side === "left" ? tagX + w : tagX,
          y: clamp(m.cy, box.y + h * 0.3, box.y + h * 0.7),
        };
        const leader = [start, { x: edgeX, y: m.cy }, end];
        if (ok(leader, box, own)) {
          return {
            key: it.key,
            lines,
            text: lines.join(" "),
            ids: [...own],
            side,
            box,
            leader,
            bracket: null,
            tier: 0,
          };
        }
      }
      return null;
    }

    // Top / bottom: the leader leaves the control (or the row's bracket) straight up / down
    // through a clear lane, then runs to a tag in tier 0 or 1, kept near the control's column.
    const up = side === "top";
    const edgeY = up ? panel.y : panel.y + panel.h;
    const rowEdge = up
      ? Math.min(...ms.map((m) => m.cy)) - r
      : Math.max(...ms.map((m) => m.cy)) + r;
    const x1 = Math.min(...ms.map((m) => m.cx));
    const x2 = Math.max(...ms.map((m) => m.cx));
    // Bracket a little outside the members' glyphs, inside the gap to the next row.
    const bracketY = up ? rowEdge - 1.5 * U : rowEdge + 1.5 * U;
    const lanes = laneCandidates(it, ms);
    for (const { laneX, prefix } of lanes) {
      const atEdge: Pt = { x: laneX, y: edgeY };
      const route = [...prefix, atEdge];
      if (!polySegments(route).every(([a, b]) => laneClear(a, b, own))) continue;
      if (isGroup && !laneClear({ x: x1, y: bracketY }, { x: x2, y: bracketY }, own)) continue;
      for (let tier = 0; tier < MAX_TIERS; tier++) {
        const tierY = up
          ? panel.y - EDGE_ROOM - (tier + 1) * twoLineH - tier * TAG_GAP + (twoLineH - h)
          : panel.y + panel.h + EDGE_ROOM + tier * (twoLineH + TAG_GAP);
        // Tags stay near their control's column: within ~1 cell in the nearest tier, a little
        // more in the outer tiers (inside the panel every leader is still a straight lane).
        const reach = Math.max(cellW * (tier === 0 ? 0.9 : SHIFT_OUTER), w * 0.45);
        for (const dx of shifts(reach, 4 * U)) {
          const x = clamp(laneX - w / 2 + dx, MARGIN, W - MARGIN - w);
          const box = { x, y: tierY, w, h };
          const end: Pt = { x: clamp(laneX, x + PAD_X, x + w - PAD_X), y: up ? tierY + h : tierY };
          const leader = [...route, end];
          const bracket = isGroup ? { a: { x: x1, y: bracketY }, b: { x: x2, y: bracketY } } : null;
          if (ok(leader, box, own, side, bracket)) {
            return {
              key: it.key,
              lines,
              text: lines.join(" "),
              ids: [...own],
              side,
              box,
              leader,
              bracket,
              tier,
            };
          }
        }
      }
    }
    return null;
  }

  // Compact the tag bands: each tier only as tall as its tallest tag. Kept only if the result
  // still passes every geometric check (the leaders' tag ends move, their lanes don't).
  const compacted = compactTiers(placed, panel);
  if (layoutProblems(compacted, controls, panel).length === 0) {
    placed.splice(0, placed.length, ...compacted);
  }

  // Translate so the topmost tag (or the panel) sits at the margin; H fits the lowest tag.
  const top = Math.min(panel.y, ...placed.map((c) => c.box.y));
  const bottom = Math.max(panel.y + panel.h, ...placed.map((c) => c.box.y + c.box.h));
  const dy = MARGIN - top;
  const move = (p: Pt): Pt => ({ x: p.x, y: p.y + dy });
  return {
    W,
    H: bottom - top + MARGIN * 2,
    panel: { ...panel, y: panel.y + dy },
    controls: controls.map((p) => ({ ...p, cy: p.cy + dy })),
    callouts: placed.map((c) => ({
      ...c,
      box: { ...c.box, y: c.box.y + dy },
      leader: c.leader.map(move),
      bracket: c.bracket ? { a: move(c.bracket.a), b: move(c.bracket.b) } : null,
    })),
  };
}

/** 0, +s, −s, +2s, −2s … up to ±max. */
function shifts(max: number, step: number): number[] {
  const out = [0];
  for (let d = step; d <= max; d += step) out.push(d, -d);
  return out;
}

/** Lane candidates for a numbered row: the centre, then the gaps between members. */
function laneXs(x1: number, x2: number, cellW: number): number[] {
  const mid = (x1 + x2) / 2;
  const out = [mid];
  for (let x = x1 + cellW / 2; x < x2; x += cellW / 2) out.push(x);
  return out.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function compactTiers(callouts: Callout[], panel: Box): Callout[] {
  const out = callouts.map((c) => ({ ...c, box: { ...c.box }, leader: [...c.leader] }));
  for (const side of ["top", "bottom"] as const) {
    const band = out.filter((c) => c.side === side);
    const tiers = [...new Set(band.map((c) => c.tier))].sort((a, b) => a - b);
    let offset = EDGE_ROOM;
    for (const t of tiers) {
      const inTier = band.filter((c) => c.tier === t);
      const h = Math.max(...inTier.map((c) => c.box.h));
      for (const c of inTier) {
        c.box.y = side === "top" ? panel.y - offset - c.box.h : panel.y + panel.h + offset;
        const last = c.leader.length - 1;
        const end = c.leader[last];
        if (end) c.leader[last] = { x: end.x, y: side === "top" ? c.box.y + c.box.h : c.box.y };
      }
      offset += h + TAG_GAP;
    }
  }
  return out;
}

/**
 * Every violation of the diagram's rules: tags overlapping each other or the panel, leaders
 * crossing, leaders through another control's glyph or another tag. Empty = a clean layout.
 */
export function layoutProblems(
  callouts: readonly Callout[],
  controls: readonly PlacedControl[],
  panel: Box,
): string[] {
  const problems: string[] = [];
  callouts.forEach((c, i) => {
    if (boxesOverlap(c.box, panel)) problems.push(`${c.key} overlaps the panel`);
    for (const other of callouts.slice(i + 1)) {
      if (boxesOverlap(c.box, other.box)) problems.push(`${c.key} overlaps ${other.key}`);
    }
    // Leaders AND row brackets: every drawn line counts.
    for (const [a, b] of segmentsOf(c)) {
      for (const p of controls) {
        if (c.ids.includes(p.control.id)) continue;
        if (segmentHitsBox(a, b, glyphBox(p), 1)) problems.push(`${c.key} through ${p.control.id}`);
      }
      for (const other of callouts) {
        if (other === c) continue;
        if (segmentHitsBox(a, b, other.box)) problems.push(`${c.key} through tag ${other.key}`);
        for (const [d, e] of segmentsOf(other)) {
          if (other.key > c.key && segmentsIntersect(a, b, d, e)) {
            problems.push(`${c.key} crosses ${other.key}`);
          }
        }
      }
    }
  });
  return problems;
}
