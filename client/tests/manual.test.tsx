import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStation, STATIONS_FILE } from "../src/content/stations";
import type { Lang } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { ManualCard } from "../src/ui/ManualCard";
import { DIAGRAM_U } from "../src/ui/manual/bookGeometry";
import {
  boxesOverlap,
  glyphBox,
  groupName,
  layoutDiagram,
  layoutProblems,
  PREFERRED,
  segmentHitsBox,
  segmentsIntersect,
  type Pt,
} from "../src/ui/manual/diagramLayout";
import { PanelDrawing } from "../src/ui/manual/PanelDrawing";
import { cardP1A1, cardP1A7, cardP2B2, cardP3C3 } from "./fixtures/cards";
import { plain } from "./fixtures/messages";

const DEVANAGARI = /[ऀ-ॿ]/;
const LANGS: Lang[] = ["hi", "en"];
/** The diagram as the manual draws it: at its left page's width. */
const AT_PAGE = { u: DIAGRAM_U };

/** The viewer is a Tower in `lang` (chrome strings follow me.lang, never the role). */
function asTower(lang: Lang) {
  useStore.getState().reset();
  useStore.getState().receive({
    type: "joined",
    player_id: "p-tower",
    token: "t",
    role: "tower",
    lang,
    gender: "male",
    name: "Tower",
  });
}

beforeEach(() => asTower("hi"));
afterEach(cleanup);

