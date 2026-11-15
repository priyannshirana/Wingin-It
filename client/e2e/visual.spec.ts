// Visual acceptance set (§F0.6, §F22 #5), scene-sandbox part (M3a: world, characters, shots).
// Headed Chrome (the "visual" project), 1440 × 900. Each test opens /dev/scene, awaits
// __wingin.ready, sets the frame and saves a PNG to e2e/__screenshots__/ for human or agent
// review. No pixel diffs (WebGL output differs across GPUs); asserts no console errors and a
// sane frame rate. Regenerate: `npm run e2e -- visual.spec.ts`.
import { expect, test, type Page } from "@playwright/test";

const OUT = "e2e/__screenshots__";

/** The subset of window.__wingin (src/dev/debugHooks.ts) the suite uses. */
interface Hooks {
  ready: Promise<void>;
  setWorld: (preset: string, opts?: { fire_side?: "left" | "right" }) => Promise<void>;
  setShot: (shot: string) => Promise<void>;
  stats: () => { fps: number; calls: number; triangles: number };
}

interface Frame {
  name: string;
  /** The draw-call budget (§F21) does not hold for this frame; the reason is documented below. */
  overBudget?: string;
  /** /dev/scene query (world, fire_side, lamps, gender). */
  query: string;
  shot: string;
}

/**
 * Known exception: WIDE_INTERIOR is the one shot that sees every station, both characters and
 * both windows at once, so it can exceed 250 draw calls; it is only used briefly in the prologue
 * and the landing, where fps (still asserted) is what matters.
 */
const WIDE = "WIDE_INTERIOR sees all stations, both characters and both windows";

const MIN_FPS = 45;
const MAX_CALLS = 250;

/** Errors that only mean "no backend is running" (the character-select frames have none). */
const NO_BACKEND = /WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource|\/api\//;

const FRAMES: Frame[] = [
  // 1. each station shot in its own phase lighting
  { name: "02-pedestal-fire", query: "world=p2_start&fire_side=right", shot: "PEDESTAL" },
  { name: "03-front-storm-rain", query: "world=p3_start&fire_side=right", shot: "FRONT" },
  // 2. both window shots with the wing fire at full / half / wisp
  ...(["right", "left"] as const).flatMap((side) =>
    (
      [
        ["full", "p2_start"],
        ["half", "p2_half"],
        ["wisp", "p2_extinguished"],
      ] as const
    ).map(([level, preset]) => ({
      name: `04-${side}-window-${level}`,
      query: `world=${preset}&fire_side=${side}`,
      shot: side === "right" ? "RIGHT_WINDOW" : "LEFT_WINDOW",
    })),
  ),
  // 3. exterior shots (dawn for the low front one)
  { name: "05-ext-side-fire", query: "world=p2_start&fire_side=right", shot: "EXT_SIDE" },
  { name: "06-ext-chase-night", query: "world=p1_calm", shot: "EXT_CHASE" },
  { name: "07-ext-chase-storm", query: "world=p3_start&fire_side=left", shot: "EXT_CHASE" },
  { name: "08-ext-front-low-dawn", query: "world=landed&fire_side=right", shot: "EXT_FRONT_LOW" },
  // 7. WIDE_INTERIOR in the prologue (lobby world) and the landing with each Flyer character
  ...(["female", "male"] as const).flatMap((gender) => [
    {
      name: `09-wide-prologue-${gender}`,
      query: `world=lobby&gender=${gender}`,
      shot: "WIDE_INTERIOR",
      overBudget: WIDE,
    },
    {
      name: `10-wide-landed-${gender}`,
      query: `world=landed&gender=${gender}`,
      shot: "WIDE_INTERIOR",
      overBudget: WIDE,
    },
  ]),
  // In-between worlds the cinematics land on
  { name: "11-front-runway-far", query: "world=p3_runway&fire_side=right", shot: "FRONT" },
  { name: "12-default-dawn-runway", query: "world=landed&fire_side=right", shot: "FLYER_DEFAULT" },
  { name: "13-pilot-slumped", query: "world=p1_calm", shot: "PILOT" },
];

async function hooks(page: Page): Promise<void> {
  await page.waitForFunction(() => "__wingin" in window, undefined, { timeout: 20_000 });
  await page.evaluate(() => (window as unknown as { __wingin: Hooks }).__wingin.ready);
}

for (const frame of FRAMES) {
  test(frame.name, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/dev/scene?${frame.query}&shot=${frame.shot}&fps=1`);
    await hooks(page);
    await page.evaluate(
      (shot) => (window as unknown as { __wingin: Hooks }).__wingin.setShot(shot),
      frame.shot,
    );
    // Let particles, clouds and the fps window settle.
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/${frame.name}.png` });
    const stats = await page.evaluate(() =>
      (window as unknown as { __wingin: Hooks }).__wingin.stats(),
    );
    expect(stats.fps, `${frame.name} fps`).toBeGreaterThanOrEqual(MIN_FPS);
    if (!frame.overBudget) expect(stats.calls, `${frame.name} draw calls`).toBeLessThan(MAX_CALLS);
    expect(errors, `${frame.name} console errors`).toEqual([]);
  });
}

