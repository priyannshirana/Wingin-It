// §F12.3 open-book fit test: the real TowerScreen (test harness fed from typed Part A fixtures),
// in a real browser with the real fonts, at 1440 × 900 and 1280 × 720, both languages, the
// representative steps (incl. the front panel's small-lamp observe steps and the longest notes),
// plus the wrong-action slip and the success stamps. Every page element's box must be inside its
// page, the pages equal, the tabs inside the reserved width, no tag text outside its pill, no
// clipped truncation, no shrink-to-fit at its floor, the right page's blocks apart, diagram digits
// ≥ 14 px, tags ≥ 14 px (1440) / ≥ 12 px (1280, accepted), and the brackets inside the panel.
// Screenshots land in e2e/__screenshots__/.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const LANGS = ["hi", "en"];
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];
const TOL = 1; // px
/** Every card gets the plain page and the notes / quick-say variant; a few get slip and stamps. */
const CARDS = ["P1_A1", "P1_A7", "P2_B2", "P3_C2", "P3_C3", "P3_C6", "LONGEST"];
const BASE_VARIANTS = [
  { name: "", query: "" },
  { name: "notes", query: "&last_wrong=1&quick=1" },
];
const RESULT_VARIANTS = [
  { name: "slip", query: "&used=1" },
  { name: "stamp0", query: "&stamp=0" },
  { name: "stampLast", query: "&stamp=last" },
];
const RESULT_CARDS = new Set(["P1_A1", "P1_A7", "P3_C2"]);

interface Report {
  pagesEqual: number;
  outside: string[];
  scroll: string[];
  tabs: string | null;
  spread: string | null;
  tagOverflow: string[];
  minDigitPx: number;
  minTagPx: number;
  brackets: string[];
  preferred: string | null;
  shrink: string[];
  minNotesPx: number;
  truncated: string[];
  overlaps: string[];
  drawnDiagramShare: number;
  gridShare: number;
  slip: string | null;
  stamp: string | null;
}

