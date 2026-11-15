// Layout of the left page's panel diagram (§F12.3 left page, item 2). Pure and deterministic.
//
// - The station panel is scaled from the stations.json grid; side gutters are sized from the
//   (wrapped) callout tags of the outer columns, so those tags sit at the sides.
// - Every callout is a tag outside the panel joined to its control by a leader polyline: first a
//   straight run from the control to the panel edge along a lane that no other glyph blocks,
//   then a short run to the tag. Tags stay near their control (leaders stay roughly straight).
// - A geometric pass rejects any placement whose leader would cross another leader, run through
//   another control's glyph, or touch another tag. The unit tests check the same invariants.
// - Every length is derived from `u` (viewBox units per on-screen CSS px), so the tags are
//   CALLOUT_PX on screen whatever size the page is drawn at.
import type { ControlDef, StationDef } from "../../content/stations";
import type { Lang, StationId } from "../../net/protocol";

/** Default viewBox units per on-screen CSS px (the page passes its measured scale). */
export const DEFAULT_U = 2.4;
export const W = 1000;
/** Callout tags: Baloo 2 600 at this many on-screen px (§F12.3: ≥ 14 px). */
export const CALLOUT_PX = 14;
/** Digits and arrows on the diagram's controls: at least this many on-screen px. */
export const DIGIT_PX = 14;
const SHIFT_OUTER = 1.6; // cells, tiers ≥ 1
const GLYPH_FILL = 0.8; // glyphs fill 80% of a cell
const GLYPH_HALF = 24; // half the authored glyph size (units, before scale)
const MAX_TIERS = 8;

/** Measures a callout's text width in CSS px at CALLOUT_PX (null = use the estimate). */
export type TextMeasure = (text: string) => number | null;

export interface LayoutOptions {
  /** viewBox units per on-screen CSS px (W / the diagram's on-screen width). */
  u?: number;
  measure?: TextMeasure;
  /** Height ÷ width the diagram's box allows: taller layouts are rejected by the search. */
  maxAspect?: number;
}

/** Every length of the layout, in viewBox units, derived from the on-screen scale. */
export interface Metrics {
  u: number;
  /** viewBox units per px of tag text (= u unless the tags had to shrink). */
  textU: number;
  font: number;
  lineH: number;
  padX: number;
  padY: number;
  margin: number;
  tagGap: number;
  edgeRoom: number;
  /** Inner padding of the panel frame: edge-row brackets and digits stay clear of its border. */
  panelPad: number;
  measure: TextMeasure;
}

export function metrics(
  u: number = DEFAULT_U,
  measure: TextMeasure = () => null,
  shrink = 1,
): Metrics {
  const k = u * shrink; // tag text and padding scale with the (rarely) shrunk font
  const font = CALLOUT_PX * k;
  return {
    u,
    textU: k,
    font,
    lineH: font * 1.05,
    padX: 6 * k,
    padY: 3 * k,
    margin: 5 * u,
    tagGap: 4 * k,
    edgeRoom: 9 * k,
    panelPad: 10 * u,
    measure,
  };
}

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
  lines: string[]; // 1–2 lines (side-gutter tags: up to 3)
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
  /** viewBox units per on-screen px this layout was made for, and its tag font size. */
  u: number;
  font: number;
  /** The tags' on-screen font size (CALLOUT_PX unless the shrink fallback was needed). */
  fontPx: number;
  /** Rule violations (always empty, except for the best-effort last resort). */
  problems: string[];
  /** Laid out with the station's PREFERRED variant (else the standard search's first clean one). */
  preferred: boolean;
  lineH: number;
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

const DEVANAGARI = /[ऀ-ॿ]/;
/** Devanagari vowel signs that take their own width (ा ि ी ॉ ॊ ो ौ) and the visarga. */
const SPACING_SIGN = /[ःाि-ीॉ-ौ]/;
/** Marks drawn above / below / inside their letter (no width of their own). */
const NON_SPACING = /[ँंऺ़ु-ैॅॆ्ॢॣ]/;
const WIDE_VOWEL = /[अआओऔ]/;

/**
 * Estimated width in px at CALLOUT_PX (Baloo 2 600), per character class. Calibrated against the
 * real font for every tag name in stations.json (both languages): it is 10–40% wider than the
 * real width, never narrower. The diagram lays tags out with max(real, estimate) (see
 * measureText.ts), so the browser shows exactly the layout the unit tests check.
 */
export function estimateTextPx(text: string): number {
  let em = 0;
  for (const ch of Array.from(text)) {
    if (ch === " ") em += 0.26;
    else if (SPACING_SIGN.test(ch)) em += 0.36;
    else if (NON_SPACING.test(ch)) em += 0;
    else if (WIDE_VOWEL.test(ch)) em += 0.95;
    else if (DEVANAGARI.test(ch)) em += 0.75;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/[ijlI.]/.test(ch)) em += 0.3;
    else if (/[tfr]/.test(ch)) em += 0.42;
    else if (/[mwMW]/.test(ch)) em += 0.92;
    else em += 0.6;
  }
  return em * CALLOUT_PX * 1.05;
}

/** Text width in viewBox units: the real measurement when there is one, else the estimate. */
export function textWidth(text: string, m: Metrics): number {
  const px = m.measure(text) ?? estimateTextPx(text);
  return px * m.textU;
}

/**
 * One line, or the narrowest split into up to `maxLines` lines (side-gutter tags may take three
 * lines so a three-word name doesn't widen the gutter).
 */
