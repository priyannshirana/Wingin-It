import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStation, STATIONS_FILE } from "../src/content/stations";
import type { Lang } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { ManualCard } from "../src/ui/ManualCard";
import {
  BOOK_H,
  BOOK_W,
  DIAGRAM_ASPECT,
  DIAGRAM_U,
  PAGE_W,
  TAB_REACH,
} from "../src/ui/manual/bookGeometry";
import {
  DIGIT_PX,
  glyphBox,
  highlightProblems,
  labelCapUnits,
  layoutDiagram,
  layoutProblems,
  layoutVariant,
  metrics,
  placeHighlights,
  PREFERRED,
  segmentHitsBox,
  segmentsIntersect,
  tagSize,
  textWidth,
  W,
  type Callout,
  type Pt,
} from "../src/ui/manual/diagramLayout";
import { ManualCover } from "../src/ui/manual/ManualCover";
import { PanelDrawing } from "../src/ui/manual/PanelDrawing";
import { fitBook } from "../src/ui/manual/useBookScale";
import { cardP1A1, cardP2B2, cardP3C3 } from "./fixtures/cards";
import { MANUAL_FIXTURES } from "./fixtures/manualCards";
import { kw, plain } from "./fixtures/messages";

const LANGS: Lang[] = ["hi", "en"];
const p = (x: number, y: number): Pt => ({ x, y });

function asTower(lang: Lang) {
  useStore.getState().reset();
  useStore.getState().receive({
    type: "joined",
    player_id: "p-tower",
    token: "t",
    role: "tower",
    lang,
    gender: "female",
    name: "Tower",
  });
}