describe.each(LANGS)("ManualCard module page (§F12.3), %s Tower", (lang) => {
  beforeEach(() => asTower(lang));

  it("observe step: title, diagram, breadcrumb sentence + then_grid, a pictogram per value", () => {
    render(<ManualCard card={cardP1A1(lang)} />);
    expect(screen.getByTestId("module-title").textContent).toBe(cardP1A1(lang).title);
    expect(screen.getByTestId("panel-drawing")).toBeDefined();
    const instruction = screen.getByTestId("instruction").textContent ?? "";
    const f = cardP1A1(lang).find_out;
    expect(instruction).toContain(f?.station_label ?? "?");
    expect(instruction).toContain(f?.property_label ?? "?");
    expect(instruction).toContain(lang === "en" ? "then follow the grid" : "फिर तालिका देखो");
    const columns = screen.getAllByTestId("rule-row");
    expect(columns).toHaveLength(2);
    for (const col of columns) {
      expect(within(col).getByTestId("value-pictogram").getAttribute("data-kind")).toBe("color");
      expect(within(col).getAllByTestId("control-drawing")).toHaveLength(1);
    }
  });

  it("say-only ordered step: instruction_do, pointing hand, 1 → 2 drawings", () => {
    render(<ManualCard card={cardP1A7(lang)} />);
    expect(screen.getByTestId("instruction").textContent).toContain(
      lang === "en" ? "Have the Flyer do this:" : "फ़्लायर से यह करवाओ:",
    );
    const [col] = screen.getAllByTestId("rule-row");
    if (!col) throw new Error("no column");
    expect(within(col).getByTestId("pointing-hand")).toBeDefined();
    expect(
      within(col)
        .getAllByTestId("control-drawing")
        .map((d) => d.dataset.objectId),
    ).toEqual(["OH_SW_4", "OH_HANDLE_1"]);
    expect(within(col).getByTestId("order-sep").textContent).toBe("→");
    expect(col.textContent).toContain(lang === "en" ? "in this order" : "इसी क्रम में");
  });

  it("branch_on side step: known_from + then_grid, arrows with the fire flame", () => {
    render(<ManualCard card={cardP2B2(lang)} />);
    const instruction = screen.getByTestId("instruction").textContent ?? "";
    expect(instruction).toContain(cardP2B2(lang).known_from?.text ?? "?");
    expect(instruction).toContain(lang === "en" ? "then follow the grid" : "फिर तालिका देखो");
    const pictos = screen.getAllByTestId("value-pictogram");
    expect(pictos.map((p) => p.getAttribute("data-kind"))).toEqual(["side", "side"]);
    expect(screen.getAllByTestId("flame")).toHaveLength(2);
    expect(screen.getByTestId("emergency-stamp").textContent).toBe(
      lang === "en" ? "EMERGENCY" : "आपातकाल",
    );
  });

  it("unordered counts step: + between drawings, ×2 badge, smudges on both pages", () => {
    render(<ManualCard card={cardP3C3(lang)} />);
    const [col] = screen.getAllByTestId("rule-row");
    if (!col) throw new Error("no column");
    expect(within(col).getByTestId("order-sep").textContent).toBe("+");
    expect(
      within(col)
        .getAllByTestId("count-badge")
        .map((b) => b.textContent),
    ).toEqual(["×2"]);
    expect(col.textContent).toContain(lang === "en" ? "any order" : "कोई भी क्रम");
    expect(screen.getAllByTestId("smudge")).toHaveLength(8);
  });

  it("highlights keywords only, all with one identical style", () => {
    render(<ManualCard card={cardP1A1(lang)} />);
    const marks = screen.getAllByTestId("ink-keyword");
    expect(marks.length).toBeGreaterThanOrEqual(6);
    expect(new Set(marks.map((m) => m.className)).size).toBe(1);
    const plainText = lang === "en" ? " button " : " नंबर बटन ";
    expect(marks.map((m) => m.textContent)).not.toContain(plainText);
  });

  it("right page: hint, sticky, last-try only when set, progress dots", () => {
    render(<ManualCard card={cardP1A1(lang)} />);
    expect(screen.getByTestId("hint").textContent).toContain(cardP1A1(lang).hint);
    expect(screen.getByTestId("sticky").textContent).toContain(cardP1A1(lang).sticky);
    expect(screen.queryByTestId("last-wrong")).toBeNull();
    expect(screen.getByTestId("progress-dots").children).toHaveLength(7);
    cleanup();
    const name = lang === "en" ? "green button" : "हरा बटन";
    render(
      <ManualCard card={{ ...cardP1A1(lang), last_wrong: { label: [plain(name)], count: 2 } }} />,
    );
    const note = screen.getByTestId("last-wrong").textContent ?? "";
    expect(note).toContain(lang === "en" ? "Last try:" : "पिछली बार:");
    expect(note).toContain(name);
    expect(note).toContain("×2");
  });

  it("quick-say: none in real mode; one at the instruction line and one per column", () => {
    render(<ManualCard card={cardP1A1(lang)} />);
    expect(screen.queryAllByTestId("quick-say")).toHaveLength(0);
    cleanup();
    const line = (text: string) => ({ label: text, text });
    render(
      <ManualCard
        card={{
          ...cardP1A1(lang),
          quick_say: {
            ask: line("ask"),
            say: null,
            branches: [
              { value: "RED", line: line("red") },
              { value: "BLUE", line: line("blue") },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByTestId("quick-say")).toHaveLength(3);
    expect(within(screen.getByTestId("instruction")).getAllByTestId("quick-say")).toHaveLength(1);
  });

  it("renders the success stamp in the matching column", () => {
    useStore.getState().receive({
      type: "action_result",
      action_id: "P1_A1",
      success: true,
      reason: null,
      fuel_delta: 0,
      completed_steps: 1,
      total_steps: 1,
      row_index: 1,
    });
    render(<ManualCard card={cardP1A1(lang)} />);
    const columns = screen.getAllByTestId("rule-row");
    const stamp = within(columns[1] ?? document.body).getByTestId("row-stamp");
    expect(stamp.className).toContain("animate-stamp"); // the 1.6 → 1 slam, not the menu pop
    expect(within(columns[0] ?? document.body).queryByTestId("row-stamp")).toBeNull();
  });
});

describe("language independence (§A2 rule 9)", () => {
  it("an English Tower's manual has no Devanagari anywhere", () => {
    asTower("en");
    for (const card of [cardP1A1("en"), cardP1A7("en"), cardP2B2("en"), cardP3C3("en")]) {
      cleanup();
      const { container } = render(<ManualCard card={card} />);
      expect(container.textContent, card.action_id).not.toMatch(DEVANAGARI);
    }
  });
});

describe("PanelDrawing diagram (§F12.3 left page, item 2)", () => {
  it("draws every control of every station from the grid, in its default state", () => {
    for (const station of STATIONS_FILE.stations) {
      cleanup();
      const { container } = render(<PanelDrawing station={station.id} lang="hi" />);
      const drawn = Array.from(container.querySelectorAll("[data-object-id]")).map((g) =>
        g.getAttribute("data-object-id"),
      );
      expect(drawn.sort()).toEqual(station.controls.map((c) => c.id).sort());
    }
  });

  it("names every control exactly once: group callouts for numbered rows, one per other", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const { callouts } = layoutDiagram(station, lang, AT_PAGE);
        const named = callouts.flatMap((c) => c.ids).sort();
        expect(named, `${station.id} ${lang}`).toEqual(station.controls.map((c) => c.id).sort());
      }
    }
    const overhead = layoutDiagram(getStation("overhead"), "hi", AT_PAGE);
    const groups = overhead.callouts.filter((c) => c.ids.length > 1).map((c) => c.text);
    expect(groups.sort()).toEqual(["बटन", "लीवर", "स्विच"]);
    const en = layoutDiagram(getStation("overhead"), "en", AT_PAGE);
    expect(
      en.callouts
        .filter((c) => c.ids.length > 1)
        .map((c) => c.text)
        .sort(),
    ).toEqual(["buttons", "levers", "switches"]);
  });

  it("callout tags never overlap each other or the panel, in both languages", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const layout = layoutDiagram(station, lang, AT_PAGE);
        const boxes = layout.callouts.map((c) => c.box);
        boxes.forEach((a, i) => {
          expect(boxesOverlap(a, layout.panel), `${station.id} ${lang} ${i}`).toBe(false);
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(layout.W);
          boxes.slice(i + 1).forEach((b) => expect(boxesOverlap(a, b)).toBe(false));
        });
      }
    }
  });

  it("leaders never cross each other, run through another glyph or through another tag", () => {
    const segs = (pts: Pt[]) => pts.slice(1).map((b, i) => [pts[i] ?? b, b] as const);
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const layout = layoutDiagram(station, lang, AT_PAGE);
        const where = `${station.id} ${lang}`;
        for (const c of layout.callouts) {
          for (const [a, b] of segs(c.leader)) {
            for (const p of layout.controls) {
              if (c.ids.includes(p.control.id)) continue;
              expect(
                segmentHitsBox(a, b, glyphBox(p), 1),
                `${where}: ${c.key} through ${p.control.id}`,
              ).toBe(false);
            }
            for (const other of layout.callouts) {
              if (other === c) continue;
              expect(
                segmentHitsBox(a, b, other.box),
                `${where}: ${c.key} through tag ${other.key}`,
              ).toBe(false);
              for (const [d, e] of segs(other.leader)) {
                expect(segmentsIntersect(a, b, d, e), `${where}: ${c.key} × ${other.key}`).toBe(
                  false,
                );
              }
            }
          }
        }
      }
    }
  });

  it("reports no layout problems for any station in either language", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const layout = layoutDiagram(station, lang, AT_PAGE);
        expect(
          layoutProblems(layout.callouts, layout.controls, layout.panel),
          `${station.id} ${lang}`,
        ).toEqual([]);
      }
    }
  });

  it("puts the outer columns' callouts in the side gutters the station's variant keeps (§F12.3)", () => {
    for (const lang of LANGS) {
      for (const station of STATIONS_FILE.stations) {
        const sides = PREFERRED[`${station.id}:${lang}`]?.sides ?? "sides";
        const leftGutter = sides === "sides" || sides === "left";
        const rightGutter = sides === "sides" || sides === "right";
        const { callouts } = layoutDiagram(station, lang, AT_PAGE);
        for (const c of callouts.filter((x) => x.ids.length === 1)) {
          const control = station.controls.find((k) => k.id === c.ids[0]);
          if (!control) continue;
          const where = `${station.id} ${lang} ${c.key}`;
          if (control.col === 0) {
            if (leftGutter) expect(c.side, where).toBe("left");
            else expect(["top", "bottom"], where).toContain(c.side);
          } else if (control.col + control.span === station.grid.cols) {
            if (rightGutter) expect(c.side, where).toBe("right");
            else expect(["top", "bottom"], where).toContain(c.side);
          }
        }
      }
    }
  });

  it("group names drop the number word (and pluralize in English)", () => {
    expect(groupName(["एक नंबर बटन", "दो नंबर बटन"], "hi")).toBe("बटन");
    expect(groupName(["switch one", "switch two"], "en")).toBe("switches");
    expect(groupName(["lever one", "lever four"], "en")).toBe("levers");
  });

  it("draws rings, ? badges and an orange underline on the circled control's callout", () => {
    const { container } = render(
      <PanelDrawing
        station="overhead"
        lang="en"
        circled={["OH_BTN_1"]}
        question={["OH_MASTER_LAMP"]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="circled"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="question"]')).toHaveLength(1);
    const underlined = Array.from(container.querySelectorAll('[data-testid="callout"]')).filter(
      (c) => c.querySelector('[data-testid="callout-underline"]'),
    );
    expect(underlined.map((c) => c.getAttribute("data-name"))).toEqual(["buttons"]);
  });
});