export function wrapTag(text: string, maxOneLine: number, m: Metrics, maxLines = 2): string[] {
  const words = text.split(" ");
  if (words.length < 2 || textWidth(text, m) <= maxOneLine) return [text];
  const width = (lines: string[]) => Math.max(...lines.map((l) => textWidth(l, m)));
  let best: string[] = [text];
  let bestW = textWidth(text, m);
  const consider = (lines: string[]) => {
    const w = width(lines);
    if (w < bestW - 1e-9) {
      bestW = w;
      best = lines;
    }
  };
  for (let i = 1; i < words.length; i++) {
    consider([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
    if (maxLines < 3) continue;
    for (let j = i + 1; j < words.length; j++) {
      consider([
        words.slice(0, i).join(" "),
        words.slice(i, j).join(" "),
        words.slice(j).join(" "),
      ]);
    }
  }
  return best;
}

export const tagSize = (lines: string[], m: Metrics) => ({
  w: Math.max(...lines.map((l) => textWidth(l, m))) + m.padX * 2,
  h: lines.length * m.lineH + m.padY * 2,
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
  // Quick reject: the two segments' bounding boxes are apart (beyond float noise).
  if (
    Math.max(p1.x, p2.x) < Math.min(q1.x, q2.x) - GEOM_EPS ||
    Math.max(q1.x, q2.x) < Math.min(p1.x, p2.x) - GEOM_EPS ||
    Math.max(p1.y, p2.y) < Math.min(q1.y, q2.y) - GEOM_EPS ||
    Math.max(q1.y, q2.y) < Math.min(p1.y, p2.y) - GEOM_EPS
  ) {
    return false;
  }
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
  // Quick reject: the segment's bounding box misses the (inset) box.
  if (
    Math.max(a.x, b.x) < x0 - GEOM_EPS ||
    Math.min(a.x, b.x) > x1 + GEOM_EPS ||
    Math.max(a.y, b.y) < y0 - GEOM_EPS ||
    Math.min(a.y, b.y) > y1 + GEOM_EPS
  ) {
    return false;
  }
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

/** One way to lay out a station's panel (see layoutVariant). */
export interface Variant {
  /** Row height ÷ column width: taller rows open lanes and fill a tall page. */
  rowRatio: number;
  /** Share of a cell a glyph fills. */
  fill: number;
  /** Multiplies how far a tag may slide sideways from its control's lane. */
  reach: number;
  /**
   * Which outer columns' names go in a side gutter: "sides" both (§F12.3), "left" / "right" only
   * that one, "none" neither (those names then go above / below like the rest).
   */
  sides: "sides" | "left" | "right" | "none";
}

/**
 * SPEC-ASSUMPTION: §F12.3 puts the outer columns' names at the sides. On the two-page spread the
 * diagram is only 320 px wide, and on the 7-column overhead panel a left gutter costs the glyphs
 * more than its names are worth, so the overhead keeps only its right gutter (its col-0 names go
 * above / below); every other station keeps both. Taller row spacing fills the portrait page.
 * Glyphs at 1440 × 900: overhead 26 / 23 px (hi / en), pedestal 27 / 29 px (3-line side tags),
 * front 17 / 16 px (8 columns, ~15 callouts at 14 px: the tightest panel). The table is the
 * result of an offline exhaustive search at the manual's page width (biggest glyphs, then the
 * row spacing that best fills the page height); the unit tests check every entry still lays out
 * cleanly there, and layoutDiagram falls back to the standard search if one ever doesn't.
 */
export const PREFERRED: Readonly<Partial<Record<`${StationId}:${Lang}`, Variant>>> = {
  "overhead:hi": { rowRatio: 2.4, fill: GLYPH_FILL, reach: 1.8, sides: "right" },
  "pedestal:hi": { rowRatio: 2.4, fill: GLYPH_FILL, reach: 1, sides: "sides" },
  "front:hi": { rowRatio: 1.7, fill: GLYPH_FILL, reach: 1, sides: "sides" },
  "overhead:en": { rowRatio: 2, fill: GLYPH_FILL, reach: 1, sides: "right" },
  "pedestal:en": { rowRatio: 2.4, fill: GLYPH_FILL, reach: 1, sides: "sides" },
  "front:en": { rowRatio: 1.45, fill: GLYPH_FILL, reach: 1.8, sides: "sides" },
};

/** Placement checks one attempt may spend before it is abandoned (deterministic, not time). */
const CHECK_BUDGET = 40_000;
const OUT_OF_BUDGET = new Error("diagram layout: out of budget");
/** Step (px) when sliding a tag along its band. */
const SLIDE_STEP = 6;
const SEARCH: readonly Variant[] = [1, 0.9, 0.8, 0.7].flatMap((f) =>
  [1.05, 1.25, 1.45, 1.7].flatMap((rowRatio) =>
    [1, 1.8].map((reach) => ({ rowRatio, fill: GLYPH_FILL * f, reach, sides: "sides" as const })),
  ),
);

/** The layout for one variant at one scale, or null if it can't be placed cleanly. */
export function layoutVariant(
  station: StationDef,
  lang: Lang,
  opts: LayoutOptions,
  variant: Variant,
  budget = CHECK_BUDGET,
): DiagramLayout | null {
  const m = metrics(opts.u ?? DEFAULT_U, opts.measure ?? (() => null));
  return tryLayout(station, lang, m, variant, budget, [], { maxAspect: opts.maxAspect });
}

/**
 * The diagram at an on-screen scale (pure, deterministic, never throws: it runs during render).
 * The station's PREFERRED variant if it lays out cleanly; else the first clean variant of the
 * standard search (biggest glyphs first, side gutters as §F12.3 says, no taller than
 * `maxAspect`); else the tags are shrunk step by step (never below 85%); as a last resort a
 * best-effort layout (every tag placed, `problems` listing what's wrong) instead of an error.
 */
export function layoutDiagram(
  station: StationDef,
  lang: Lang,
  opts: LayoutOptions = {},
): DiagramLayout {
  const u0 = opts.u ?? DEFAULT_U;
  const measure = opts.measure ?? (() => null);
  const failures: string[] = [];
  const limits = { maxAspect: opts.maxAspect };
  const preferred = PREFERRED[`${station.id}:${lang}`];
  if (preferred) {
    const m = metrics(u0, measure);
    const out = tryLayout(station, lang, m, preferred, CHECK_BUDGET, failures, limits);
    if (out) return { ...out, preferred: true };
  }
  for (const shrink of [1, 0.95, 0.9, 0.85]) {
    const m = metrics(u0, measure, shrink);
    for (const v of SEARCH) {
      const out = tryLayout(station, lang, m, v, CHECK_BUDGET, failures, limits);
      if (out) return out;
    }
  }
  // (no side gutters: on a diagram too narrow for anything else they could leave no panel)
  const fallback: Variant = { rowRatio: 1.7, fill: GLYPH_FILL * 0.7, reach: 1.8, sides: "none" };
  const m = metrics(u0, measure, 0.85);
  // Best effort always places every tag; the empty layout is only there so render never throws.
  return (
    tryLayout(station, lang, m, fallback, Infinity, failures, { bestEffort: true }) ??
    emptyLayout(m)
  );
}

/** A panel-less layout (only if everything else failed; never expected). */
function emptyLayout(m: Metrics): DiagramLayout {
  return {
    W,
    H: W / 2,
    u: m.u,
    font: m.font,
    fontPx: m.font / m.u,
    preferred: false,
    problems: ["no layout"],
    lineH: m.lineH,
    panel: { x: m.margin, y: m.margin, w: W - 2 * m.margin, h: W / 2 - 2 * m.margin },
    controls: [],
    callouts: [],
  };
}

interface Limits {
  maxAspect?: number | undefined;
  /** Place every tag even where no clean spot exists (the last resort; problems are reported). */
  bestEffort?: boolean;
}

function tryLayout(
  station: StationDef,
  lang: Lang,
  m: Metrics,
  variant: Variant,
  checkBudget: number,
  failures: string[],
  limits: Limits = {},
): DiagramLayout | null {
  const bestEffort = limits.bestEffort === true;
  const { u } = m;
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
    for (const mem of members) grouped.add(mem.id);
    const first = members[0];
    if (!first) continue;
    items.push({
      key: `group-${key}`,
      text: groupName(
        members.map((mem) => mem.manual_name[lang]),
        lang,
      ),
      members,
      side: first.row + first.rowspan / 2 <= rows / 2 ? "top" : "bottom",
    });
  }
  for (const c of station.controls) {
    if (grouped.has(c.id)) continue;
    // §F12.3: the outer columns' names go at the sides; the rest above / below by grid half
    // (other variants send one or both outer columns above / below too: see PREFERRED).
    const leftGutter = variant.sides === "sides" || variant.sides === "left";
    const rightGutter = variant.sides === "sides" || variant.sides === "right";
    const side: Side =
      leftGutter && c.col === 0
        ? "left"
        : rightGutter && c.col + c.span === cols
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
    const cs = it.members.map((mem) => mem.col + mem.span / 2);
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
      .reduce((w, it) => Math.max(w, tagSize(wrapTag(it.text, 0, m, 3), m).w), 0);
  const gutterL = sideWidth("left") > 0 ? sideWidth("left") + m.edgeRoom : 0;
  const gutterR = sideWidth("right") > 0 ? sideWidth("right") + m.edgeRoom : 0;
  const panelW = W - m.margin * 2 - gutterL - gutterR;
  const cellW = (panelW - m.panelPad * 2) / cols;
  if (!(cellW > m.u)) return null; // the side gutters leave no panel
  const cellH = Math.min(cellW * variant.rowRatio, 150 * variant.rowRatio);
  const scale = (Math.min(cellW, cellH) / (GLYPH_HALF * 2)) * variant.fill;
  const panelH = cellH * rows + m.panelPad * 2;
  const topTagW = Math.max(cellW * 1.9, 150);

  const panelX = m.margin + gutterL;
  const twoLineH = 2 * m.lineH + m.padY * 2;
  // The panel starts low enough for MAX_TIERS of tags; the layout is translated up afterwards.
  const panelY = m.margin + m.edgeRoom + MAX_TIERS * (twoLineH + m.tagGap);
  const panel: Box = { x: panelX, y: panelY, w: panelW, h: panelH };
  const gridX = panelX + m.panelPad;
  const gridY = panelY + m.panelPad;

  const controls: PlacedControl[] = station.controls.map((c) => {
    const s = scale * (c.size === "big" ? 1.15 : 1);
    return {
      control: c,
      cx: gridX + (c.col + c.span / 2) * cellW,
      cy: gridY + (c.row + c.rowspan / 2) * cellH,
      scale: s,
      r: GLYPH_HALF * s + 1.5 * u,
    };
  });
  const byId = new Map(controls.map((p) => [p.control.id, p]));
  const boxes = controls.map((p) => ({ id: p.control.id, box: glyphBox(p) }));

  /** Is the straight run a→b clear of every glyph except `own`? */
  const laneClear = (a: Pt, b: Pt, own: Set<string>) =>
    boxes.every(({ id, box }) => own.has(id) || !segmentHitsBox(a, b, box, 1));

  const placed: Callout[] = [];
  // A deterministic work budget (counted placement checks, never wall time): a variant that
  // can't be placed cleanly gives up quickly, so the search stays fast on dense stations.
  let budget = checkBudget;
  const ok = (
    leader: Pt[],
    box: Box,
    own: Set<string>,
    side?: Side,
    bracket: Callout["bracket"] = null,
  ) => {
    if (--budget < 0) throw OUT_OF_BUDGET;
    const mine = segmentsOf({ leader, bracket });
    if (boxesOverlap(box, panel, m.tagGap)) return false;
    if (
      side &&
      reserved.some(
        (r) => r.side === side && r.x > box.x - m.tagGap * 2 && r.x < box.x + box.w + m.tagGap * 2,
      )
    ) {
      return false;
    }
    if (box.x < m.margin - 0.5 || box.x + box.w > W - m.margin + 0.5) return false;
    for (const other of placed) {
      if (boxesOverlap(box, other.box, m.tagGap)) return false;
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
    const ms = it.members.map((mem) => byId.get(mem.id)).filter((p): p is PlacedControl => !!p);
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
  /** Rows nearest the band's edge first (their tags take the inner tier, the deeper rows'
   * leaders then route between them), left to right. */
  const edgeFirst = () =>
    sides.flatMap((side) => {
      const depth = (it: Item) => {
        const r = Math.min(...it.members.map((mem) => mem.row));
        const rEnd = Math.max(...it.members.map((mem) => mem.row + mem.rowspan));
        return side === "top" ? r : side === "bottom" ? rows - rEnd : 0;
      };
      return items
        .filter((it) => it.side === side)
        .sort((a, b) => depth(a) - depth(b) || order(a) - order(b));
    });
  // Deterministic retries: the greedy pass depends on order, so try a few and keep the first
  // order in which every callout finds a clean placement.
  const orders = [along(1), along(-1), along(0), edgeFirst()];

  /** The first glyph-clear lane x an item would use on its own side (null for side gutters). */
  function firstLane(it: Item): number | null {
    if (it.side === "left" || it.side === "right") return null;
    const ms = it.members.map((mem) => byId.get(mem.id)).filter((p): p is PlacedControl => !!p);
    const own = new Set(ms.map((p) => p.control.id));
    for (const { laneX, prefix } of laneCandidates(it, ms)) {
      const edgeY = it.side === "top" ? panel.y : panel.y + panel.h;
      const route = [...prefix, { x: laneX, y: edgeY }];
      if (polySegments(route).every(([a, b]) => laneClear(a, b, own))) return laneX;
    }
    return null;
  }

  /** Lanes still needed by unplaced items, per side: a tag may not cover them. */
  let reserved: { key: string; side: Side; x: number }[] = [];
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
      const ms = it.members.map((mem) => byId.get(mem.id)).filter((p): p is PlacedControl => !!p);
      const own = new Set(ms.map((p) => p.control.id));
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
        if (!bestEffort) return false;
        placed.push(forcedCallout(it, ms));
        continue;
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
  // Best effort: one unreserved pass that forces a tag for anything it can't place cleanly.
  const passes = bestEffort ? [() => attempt(along(1), false)] : tried;
  try {
    if (!passes.some((run) => run())) return null;
  } catch (e) {
    if (e === OUT_OF_BUDGET) return null;
    throw e;
  }

  /** The last resort for an item with no clean spot: a tag in the outermost top tier above it. */
  function forcedCallout(it: Item, ms: PlacedControl[]): Callout {
    const lines = wrapTag(it.text, topTagW, m);
    const { w, h } = tagSize(lines, m);
    const x0 = ms.reduce((s, p) => s + p.cx, 0) / Math.max(1, ms.length);
    const y0 = Math.min(...ms.map((p) => p.cy - p.r));
    const tierY = panel.y - m.edgeRoom - MAX_TIERS * (twoLineH + m.tagGap);
    const box = { x: clamp(x0 - w / 2, m.margin, W - m.margin - w), y: tierY, w, h };
    return {
      key: it.key,
      lines,
      text: lines.join(" "),
      ids: ms.map((p) => p.control.id),
      side: "top",
      box,
      leader: [
        { x: x0, y: y0 },
        { x: clamp(x0, box.x + m.padX, box.x + w - m.padX), y: tierY + h },
      ],
      bracket: null,
      tier: MAX_TIERS,
    };
  }

  /** Lane candidates: straight out of the glyph, or (singles) an elbow that steps sideways into
   * the gap at the cell boundary and runs along it, for controls boxed in above and below. */
  function laneCandidates(it: Item, ms: PlacedControl[]): { laneX: number; prefix: Pt[] }[] {
    const up = it.side === "top";
    const r = Math.max(...ms.map((p) => p.r));
    const rowEdge = up
      ? Math.min(...ms.map((p) => p.cy)) - r
      : Math.max(...ms.map((p) => p.cy)) + r;
    const bracketY = up ? rowEdge - 1.5 * u : rowEdge + 1.5 * u;
    const x1 = Math.min(...ms.map((p) => p.cx));
    const x2 = Math.max(...ms.map((p) => p.cx));
    const lanes: { laneX: number; prefix: Pt[] }[] = [];
    if (ms.length > 1) {
      for (const lx of laneXs(x1, x2, cellW))
        lanes.push({ laneX: lx, prefix: [{ x: lx, y: bracketY }] });
    } else if (ms[0]) {
      const p = ms[0];
      lanes.push({ laneX: p.cx, prefix: [{ x: p.cx, y: rowEdge }] });
      const left = gridX + p.control.col * cellW;
      const right = gridX + (p.control.col + p.control.span) * cellW;
      const elbows = [
        { bx: left, sx: p.cx - p.r },
        { bx: right, sx: p.cx + p.r },
      ].sort((a, b) => Math.abs(a.bx - p.cx) - Math.abs(b.bx - p.cx));
      for (const { bx, sx } of elbows) {
        lanes.push({
          laneX: bx,
          prefix: [
            { x: sx, y: p.cy },
            { x: bx, y: p.cy },
          ],
        });
      }
    }
    return lanes;
  }

  function placeOne(it: Item, ms: PlacedControl[], own: Set<string>): Callout | null {
    const side = it.side;
    const isGroup = ms.length > 1;
    const atSide = side === "left" || side === "right";
    const lines = atSide ? wrapTag(it.text, 0, m, 3) : wrapTag(it.text, topTagW, m);
    const { w, h } = tagSize(lines, m);
    const r = Math.max(...ms.map((p) => p.r));

    if (side === "left" || side === "right") {
      const p0 = ms[0];
      if (!p0) return null;
      const edgeX = side === "left" ? panel.x : panel.x + panel.w;
      const tagX = side === "left" ? panel.x - m.edgeRoom - w : panel.x + panel.w + m.edgeRoom;
      if (isGroup) {
        // A numbered row named in a side gutter: its bracket runs just above or below the row,
        // and the leader leaves from the bracket's outer end straight out to the panel edge.
        const gx1 = Math.min(...ms.map((p) => p.cx));
        const gx2 = Math.max(...ms.map((p) => p.cx));
        const rowY = ms.reduce((sum, p) => sum + p.cy, 0) / ms.length;
        for (const dir of [1, -1] as const) {
          const by = rowY + dir * (r + 1.5 * u);
          const bracket = { a: { x: gx1, y: by }, b: { x: gx2, y: by } };
          const start: Pt = side === "left" ? bracket.a : bracket.b;
          const atEdge: Pt = { x: edgeX, y: by };
          if (!laneClear(bracket.a, bracket.b, own) || !laneClear(start, atEdge, own)) continue;
          for (const dy of shifts(cellH * 0.55, SLIDE_STEP * u)) {
            const box = { x: tagX, y: by - h / 2 + dy, w, h };
            const end: Pt = {
              x: side === "left" ? tagX + w : tagX,
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
      const start: Pt = { x: side === "left" ? p0.cx - p0.r : p0.cx + p0.r, y: p0.cy };
      // Slide the tag up / down along the gutter, staying near the control's row.
      for (const dy of shifts(cellH * 0.55, SLIDE_STEP * u)) {
        const box = { x: tagX, y: p0.cy - h / 2 + dy, w, h };
        const end: Pt = {
          x: side === "left" ? tagX + w : tagX,
          y: clamp(p0.cy, box.y + h * 0.3, box.y + h * 0.7),
        };
        const leader = [start, { x: edgeX, y: p0.cy }, end];
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
      ? Math.min(...ms.map((p) => p.cy)) - r
      : Math.max(...ms.map((p) => p.cy)) + r;
    const x1 = Math.min(...ms.map((p) => p.cx));
    const x2 = Math.max(...ms.map((p) => p.cx));
    // Bracket a little outside the members' glyphs, inside the gap to the next row.
    const bracketY = up ? rowEdge - 1.5 * u : rowEdge + 1.5 * u;
    const lanes = laneCandidates(it, ms);
    for (const { laneX, prefix } of lanes) {
      const atEdge: Pt = { x: laneX, y: edgeY };
      const route = [...prefix, atEdge];
      if (!polySegments(route).every(([a, b]) => laneClear(a, b, own))) continue;
      if (isGroup && !laneClear({ x: x1, y: bracketY }, { x: x2, y: bracketY }, own)) continue;
      for (let tier = 0; tier < MAX_TIERS; tier++) {
        const tierY = up
          ? panel.y - m.edgeRoom - (tier + 1) * twoLineH - tier * m.tagGap + (twoLineH - h)
          : panel.y + panel.h + m.edgeRoom + tier * (twoLineH + m.tagGap);
        // Tags stay near their control's column: within ~1 cell in the nearest tier, a little
        // more in the outer tiers (inside the panel every leader is still a straight lane).
        const reach = Math.max(cellW * (tier === 0 ? 0.9 : SHIFT_OUTER) * variant.reach, w * 0.45);
        for (const dx of shifts(reach, SLIDE_STEP * u)) {
          const x = clamp(laneX - w / 2 + dx, m.margin, W - m.margin - w);
          const box = { x, y: tierY, w, h };
          const end: Pt = {
            x: clamp(laneX, x + m.padX, x + w - m.padX),
            y: up ? tierY + h : tierY,
          };
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
  const compacted = compactTiers(placed, panel, m);
  if (layoutProblems(compacted, controls, panel).length === 0) {
    placed.splice(0, placed.length, ...compacted);
  }
  const problems = layoutProblems(placed, controls, panel);
  if (problems.length > 0 && !bestEffort) return null;

  // Translate so the topmost tag (or the panel) sits at the margin; H fits the lowest tag.
  const top = Math.min(panel.y, ...placed.map((c) => c.box.y));
  const bottom = Math.max(panel.y + panel.h, ...placed.map((c) => c.box.y + c.box.h));
  const dy = m.margin - top;
  const move = (p: Pt): Pt => ({ x: p.x, y: p.y + dy });
  const H = bottom - top + m.margin * 2;
  if (!bestEffort && limits.maxAspect !== undefined && H / W > limits.maxAspect) return null;
  return {
    W,
    H,
    u,
    font: m.font,
    fontPx: m.font / u,
    preferred: false,
    problems,
    lineH: m.lineH,
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
  if (!(cellW > 0)) return out;
  for (let x = x1 + cellW / 2; x < x2; x += cellW / 2) out.push(x);
  return out.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function compactTiers(callouts: Callout[], panel: Box, m: Metrics): Callout[] {
  const out = callouts.map((c) => ({ ...c, box: { ...c.box }, leader: [...c.leader] }));
  for (const side of ["top", "bottom"] as const) {
    const band = out.filter((c) => c.side === side);
    const tiers = [...new Set(band.map((c) => c.tier))].sort((a, b) => a - b);
    let offset = m.edgeRoom;
    for (const t of tiers) {
      const inTier = band.filter((c) => c.tier === t);
      const h = Math.max(...inTier.map((c) => c.box.h));
      for (const c of inTier) {
        c.box.y = side === "top" ? panel.y - offset - c.box.h : panel.y + panel.h + offset;
        const last = c.leader.length - 1;
        const end = c.leader[last];
        if (end) c.leader[last] = { x: end.x, y: side === "top" ? c.box.y + c.box.h : c.box.y };
      }
      offset += h + m.tagGap;
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
  highlights?: Highlights,
): string[] {
  const problems: string[] = highlights ? highlightProblems(highlights, controls, callouts) : [];
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

// ---------------------------------------------------------------------------------------------
// This step's highlights: dashed rings and "?" badges (§F12.3 left page, item 2)
// ---------------------------------------------------------------------------------------------

/** Smallest book scale the manual is drawn at (1280 × 720 ≈ 0.878): digits are sized up to it. */
export const MIN_BOOK_SCALE = 0.875;
/** The largest enlarged digit / arrow font (viewBox units): DIGIT_PX on screen at MIN_BOOK_SCALE. */
export const labelCapUnits = (u: number) => (DIGIT_PX * u) / MIN_BOOK_SCALE;

/**
 * Ring stroke (px at the design size) and the "?" badge radii tried (px; 32 px badge first).
 * SPEC-ASSUMPTION: a ring thins to 3, then 2 px only where a 4 px stroke can't pass between its
 * control and a neighbour (the front panel's right flap and brake handle are 2.6 px apart);
 * the simplest way to keep every ring clear of the neighbouring drawings.
 */
export const RING_STROKE = 4;
const RING_STROKES = [4, 3, 2];
const BADGE_RADII = [16, 13, 11, 9];
/** Ring corner radii tried (shares of its shorter side): round first, then per-corner mixes. */
const CORNER_SETS: readonly (readonly [number, number, number, number])[] = [
  [0.5, 0.5, 0.5, 0.5],
  [0.35, 0.35, 0.35, 0.35],
  ...[0.5, 0.35].flatMap((a) =>
    [0.5, 0.35].flatMap((b) =>
      [0.5, 0.35].flatMap((c) => [0.5, 0.35].map((d) => [a, b, c, d] as const)),
    ),
  ),
];
const BADGE_DIRS: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, i) => {
  const a = -Math.PI / 4 + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
  return [Math.cos(a), Math.sin(a)] as const;
});

/** A dashed ring: a rounded rectangle (a stadium on small controls) around one or more controls. */
export interface Ring {
  ids: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radii: top left, top right, bottom right, bottom left. */
  radii: readonly [number, number, number, number];
  /** Degrees, about the ring's center. */
  rot: number;
  /** Stroke width (viewBox units): RING_STROKE px, thinner only where that can't fit. */
  stroke: number;
}
export interface Badge {
  ids: string[];
  cx: number;
  cy: number;
  r: number;
}
export interface Highlights {
  u: number;
  rings: Ring[];
  badges: Badge[];
  /** Each control's drawing as boxes (art parts plus its enlarged label), for the checks. */
  art: Map<string, Box[]>;
}

interface Extent {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** The parts of a glyph's art in authored units (see ControlGlyph), before its scale. */
function artParts(c: ControlDef, state: ControlDef["default"]): Extent[] {
  const big = c.size === "big";
  switch (c.type) {
    case "PushButton":
      return [big ? { l: 22, r: 22, t: 22, b: 22 } : { l: 16, r: 16, t: 16, b: 16 }];
    case "ToggleSwitch": {
      if (c.style === "mushroom") return [{ l: 24, r: 24, t: 24, b: 24 }];
      const k = big ? 1.3 : 1;
      const w = c.style === "guarded" ? 18 : 11;
      return [{ l: w * k, r: w * k, t: (c.style === "guarded" ? 27 : 21.5) * k, b: 21.5 * k }];
    }
    case "PullHandle": {
      // a small stem knob, and the T-bar below it (lower still when pulled out)
      const k = big ? 1.3 : 1;
      const out = state.kind === "handle" && state.value === "out";
      const y0 = out ? 11 : 5;
      return [
        { l: 6 * k, r: 6 * k, t: 6 * k, b: (y0 + 1) * k },
        { l: 17 * k, r: 17 * k, t: -y0 * k, b: (y0 + 11) * k },
      ];
    }
    case "UpDownLever":
      return [{ l: 8, r: 8, t: 21, b: 21 }];
    case "NotchLever":
      return [
        { l: 8, r: 8, t: 21, b: 21 },
        { l: -9, r: 17, t: 13, b: 13 }, // the notch ticks on the right
      ];
    case "Lamp": {
      const k = big ? 1.35 : 1;
      return [{ l: 16 * k, r: 16 * k, t: 24 * k, b: 18 * k }];
    }
    case "FuelGauge":
      return [{ l: 21, r: 21, t: 21, b: 21 }];
    case "Screen":
      return [{ l: 21, r: 21, t: 14, b: 14 }];
    default:
      return [{ l: GLYPH_HALF, r: GLYPH_HALF, t: GLYPH_HALF, b: GLYPH_HALF }];
  }
}

/** The boxes a control's drawing occupies: its art's parts and its digit / arrow at the largest size. */
export function artBoxes(p: PlacedControl, u: number): Box[] {
  const outline = 1.75 * u; // half the 3.5 px outline
  const boxes = artParts(p.control, p.control.default).map((a) => ({
    x: p.cx - a.l * p.scale - outline,
    y: p.cy - a.t * p.scale - outline,
    w: (a.l + a.r) * p.scale + 2 * outline,
    h: (a.t + a.b) * p.scale + 2 * outline,
  }));
  if (p.control.label) {
    const fs = labelCapUnits(u);
    const halo = fs * 0.11;
    const hw = (isArrow(p.control.label) ? ARROW_HALF + 0.06 : 0.32) * fs + halo;
    const hh = 0.4 * fs + halo;
    boxes.push({ x: p.cx - hw, y: p.cy + u - hh, w: 2 * hw, h: 2 * hh });
  }
  return boxes;
}

/** The whole drawing's box (art and label). */
export const artBox = (p: PlacedControl, u: number): Box => union(artBoxes(p, u));

/** ← / → labels are drawn as arrows (font independent): half length, as a share of the size. */
export const ARROW_HALF = 0.28;
export const isArrow = (label: string) => label === "←" || label === "→";

/** A ring's outline grown by `grow` (± half the stroke = its two edges), as a closed polygon. */
function ringPoly(g: Ring, grow: number, perCorner = 8): Pt[] {
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const hw = g.w / 2 + grow;
  const hh = g.h / 2 + grow;
  const [tl, tr, br, bl] = g.radii.map((r) => Math.max(0, Math.min(r + grow, hw, hh)));
  const corners = [
    { x: hw - (br ?? 0), y: hh - (br ?? 0), r: br ?? 0, a0: 0 },
    { x: -(hw - (bl ?? 0)), y: hh - (bl ?? 0), r: bl ?? 0, a0: Math.PI / 2 },
    { x: -(hw - (tl ?? 0)), y: -(hh - (tl ?? 0)), r: tl ?? 0, a0: Math.PI },
    { x: hw - (tr ?? 0), y: -(hh - (tr ?? 0)), r: tr ?? 0, a0: (3 * Math.PI) / 2 },
  ];
  const pts: Pt[] = [];
  for (const c of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const t = c.a0 + (i / perCorner) * (Math.PI / 2);
      pts.push({ x: c.x + c.r * Math.cos(t), y: c.y + c.r * Math.sin(t) });
    }
  }
  const rad = (g.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out = pts.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
  const first = out[0];
  return first ? [...out, first] : out;
}

/** The ring's center line as an SVG path (exact arcs), to draw with `rotate(rot cx cy)`. */
export function ringPath(g: Ring): string {
  const [tl, tr, br, bl] = g.radii;
  const { x, y, w, h } = g;
  return [
    `M${x + tl} ${y}`,
    `H${x + w - tr}`,
    `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}`,
    `V${y + h - br}`,
    `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}`,
    `H${x + bl}`,
    `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}`,
    `V${y + tl}`,
    `A${tl} ${tl} 0 0 1 ${x + tl} ${y}`,
    "Z",
  ].join(" ");
}

/** Both edges of the ring's stroke. */
function ringEdges(g: Ring): (readonly [Pt, Pt])[] {
  const half = g.stroke / 2;
  return [...polySegments(ringPoly(g, half)), ...polySegments(ringPoly(g, -half))];
}

/** A box's outline with its corners cut at 30% of the shorter side. */
function chamfered(b: Box): (readonly [Pt, Pt])[] {
  const c = Math.min(b.w, b.h) * 0.3;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h;
  return polySegments([
    { x: b.x + c, y: b.y },
    { x: x1 - c, y: b.y },
    { x: x1, y: b.y + c },
    { x: x1, y: y1 - c },
    { x: x1 - c, y: y1 },
    { x: b.x + c, y: y1 },
    { x: b.x, y: y1 - c },
    { x: b.x, y: b.y + c },
    { x: b.x + c, y: b.y },
  ]);
}

const grow = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});
const badgeBox = (b: Badge): Box => ({ x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 });
/** The badge's white rim reaches a little further than its disc. */
const BADGE_RIM = 1;

function dotBoxes(callouts: readonly Callout[], u: number): { key: string; box: Box }[] {
  const r = 2.6 * u;
  return callouts.flatMap((c) => {
    const [p] = c.leader;
    return p ? [{ key: c.key, box: { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r } }] : [];
  });
}

/** Everything wrong with these rings and badges (empty = clean). */
export function highlightProblems(
  h: Highlights,
  controls: readonly PlacedControl[],
  callouts: readonly Callout[],
): string[] {
  const problems: string[] = [];
  const u = h.u;
  // Leaders may pass over a dashed ring (as in any annotated drawing); badges must stay clear.
  const lines = callouts.flatMap((c) => segmentsOf(c).map((s) => ({ c, s })));
  h.rings.forEach((ring, i) => {
    const name = ring.ids.join("+");
    const edges = ringEdges(ring);
    const hits = (box: Box) => edges.some(([a, b]) => segmentHitsBox(a, b, box));
    // (art boxes are conservative and their corners empty, so they're checked chamfered)
    for (const p of controls) {
      const boxes = h.art.get(p.control.id) ?? [];
      if (ring.ids.includes(p.control.id)) {
        // around its own drawing and enlarged digit, not through them (art boxes are
        // conservative: their corners are empty, so those are chamfered off)
        const shapes = boxes.flatMap(chamfered);
        if (edges.some(([a, b]) => shapes.some(([c, d]) => segmentsIntersect(a, b, c, d)))) {
          problems.push(`ring ${name} cuts ${p.control.id}`);
        }
      } else if (
        boxes.some((b) => {
          const shape = chamfered(b);
          return edges.some(([a, c]) => shape.some(([d, e]) => segmentsIntersect(a, c, d, e)));
        })
      ) {
        problems.push(`ring ${name} over ${p.control.id}`);
      }
    }
    for (const c of callouts) if (hits(c.box)) problems.push(`ring ${name} over tag ${c.key}`);
    for (const other of h.rings.slice(i + 1)) {
      const theirs = ringEdges(other);
      if (edges.some(([a, b]) => theirs.some(([c, d]) => segmentsIntersect(a, b, c, d)))) {
        problems.push(`ring ${name} crosses ring ${other.ids.join("+")}`);
      }
    }
  });
  const dots = dotBoxes(callouts, u);
  h.badges.forEach((badge, i) => {
    const name = badge.ids.join("+");
    const rim = grow(badgeBox(badge), BADGE_RIM * u);
    for (const p of controls) {
      const boxes = h.art.get(p.control.id) ?? [];
      if (boxes.some((b) => boxesOverlap(rim, b)))
        problems.push(`badge ${name} over ${p.control.id}`);
    }
    for (const c of callouts)
      if (boxesOverlap(rim, c.box)) problems.push(`badge ${name} over tag ${c.key}`);
    for (const { c, s } of lines) {
      if (segmentHitsBox(s[0], s[1], rim)) problems.push(`badge ${name} over ${c.key}'s line`);
    }
    for (const d of dots)
      if (boxesOverlap(rim, d.box)) problems.push(`badge ${name} over ${d.key}'s dot`);
    for (const ring of h.rings) {
      if (ringEdges(ring).some(([a, b]) => segmentHitsBox(a, b, rim))) {
        problems.push(`badge ${name} over ring ${ring.ids.join("+")}`);
      }
    }
    for (const other of h.badges.slice(i + 1)) {
      if (boxesOverlap(badgeBox(badge), badgeBox(other), BADGE_RIM * u)) {
        problems.push(`badge ${name} over badge ${other.ids.join("+")}`);
      }
    }
  });
  return problems;
}

/** Runs of listed controls that sit side by side in one grid row (each run shares one mark). */
function runs(ids: readonly string[], byId: Map<string, PlacedControl>): PlacedControl[][] {
  const ps = ids.map((id) => byId.get(id)).filter((p): p is PlacedControl => !!p);
  ps.sort((a, b) => a.control.row - b.control.row || a.control.col - b.control.col);
  const out: PlacedControl[][] = [];
  for (const p of ps) {
    const run = out.at(-1);
    const last = run?.at(-1);
    if (
      run &&
      last &&
      last.control.row === p.control.row &&
      last.control.rowspan === p.control.rowspan &&
      last.control.col + last.control.span === p.control.col
    ) {
      run.push(p);
    } else {
      out.push([p]);
    }
  }
  return out;
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/**
 * Rings and "?" badges for this step, placed so they never cover a neighbouring control, a tag,
 * a leader, a bracket, a leader dot or each other, and never cut their own drawing or enlarged
 * digit. Each ring is the roomiest rounded ring (up to ~30% around the glyph) that is clean,
 * shrinking to a tight stadium round the drawing; each badge takes the first clear spot around
 * its control (upper right first) at 32 px, else a little smaller. Deterministic.
 *
 * SPEC-ASSUMPTION: controls listed together that sit side by side in a row (the front panel's
 * flap levers, its red and green buttons, its three gear lights) share one ring / one "?" badge:
 * at the front panel's 21 px pitch separate 4 px rings or 32 px badges can't avoid each other or
 * the neighbouring controls, and one mark round the group reads the same.
 */
export function placeHighlights(
  layout: DiagramLayout,
  circled: readonly string[],
  question: readonly string[],
): Highlights {
  const { u, controls, callouts } = layout;
  const art = new Map(controls.map((p) => [p.control.id, artBoxes(p, u)]));
  const h: Highlights = { u, rings: [], badges: [], art };
  const byId = new Map(controls.map((p) => [p.control.id, p]));
  const clean = (probe: Highlights) => highlightProblems(probe, controls, callouts).length === 0;

  runs(circled, byId).forEach((run, i) => {
    const inner = grow(union(run.flatMap((p) => art.get(p.control.id) ?? [])), 0.25 * u);
    const roomy = Math.max(...run.map((p) => p.r)) * 0.3;
    const tilt = i % 2 === 0 ? -5 : 4;
    let chosen: Ring | null = null;
    const steps = 10;
    const tightAt = (stroke: number) => grow(inner, stroke / 2); // inner edge just clear
    search: for (const px of RING_STROKES) {
      const stroke = px * u;
      const tight = tightAt(stroke);
      for (let k = steps; k >= 0; k--) {
        const box = grow(tight, (roomy * k) / steps);
        const side = Math.min(box.w, box.h);
        for (const radii of CORNER_SETS) {
          for (const rot of [tilt, 0]) {
            const ring: Ring = {
              ids: run.map((p) => p.control.id),
              ...box,
              radii: [radii[0] * side, radii[1] * side, radii[2] * side, radii[3] * side],
              rot,
              stroke,
            };
            if (clean({ ...h, rings: [...h.rings, ring], badges: [] })) {
              chosen = ring;
              break search;
            }
          }
        }
      }
    }
    // Nothing clean: the tight, untilted ring (reported by highlightProblems).
    const stroke = RING_STROKE * u;
    const tight = tightAt(stroke);
    const r = Math.min(tight.w, tight.h) * 0.35;
    h.rings.push(
      chosen ?? {
        ids: run.map((p) => p.control.id),
        ...tight,
        radii: [r, r, r, r],
        rot: 0,
        stroke,
      },
    );
  });

  for (const run of runs(question, byId)) {
    const own = union(run.flatMap((p) => art.get(p.control.id) ?? []));
    const cx = own.x + own.w / 2;
    const cy = own.y + own.h / 2;
    let chosen: Badge | null = null;
    search: for (const rpx of BADGE_RADII) {
      const r = rpx * u;
      for (const gap of [1.5, 4, 7, 11]) {
        const g = gap * u;
        // 16 directions, upper right first; each just clear of the drawing (plus the gap)
        const cands: Pt[] = BADGE_DIRS.map(([dx, dy]) => {
          const tx = dx === 0 ? Infinity : (own.w / 2 + r + g) / Math.abs(dx);
          const ty = dy === 0 ? Infinity : (own.h / 2 + r + g) / Math.abs(dy);
          const t = Math.min(tx, ty);
          return { x: cx + dx * t, y: cy + dy * t };
        });
        for (const c of cands) {
          if (c.x - r < 0 || c.y - r < 0 || c.x + r > layout.W || c.y + r > layout.H) continue;
          const badge = { ids: run.map((p) => p.control.id), cx: c.x, cy: c.y, r };
          if (clean({ ...h, badges: [...h.badges, badge] })) {
            chosen = badge;
            break search;
          }
        }
      }
    }
    h.badges.push(
      chosen ?? {
        ids: run.map((p) => p.control.id),
        cx: own.x + own.w,
        cy: own.y,
        r: (BADGE_RADII.at(-1) ?? 9) * u,
      },
    );
  }
  return h;
}