async function measure(page: Page): Promise<Report> {
  return page.evaluate((tol) => {
    const q = (sel: string, root: ParentNode = document) => root.querySelector(sel);
    const box = (el: Element) => el.getBoundingClientRect();
    const inside = (a: DOMRect, b: DOMRect) =>
      a.left >= b.left - tol &&
      a.top >= b.top - tol &&
      a.right <= b.right + tol &&
      a.bottom <= b.bottom + tol;
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - tol &&
      b.left < a.right - tol &&
      a.top < b.bottom - tol &&
      b.top < a.bottom - tol;
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}:${(el.textContent ?? "").trim().slice(0, 24)}`;

    const left = q('[data-testid="page-left"]');
    const right = q('[data-testid="page-right"]');
    const card = q('[data-testid="manual-card"]');
    const spread = q('[data-testid="manual-spread"]');
    if (!left || !right || !card || !spread) throw new Error("manual not rendered");
    const bookScale = Number(
      /scale\(([\d.]+)\)/.exec((spread as HTMLElement).style.transform)?.[1] ?? 1,
    );
    const outside: string[] = [];
    const scroll: string[] = [];
    for (const pg of [left, right]) {
      const pb = box(pg);
      for (const el of Array.from(pg.querySelectorAll("*"))) {
        if (el.closest('[data-testid="phase-tabs"]')) continue; // they stick out by design
        const b = box(el);
        if (b.width === 0 && b.height === 0) continue;
        if (!inside(b, pb)) outside.push(`${pg.getAttribute("data-testid")}: ${name(el)}`);
      }
      // Vertical only: the right page's phase tabs stick out of its outer edge on purpose (the
      // element-box check above covers every other horizontal overflow).
      const h = pg as HTMLElement;
      if (h.scrollHeight > h.clientHeight + 1) scroll.push(pg.getAttribute("data-testid") ?? "?");
    }
    const tabsEl = q('[data-testid="phase-tabs"]');
    const cb = box(card);
    const tabs =
      tabsEl && !inside(box(tabsEl), cb) ? "phase tabs outside the manual's width" : null;
    const spreadOut = !inside(box(spread), cb) ? "spread outside its column" : null;

    const tagOverflow: string[] = [];
    let minTagPx = Infinity;
    for (const g of Array.from(left.querySelectorAll('[data-testid="callout"]'))) {
      const pill = q('[data-testid="callout-pill"]', g);
      const text = q('[data-testid="callout-text"]', g);
      if (!(pill instanceof SVGGraphicsElement) || !(text instanceof SVGTextElement)) continue;
      const pb = pill.getBBox();
      const tb = text.getBBox();
      if (tb.x < pb.x - 0.5 || tb.x + tb.width > pb.x + pb.width + 0.5) {
        tagOverflow.push(
          `${g.getAttribute("data-name")} (${tb.width.toFixed(1)} > ${pb.width.toFixed(1)})`,
        );
      }
      const ctm = text.getScreenCTM();
      if (ctm)
        minTagPx = Math.min(
          minTagPx,
          Number(text.getAttribute("font-size")) * Math.hypot(ctm.a, ctm.b),
        );
    }
    let minDigitPx = Infinity;
    for (const t of Array.from(left.querySelectorAll('[data-testid="glyph-label"]'))) {
      if (!(t instanceof SVGGraphicsElement)) continue;
      const ctm = t.getScreenCTM();
      if (ctm)
        minDigitPx = Math.min(
          minDigitPx,
          Number(t.getAttribute("data-size")) * Math.hypot(ctm.a, ctm.b),
        );
    }
    const brackets: string[] = [];
    const frame = q('[data-testid="panel-frame"]', left);
    if (frame) {
      const fb = box(frame);
      const inner = new DOMRect(fb.x + 3, fb.y + 3, fb.width - 6, fb.height - 6);
      for (const b of Array.from(left.querySelectorAll('[data-testid="bracket"]'))) {
        if (!inside(box(b), inner)) brackets.push(`bracket at y=${box(b).top.toFixed(1)}`);
      }
    }

    // ShrinkToFit boxes must fit above their floor; the notes stay readable (≥ 12 px).
    const shrink: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-shrink="1"]'))) {
      const k = Number(el.getAttribute("data-k"));
      const min = Number(el.getAttribute("data-min"));
      if (!(k > min + 0.004)) shrink.push(`${name(el)} at its floor (k=${k})`);
    }
    let minNotesPx = Infinity;
    const notes = q('[data-testid="notes"]', right);
    const k = Number(notes?.getAttribute("data-k") ?? 1);
    for (const el of Array.from(notes?.querySelectorAll("p, div") ?? [])) {
      if (!(el.textContent ?? "").trim()) continue;
      minNotesPx = Math.min(minNotesPx, parseFloat(getComputedStyle(el).fontSize) * k * bookScale);
    }
    const truncated: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll('[data-testid="manual-card"] .truncate'),
    )) {
      const h = el as HTMLElement;
      if (h.scrollWidth > h.clientWidth + 1) truncated.push(name(el));
    }
    // The right page's blocks stack without overlapping.
    const overlaps: string[] = [];
    const blocks = [
      ["instruction", q('[data-testid="find-out"]', right)],
      ["grid", q('[data-testid="rule-table"]', right)],
      ["notes", notes?.firstElementChild ?? null],
      ["dots", q('[data-testid="progress-dots"]', right)],
    ] as const;
    blocks.forEach(([an, a], i) => {
      for (const [bn, b] of blocks.slice(i + 1)) {
        if (a && b && overlap(box(a), box(b))) overlaps.push(`${an} × ${bn}`);
      }
    });
    // Proportions: the drawn diagram (viewBox meet) and the grid, as shares of the page height.
    const svg = q('[data-testid="panel-drawing"]', left);
    let drawnDiagramShare = 0;
    if (svg) {
      const vb = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(" ").map(Number);
      const sb = box(svg);
      const vw = vb[2] ?? 1;
      const vh = vb[3] ?? 1;
      drawnDiagramShare = (Math.min(sb.width / vw, sb.height / vh) * vh) / box(left).height;
    }
    const grid = q('[data-testid="rule-table"]', right);
    const gridShare = grid ? box(grid).height / box(right).height : 0;
    // The slip lies over the grid; a stamp sits in its column.
    const slipEl = q('[data-testid="wrong-slip"] > div', right);
    const slip = slipEl && grid && !inside(box(slipEl), box(grid)) ? "slip outside the grid" : null;
    const stampEl = q('[data-testid="row-stamp"]', right);
    const column = stampEl?.closest('[data-testid="rule-row"]');
    const stamp =
      stampEl && column && !inside(box(stampEl), box(column)) ? "stamp outside its column" : null;
    return {
      pagesEqual: Math.abs(box(left).width - box(right).width),
      outside,
      scroll,
      tabs,
      spread: spreadOut,
      tagOverflow,
      minDigitPx,
      minTagPx,
      brackets,
      preferred: svg?.getAttribute("data-preferred") ?? null,
      shrink,
      minNotesPx,
      truncated,
      overlaps,
      drawnDiagramShare,
      gridShare,
      slip,
      stamp,
    };
  }, TOL);
}

const results: Record<string, Report> = {};

for (const size of SIZES) {
  for (const lang of LANGS) {
    for (const card of CARDS) {
      const variants = [...BASE_VARIANTS, ...(RESULT_CARDS.has(card) ? RESULT_VARIANTS : [])];
      for (const v of variants) {
        const label = `${card} ${lang} ${size.width}x${size.height}${v.name ? ` +${v.name}` : ""}`;
        test(`manual fits: ${label}`, async ({ page }) => {
          const logs: string[] = [];
          page.on("console", (m) => {
            if (m.type() === "error" || m.type() === "warning") logs.push(m.text());
          });
          page.on("pageerror", (e) => logs.push(e.message));
          await page.setViewportSize(size);
          await page.goto(`/tests/harness/manual.html?card=${card}&lang=${lang}${v.query}`);
          await page.getByTestId("manual-card").waitFor();
          await page.evaluate(() => document.fonts.ready);
          // fonts load → tags re-measured and re-laid out; let the layout settle
          await page.waitForTimeout(600);
          if (v.name === "slip") await expect(page.getByTestId("wrong-slip")).toBeVisible();
          if (v.name.startsWith("stamp")) await expect(page.getByTestId("row-stamp")).toBeVisible();
          await page.screenshot({
            path: `e2e/__screenshots__/manual-${card}-${lang}-${size.width}${v.name ? `-${v.name}` : ""}.png`,
          });
          const r = await measure(page);
          results[label] = r;
          expect(r.pagesEqual, "pages equal").toBeLessThanOrEqual(0.5);
          expect(r.outside, "elements outside their page").toEqual([]);
          expect(r.scroll, "pages scroll").toEqual([]);
          expect(r.tabs).toBeNull();
          expect(r.spread).toBeNull();
          expect(r.tagOverflow, "tag text outside its pill").toEqual([]);
          expect(r.minDigitPx, "digit / arrow size").toBeGreaterThanOrEqual(14);
          expect(r.brackets, "brackets inside the panel").toEqual([]);
          expect(r.preferred, "the unit-tested layout (PREFERRED) is the one shown").toBe("1");
          expect(r.minTagPx, "callout size").toBeGreaterThanOrEqual(
            size.width === 1440 ? 13.9 : 12,
          );
          expect(r.shrink, "shrink-to-fit at its floor").toEqual([]);
          expect(r.minNotesPx, "notes readable").toBeGreaterThanOrEqual(12);
          expect(r.truncated, "truncated text clipped").toEqual([]);
          expect(r.overlaps, "right-page blocks overlap").toEqual([]);
          expect(r.drawnDiagramShare, "drawn diagram share of the page").toBeGreaterThanOrEqual(
            0.6,
          );
          expect(r.gridShare, "grid share of the page").toBeGreaterThanOrEqual(0.45);
          expect(r.slip).toBeNull();
          expect(r.stamp).toBeNull();
          expect(logs, "console errors / warnings").toEqual([]);
        });
      }
    }
  }
}

test.afterAll(() => {
  if (Object.keys(results).length === 0) return;
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/manual-fit-report.json", JSON.stringify(results, null, 2));
});

/** Freeze every running animation at `ms` (Web Animations and CSS transitions alike). */
async function freezeAt(page: Page, ms: number) {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);
}
async function resume(page: Page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.play();
  });
}

// Motion: the page turn (§F12.3 item 8), the cover closing / opening (§F14.4 cues) and the green
// dots. Mid frames are frozen deterministically; each motion must settle in the right state.
test.describe("manual motion", () => {
  const shot = (page: Page, name: string) =>
    page.screenshot({ path: `e2e/__screenshots__/manual-motion-${name}.png` });

  test("page turn: the right page flips over the gutter onto the left", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/tests/harness/manual.html?card=P1_A1&lang=en&turn=P2_B2`);
    await page.getByTestId("page-turn").waitFor();
    await freezeAt(page, 130); // a third into the 0.4 s turn (≈ −50°)
    await shot(page, "turn-mid");
    await resume(page);
    await page.getByTestId("page-turn").waitFor({ state: "detached" });
    await expect(page.getByTestId("page-left").getByTestId("module-title")).toHaveText(
      "Cut the fuel",
    );
    await shot(page, "turn-done");
    expect(errors).toEqual([]);
  });

  test("manual_close: the book closes onto its cover", async ({ page }) => {
    await page.goto(`/tests/harness/manual.html?card=P1_A1&lang=hi&cue=manual_close`);
    await page.getByTestId("cover-leaf").waitFor();
    await freezeAt(page, 100); // a third into the 0.3 s flip (≈ −130°)
    await shot(page, "close-mid");
    await resume(page);
    await page.waitForTimeout(800);
    await shot(page, "close-done");
    await expect(page.getByTestId("page-left")).toBeHidden();
  });

  test("manual_open: the cover swings open onto two blank pages", async ({ page }) => {
    await page.goto(`/tests/harness/manual.html?lang=en&cover=1&cue=manual_open`);
    await page.getByTestId("manual-cover").waitFor();
    await shot(page, "cover-closed");
    // the cue lands → the leaf's target pose flips at once; slide 0.3 s, then flip 0.3 s
    await expect(page.getByTestId("cover-leaf")).toHaveAttribute("data-angle", "-180");
    await freezeAt(page, 400); // slid into place (0.3 s), a third into the flip
    await shot(page, "open-mid");
    await resume(page);
    await page.waitForTimeout(800);
    await expect(page.getByTestId("cover-leaf")).toHaveCSS(
      "transform",
      "matrix3d(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)",
    );
    await shot(page, "open-done");
  });

  test("dots_green: the progress dots turn green one by one", async ({ page }) => {
    await page.goto(`/tests/harness/manual.html?card=P1_A7&lang=hi&cue=dots_green`);
    await expect(page.getByTestId("progress-dots")).toHaveAttribute("data-green", "1");
    await page.waitForTimeout(1400);
    await shot(page, "dots-green");
  });
});