beforeEach(() => asTower("hi"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("segmentsIntersect", () => {
  it("detects an X crossing", () => {
    expect(segmentsIntersect(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });
  it("detects a T junction (an endpoint on the other segment)", () => {
    expect(segmentsIntersect(p(0, 5), p(10, 5), p(4, 0), p(4, 5))).toBe(true);
    expect(segmentsIntersect(p(4, 0), p(4, 5), p(0, 5), p(10, 5))).toBe(true);
  });
  it("detects a shared endpoint", () => {
    expect(segmentsIntersect(p(0, 0), p(5, 5), p(5, 5), p(9, 0))).toBe(true);
  });
  it("detects collinear overlap despite float noise (x vs x + 1e-13)", () => {
    const x = 123.456;
    expect(segmentsIntersect(p(x, 0), p(x, 10), p(x + 1e-13, 5), p(x + 1e-13, 20))).toBe(true);
    expect(segmentsIntersect(p(0, 0.1 + 0.2), p(10, 0.3), p(5, 0.3), p(15, 0.3))).toBe(true);
  });
  it("rejects parallel, disjoint-collinear and near-miss segments", () => {
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(5, 0), p(9, 0))).toBe(false);
    expect(segmentsIntersect(p(0, 5), p(10, 5), p(4, 0), p(4, 4.999))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(1, 1), p(3, 0), p(4, -1))).toBe(false);
  });
});

describe("segmentHitsBox", () => {
  const box = { x: 10, y: 10, w: 20, h: 20 };
  it("detects a segment straight through the box (both ends outside)", () => {
    expect(segmentHitsBox(p(0, 20), p(40, 20), box)).toBe(true);
    expect(segmentHitsBox(p(0, 0), p(40, 40), box)).toBe(true);
  });
  it("detects a segment with one end inside", () => {
    expect(segmentHitsBox(p(20, 20), p(50, 50), box)).toBe(true);
  });
  it("rejects misses and edge grazes inside the inset", () => {
    expect(segmentHitsBox(p(0, 0), p(40, 0), box)).toBe(false);
    expect(segmentHitsBox(p(0, 5), p(5, 40), box)).toBe(false);
    expect(segmentHitsBox(p(0, 10.5), p(40, 10.5), box, 1)).toBe(false); // grazes the top edge
    expect(segmentHitsBox(p(0, 20), p(40, 20), { x: 10, y: 10, w: 1, h: 1 }, 1)).toBe(false);
  });
});

describe("book fit (§F12.3: the spread scales to fit width and height)", () => {
  // The center column at 1440 × 900 and 1280 × 720 (22 / 58 / 20 % columns, 24 px gaps / padding).
  const columns = [
    { w: 0.58 * (1440 - 48 - 48), h: 900 - 48 },
    { w: 0.58 * (1280 - 48 - 48), h: 720 - 48 },
  ];
  it("keeps the whole book inside the column at both sizes", () => {
    for (const c of columns) {
      const f = fitBook(c.w, c.h);
      expect(f.left).toBeGreaterThanOrEqual(-0.01);
      expect(f.top).toBeGreaterThanOrEqual(-0.01);
      expect(f.left + BOOK_W * f.scale).toBeLessThanOrEqual(c.w + 0.01);
      expect(f.top + BOOK_H * f.scale).toBeLessThanOrEqual(c.h + 0.01);
    }
  });
  it("draws the book at full size at 1440 × 900", () => {
    const [big] = columns;
    expect(big && fitBook(big.w, big.h).scale).toBeGreaterThanOrEqual(1);
  });
  it("is height-bound in a short column and width-bound in a narrow one", () => {
    expect(fitBook(2000, 400).scale).toBeCloseTo(400 / BOOK_H);
    expect(fitBook(500, 2000).scale).toBeCloseTo(500 / BOOK_W);
  });
});

describe("the open book (§F12.3)", () => {
  it("has two pages of equal width with the tabs inside the reserved width", () => {
    render(<ManualCard card={cardP1A1("hi")} />);
    const left = screen.getByTestId("page-left");
    const right = screen.getByTestId("page-right");
    expect(left.style.width).toBe(`${PAGE_W}px`);
    expect(right.style.width).toBe(left.style.width);
    expect(screen.getByTestId("phase-tabs").style.width).toBe(`${TAB_REACH}px`);
  });

  it("puts only the title bar and the diagram on the left page", () => {
    render(<ManualCard card={cardP1A1("en")} />);
    const left = screen.getByTestId("page-left");
    expect(within(left).getByTestId("module-title")).toBeDefined();
    expect(within(left).getByTestId("panel-drawing")).toBeDefined();
    for (const id of ["instruction", "rule-table", "hint", "sticky", "progress-dots"]) {
      expect(within(left).queryByTestId(id), id).toBeNull();
    }
  });

  it("puts the instruction, the grid, the notes and the dots on the right page, in order", () => {
    render(<ManualCard card={cardP1A1("en")} />);
    const right = screen.getByTestId("page-right");
    const order = ["instruction", "rule-table", "hint", "sticky", "progress-dots"].map((id) =>
      within(right).getByTestId(id),
    );
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1];
      const b = order[i];
      if (!a || !b) throw new Error("missing");
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("turns the page when the step changes: old right page on the leaf front, new left on its back", () => {
    // A Web Animation that never finishes, so the leaf stays up for the assertions.
    const animate = vi.fn(() => ({ finished: new Promise(() => undefined), cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const { rerender } = render(<ManualCard card={cardP1A1("en")} />);
    expect(screen.queryByTestId("page-turn")).toBeNull();
    rerender(<ManualCard card={cardP2B2("en")} />);
    const leaf = screen.getByTestId("page-turn");
    expect(within(leaf).getByTestId("leaf-page-right").textContent).toContain(
      cardP1A1("en").find_out?.station_label ?? "?",
    );
    expect(within(leaf).getByTestId("leaf-page-left").textContent).toContain(cardP2B2("en").title);
    // under the leaf: the old left page stays put, the new right page is already there
    expect(within(screen.getByTestId("page-left")).getByTestId("module-title").textContent).toBe(
      cardP1A1("en").title,
    );
    expect(screen.getByTestId("page-right").textContent).toContain(cardP2B2("en").known_from?.text);
    expect(animate).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("without Web Animations the turn lands at once on the new step", () => {
    const { rerender } = render(<ManualCard card={cardP1A1("en")} />);
    rerender(<ManualCard card={cardP3C3("en")} />);
    expect(screen.queryByTestId("page-turn")).toBeNull();
    expect(screen.getByTestId("module-title").textContent).toBe(cardP3C3("en").title);
  });
});

describe("manual cues (§F14.4 Tower timelines)", () => {
  it("manual_close closes the open book onto its cover; off reopens it (idempotent)", () => {
    render(<ManualCard card={cardP1A1("en")} />);
    expect(screen.queryByTestId("cover-leaf")).toBeNull();
    act(() => useStore.getState().setCue("manual_close", true));
    act(() => useStore.getState().setCue("manual_close", true));
    expect(screen.getAllByTestId("cover-leaf")).toHaveLength(1);
    expect(screen.getByTestId("cover-leaf").dataset.angle).toBe("0");
    expect(screen.getByTestId("page-left").style.visibility).toBe("hidden");
    expect(within(screen.getByTestId("cover-leaf")).getByTestId("cover-face")).toBeDefined();
    act(() => useStore.getState().setCue("manual_close", false));
    expect(screen.queryByTestId("cover-leaf")).toBeNull();
    expect(screen.getByTestId("page-left").style.visibility).toBe("");
  });

  it("manual_open swings the cover over the spine; the pose follows the cue both ways", () => {
    render(<ManualCover upcoming={1} />);
    const leaf = () => screen.getByTestId("cover-leaf");
    expect(leaf().dataset.angle).toBe("0");
    expect(leaf().style.transition).toBe("transform 300ms ease-in-out 0ms");
    act(() => useStore.getState().setCue("manual_open", true));
    expect(leaf().dataset.angle).toBe("-180");
    expect(leaf().style.transform).toBe("rotateY(-180deg)");
    // opening: the book slides into place first, then the cover flips (0.3 s each)
    expect(leaf().style.transition).toBe("transform 300ms ease-in-out 300ms");
    act(() => useStore.getState().setCue("manual_open", true));
    expect(leaf().dataset.angle).toBe("-180");
    act(() => useStore.getState().setCue("manual_open", false));
    expect(leaf().style.transform).toBe("rotateY(0deg)");
  });

  it("a cover mounted with manual_open already on shows the open pose (seek past the cue)", () => {
    act(() => useStore.getState().setCue("manual_open", true));
    render(<ManualCover upcoming={1} />);
    expect(screen.getByTestId("cover-leaf").style.transform).toBe("rotateY(-180deg)");
  });

  it("dots_green turns every dot green one by one, 150 ms apart; off restores them", () => {
    render(<ManualCard card={cardP1A1("hi")} />);
    const dots = () => Array.from(screen.getByTestId("progress-dots").children) as HTMLElement[];
    expect(dots().map((d) => d.dataset.state)).toEqual(cardP1A1("hi").progress);
    act(() => useStore.getState().setCue("dots_green", true));
    expect(dots().every((d) => d.dataset.state === "green")).toBe(true);
    expect(dots().map((d) => d.style.transitionDelay)).toEqual(
      dots().map((_, i) => `${i * 150}ms`),
    );
    act(() => useStore.getState().setCue("dots_green", false));
    expect(dots().map((d) => d.dataset.state)).toEqual(cardP1A1("hi").progress);
  });
});

describe("wrong-action slip (§F12.3 item 7)", () => {
  const wrong = (action_id: string, lang: Lang) =>
    useStore.getState().receive({
      type: "action_result",
      action_id,
      success: false,
      reason: "wrong_object",
      fuel_delta: -10,
      completed_steps: 0,
      total_steps: 1,
      used: {
        object_id: "OH_BTN_GREEN",
        label: [kw(lang === "en" ? "green" : "हरा", "GREEN", null), plain(" button")],
        verb: "press",
        count: 2,
      },
    });

  it.each(LANGS)("shows 'Flyer used: <control> ×count' over the grid (%s)", (lang) => {
    asTower(lang);
    render(<ManualCard card={cardP1A1(lang)} />);
    expect(screen.queryByTestId("wrong-slip")).toBeNull();
    act(() => wrong("P1_A1", lang));
    const slip = within(screen.getByTestId("rule-table")).getByTestId("wrong-slip");
    expect(slip.textContent).toContain(lang === "en" ? "Flyer used:" : "फ़्लायर ने छुआ:");
    expect(slip.textContent).toContain(lang === "en" ? "green" : "हरा");
    expect(slip.textContent).toContain("×2");
    expect(within(slip).getByTestId("wrong-cross")).toBeDefined();
  });

  it("ignores another step's result and successes", () => {
    render(<ManualCard card={cardP1A1("en")} />);
    act(() => wrong("P1_A2", "en"));
    expect(screen.queryByTestId("wrong-slip")).toBeNull();
  });
});

describe("diagram at the manual's page width", () => {
  it("lays out every station in both languages cleanly with full-size (14 px) tags", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const layout = layoutDiagram(station, lang, { u: DIAGRAM_U });
        const where = `${station.id} ${lang}`;
        expect(layout.preferred, where).toBe(true);
        expect(layout.fontPx, where).toBe(14);
        expect(layoutProblems(layout.callouts, layout.controls, layout.panel), where).toEqual([]);
        // never taller than its box, so the tags are never drawn below their size
        expect(layout.H / layout.W, where).toBeLessThanOrEqual(DIAGRAM_ASPECT / 0.94 + 1e-9);
      }
    }
  });

  it("every PREFERRED variant still lays out cleanly (the fallback is never needed)", () => {
    for (const [key, v] of Object.entries(PREFERRED)) {
      const [id, lang] = key.split(":");
      const station = STATIONS_FILE.stations.find((s) => s.id === id);
      if (!station || (lang !== "hi" && lang !== "en") || !v) throw new Error(key);
      const out = layoutVariant(station, lang, { u: DIAGRAM_U }, v);
      expect(out, key).not.toBeNull();
      if (out) expect(layoutProblems(out.callouts, out.controls, out.panel), key).toEqual([]);
    }
  });

  it("sizes every tag pill from its text width, so no text overflows its pill", () => {
    // A fake measurer standing in for the real canvas measurement (≈ 9 px per character).
    const measure = (text: string) => Array.from(text).length * 9;
    const m = metrics(DIAGRAM_U, measure);
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const layout = layoutDiagram(station, lang, { u: DIAGRAM_U, measure });
        for (const c of layout.callouts) {
          const widest = Math.max(...c.lines.map((l) => textWidth(l, m)));
          expect(c.box.w, `${station.id} ${c.key}`).toBeGreaterThanOrEqual(
            widest + 2 * m.padX - 1e-6,
          );
          expect(c.box.w).toBeCloseTo(tagSize(c.lines, m).w);
        }
      }
    }
  });

  it("keeps every row bracket inside the panel, clear of its border", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const { callouts, panel, u } = layoutDiagram(station, lang, { u: DIAGRAM_U });
        const clear = 3.5 * u; // the panel's outline width
        for (const c of callouts) {
          if (!c.bracket) continue;
          const where = `${station.id} ${lang} ${c.key}`;
          for (const q of [c.bracket.a, c.bracket.b]) {
            expect(q.y, where).toBeGreaterThan(panel.y + clear);
            expect(q.y, where).toBeLessThan(panel.y + panel.h - clear);
            expect(q.x, where).toBeGreaterThan(panel.x + clear);
            expect(q.x, where).toBeLessThan(panel.x + panel.w - clear);
          }
        }
      }
    }
  });

  it("draws digits and arrows at ≥ DIGIT_PX on screen whatever the glyph scale", () => {
    expect(DIGIT_PX).toBeGreaterThanOrEqual(14);
    for (const station of STATIONS_FILE.stations) {
      cleanup();
      const { container } = render(<PanelDrawing station={station.id} lang="en" />);
      const labels = Array.from(container.querySelectorAll('[data-testid="glyph-label"]'));
      expect(labels.length, station.id).toBe(station.controls.filter((c) => c.label).length);
      for (const label of labels) {
        const g = label.closest("[data-object-id]");
        const scale = Number(/scale\(([\d.]+)\)/.exec(g?.getAttribute("transform") ?? "")?.[1]);
        const px = (Number(label.getAttribute("data-size")) * scale) / DIAGRAM_U;
        expect(px, `${station.id} ${g?.getAttribute("data-object-id")}`).toBeGreaterThanOrEqual(
          DIGIT_PX - 1e-6,
        );
      }
    }
  });

  it("the diagram never draws 3D-only glyph text: digits and arrows only", () => {
    const labels = STATIONS_FILE.stations.flatMap((s) => s.controls.map((c) => c.label));
    for (const l of labels) if (l !== null) expect(l).toMatch(/^(\d|←|→)$/);
    expect(getStation("pedestal").controls.some((c) => c.label === "←")).toBe(true);
  });
});