/** Waits until the local (= sandbox server) clock is `from`..`to` ms into its second. */
async function atPhase(page: Page, from: number, to: number): Promise<void> {
  await page.waitForFunction(
    ([a, b]) => {
      const ms = Date.now() % 1000;
      return ms >= a && ms <= b;
    },
    [from, to] as const,
    { polling: 5, timeout: 5_000 },
  );
}

// Frame 01: the master lamp blinks red with `attention` set, captured in both blink phases (lit
// when serverNow() % 1000 < 500). No ring, glow or marker may appear in either (§A6).
test("01-overhead-night-alarm-master-red (both blink phases, no attention ring)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "/dev/scene?world=p1_start&lamps=OH_MASTER_LAMP:red:blink:ring&shot=OVERHEAD&fps=1",
  );
  await hooks(page);
  await page.waitForTimeout(2200);
  await atPhase(page, 20, 80);
  await page.screenshot({ path: `${OUT}/01-overhead-night-alarm-master-red-on.png` });
  await atPhase(page, 520, 580);
  await page.screenshot({ path: `${OUT}/01-overhead-night-alarm-master-red-off.png` });
  const stats = await page.evaluate(() =>
    (window as unknown as { __wingin: Hooks }).__wingin.stats(),
  );
  expect(stats.fps).toBeGreaterThanOrEqual(MIN_FPS);
  expect(stats.calls).toBeLessThan(MAX_CALLS);
  expect(errors).toEqual([]);
});

/** Hides the "Reconnecting…" overlay: the character-select frames run without a backend. */
async function hideOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("div.fixed.inset-0").forEach((el) => {
      el.style.display = "none";
    });
  });
}

const CHARACTERS = [
  { role: "flyer", gender: "female", name: "Asha" },
  { role: "flyer", gender: "male", name: "Ravi" },
  { role: "tower", gender: "female", name: "Meera" },
  { role: "tower", gender: "male", name: "Arjun" },
] as const;

for (const c of CHARACTERS) {
  test(`15-character-select-${c.role}-${c.gender}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !NO_BACKEND.test(m.text())) errors.push(m.text());
    });
    await page.goto(`/r/TEST?role=${c.role}&gender=${c.gender}&lang=en&name=${c.name}`);
    await expect(page.getByTestId(`gender-${c.gender}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`[data-preview="${c.role}"]`)).toBeVisible();
    await page.waitForTimeout(c.role === "flyer" ? 2500 : 600); // turntable mount / card flip
    await hideOverlays(page);
    await page.screenshot({ path: `${OUT}/15-character-select-${c.role}-${c.gender}.png` });
    expect(errors).toEqual([]);
  });
}

// The portraits must read at their smallest uses (HUD / radio chips, 28 px) and the lobby (96 px).
test("16-portraits-small-sizes", async ({ page }) => {
  const svgs: string[] = [];
  for (const role of ["flyer", "tower"] as const) {
    await page.goto(`/r/TEST?role=${role}&lang=en&name=Test`);
    const portraits = page.locator(`[data-testid^="gender-"] [data-portrait^="${role}-"]`);
    await expect(portraits).toHaveCount(2);
    svgs.push(...(await portraits.evaluateAll((els) => els.map((e) => e.outerHTML))));
  }
  await page.evaluate((list) => {
    const board = document.createElement("div");
    board.id = "portrait-board";
    board.style.cssText =
      "position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;gap:32px;" +
      "align-items:flex-start;justify-content:center;padding:48px;background:#141B3D";
    for (const size of [28, 96]) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:24px;align-items:center";
      for (const html of list) {
        const cell = document.createElement("div");
        cell.innerHTML = html;
        const svg = cell.querySelector("svg");
        svg?.setAttribute("width", String(size));
        svg?.setAttribute("height", String(size));
        row.append(cell);
      }
      board.append(row);
    }
    document.body.append(board);
  }, svgs);
  await page.locator("#portrait-board").screenshot({ path: `${OUT}/16-portraits-28-96.png` });
});

test("setWorld switches presets in place", async ({ page }) => {
  await page.goto("/dev/scene?world=p1_start&fps=1");
  await hooks(page);
  await page.evaluate(() =>
    (window as unknown as { __wingin: Hooks }).__wingin.setWorld("p2_start", { fire_side: "left" }),
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/14-setworld-p2-left-pedestal.png` });
  await expect(page.getByText("p2_start · PEDESTAL")).toBeVisible();
});