describe("this step's rings and ? badges (§F12.3 left page, item 2)", () => {
  it.each(Object.keys(MANUAL_FIXTURES))(
    "%s: rings and badges never cover a neighbour, a tag, a leader or each other (both languages)",
    (key) => {
      const make = MANUAL_FIXTURES[key];
      if (!make) throw new Error(key);
      for (const lang of LANGS) {
        const card = make(lang);
        const layout = layoutDiagram(getStation(card.station), lang, { u: DIAGRAM_U });
        const h = placeHighlights(layout, card.highlight.circled, card.highlight.question);
        const where = `${key} ${lang}`;
        expect(layoutProblems(layout.callouts, layout.controls, layout.panel, h), where).toEqual(
          [],
        );
        // every listed control is marked (adjacent ones share one mark)
        expect(h.rings.flatMap((r) => r.ids).sort(), where).toEqual(
          [...card.highlight.circled].sort(),
        );
        expect(h.badges.flatMap((b) => b.ids).sort(), where).toEqual(
          [...card.highlight.question].sort(),
        );
        // rings are 4 px wherever that fits; never thinner than 2 px
        for (const r of h.rings) expect(r.stroke / layout.u).toBeGreaterThanOrEqual(2 - 1e-9);
      }
    },
  );

  it("adjacent listed controls share one mark; separate ones get their own", () => {
    const front = layoutDiagram(getStation("front"), "en", { u: DIAGRAM_U });
    const gear = placeHighlights(front, [], ["FP_GEAR_LAMP_1", "FP_GEAR_LAMP_2", "FP_GEAR_LAMP_3"]);
    expect(gear.badges).toHaveLength(1);
    const flaps = placeHighlights(front, ["FP_FLAP_L", "FP_FLAP_R"], []);
    expect(flaps.rings).toHaveLength(1);
    const overhead = layoutDiagram(getStation("overhead"), "en", { u: DIAGRAM_U });
    expect(placeHighlights(overhead, ["OH_BTN_1", "OH_BTN_3"], []).rings).toHaveLength(2);
  });

  it("rings go round the enlarged digit, and leave room for it at the smallest book scale", () => {
    const overhead = layoutDiagram(getStation("overhead"), "hi", { u: DIAGRAM_U });
    const h = placeHighlights(overhead, ["OH_BTN_1"], []);
    const ring = h.rings[0];
    const p0 = overhead.controls.find((c) => c.control.id === "OH_BTN_1");
    if (!ring || !p0) throw new Error("missing");
    const half = labelCapUnits(overhead.u) * 0.32;
    expect(ring.x + ring.stroke / 2).toBeLessThan(p0.cx - half);
    expect(ring.x + ring.w - ring.stroke / 2).toBeGreaterThan(p0.cx + half);
  });

  it("highlightProblems reports a badge or a ring over a neighbour", () => {
    const layout = layoutDiagram(getStation("front"), "en", { u: DIAGRAM_U });
    const h = placeHighlights(layout, ["FP_BTN_RED"], ["FP_GEAR_LAMP_1"]);
    const lamp2 = layout.controls.find((c) => c.control.id === "FP_GEAR_LAMP_2");
    const btn = layout.controls.find((c) => c.control.id === "FP_BTN_RED");
    if (!lamp2 || !btn) throw new Error("missing");
    const onLamp2 = {
      ...h,
      badges: [{ ids: ["FP_GEAR_LAMP_1"], cx: lamp2.cx, cy: lamp2.cy, r: 16 * layout.u }],
    };
    expect(highlightProblems(onLamp2, layout.controls, layout.callouts)).toContain(
      "badge FP_GEAR_LAMP_1 over FP_GEAR_LAMP_2",
    );
    const fat = h.rings.map((r) => ({ ...r, x: r.x - 40 * layout.u, w: r.w + 80 * layout.u }));
    expect(
      highlightProblems({ ...h, rings: fat, badges: [] }, layout.controls, layout.callouts).some(
        (m) => m.startsWith("ring FP_BTN_RED over"),
      ),
    ).toBe(true);
  });
});

describe("layoutProblems reports what's wrong", () => {
  const layout = layoutDiagram(getStation("overhead"), "en", { u: DIAGRAM_U });
  const [a, b] = layout.callouts;
  if (!a || !b) throw new Error("no callouts");

  it("is empty for the real layout", () => {
    expect(layoutProblems(layout.callouts, layout.controls, layout.panel)).toEqual([]);
  });

  it("reports crossing leaders", () => {
    // an X in the empty margin left of everything: the two leaders cross each other only
    const crossA: Callout = { ...a, leader: [p(1, 1), p(9, 9)], bracket: null };
    const crossB: Callout = { ...b, leader: [p(1, 9), p(9, 1)], bracket: null };
    const out = layoutProblems([crossA, crossB], layout.controls, layout.panel);
    const [first, second] = [a.key, b.key].sort();
    expect(out).toContain(`${first} crosses ${second}`);
  });

  it("reports a bracket through another control's glyph", () => {
    const g = layout.controls.find((c) => !a.ids.includes(c.control.id));
    if (!g) throw new Error("missing");
    const box = glyphBox(g);
    const bracket = { a: p(box.x - 10, g.cy), b: p(box.x + box.w + 10, g.cy) };
    const out = layoutProblems([{ ...a, bracket }], layout.controls, layout.panel);
    expect(out).toContain(`${a.key} through ${g.control.id}`);
  });

  it("reports a tag over the panel", () => {
    const box = { ...a.box, x: layout.panel.x + 10, y: layout.panel.y + 10 };
    const out = layoutProblems([{ ...a, box }], layout.controls, layout.panel);
    expect(out).toContain(`${a.key} overlaps the panel`);
  });
});

describe("layoutDiagram never throws (it runs during render)", () => {
  it("returns a best-effort layout, problems listed, where nothing fits cleanly", () => {
    // A diagram 120 px wide: far too small for 14 px tags.
    const out = layoutDiagram(getStation("front"), "en", { u: W / 120 });
    expect(out.callouts.flatMap((c) => c.ids).sort()).toEqual(
      getStation("front")
        .controls.map((c) => c.id)
        .sort(),
    );
    expect(out.problems.length).toBeGreaterThan(0);
  });

  it("keeps the layout no taller than the box allows when it can", () => {
    for (const station of STATIONS_FILE.stations) {
      for (const lang of LANGS) {
        const out = layoutDiagram(station, lang, {
          u: DIAGRAM_U,
          maxAspect: DIAGRAM_ASPECT / 0.94,
        });
        expect(out.H / out.W, `${station.id} ${lang}`).toBeLessThanOrEqual(DIAGRAM_ASPECT / 0.94);
        expect(out.problems).toEqual([]);
      }
    }
  });
});
