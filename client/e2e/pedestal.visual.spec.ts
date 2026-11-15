import { test, type Page } from "@playwright/test";

const OUT = "e2e/__screenshots__";

interface Hooks {
  ready: Promise<void>;
  stats: () => { fps: number; calls: number };
  look: (yaw: number, pitch: number) => Promise<void>;
  freeze: () => Promise<{ station: string | null }>;
}
type W = { __wingin: Hooks };

async function open(page: Page, q: string): Promise<void> {
  await page.goto(`/dev/scene?${q}&fps=1`);
  await page.waitForFunction(() => "__wingin" in window, undefined, { timeout: 20_000 });
  await page.evaluate(() => (window as unknown as W).__wingin.ready);
}

async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const st = await page.evaluate(() => (window as unknown as W).__wingin.stats());
  test.info().annotations.push({ type: "stats", description: `${name} ${JSON.stringify(st)}` });
}

// Regenerates the pedestal-placement frames: the whole front-panel bottom row must be visible.
const SHOTS = [
  { name: "pedestal-front-p3", q: "world=p3_start&fire_side=right&shot=FRONT" },
  { name: "pedestal-shot-p1", q: "world=p1_start&shot=PEDESTAL" },
  { name: "pedestal-shot-p3", q: "world=p3_start&fire_side=right&shot=PEDESTAL" },
  { name: "pedestal-wide-interior", q: "world=p3_start&fire_side=right&shot=WIDE_INTERIOR" },
];
for (const s of SHOTS) {
  test(s.name, async ({ page }) => {
    await open(page, s.q);
    await page.waitForTimeout(1500);
    await snap(page, s.name);
  });
}

const SETTLES = [
  { name: "pedestal-settle-front", q: "world=p3_start&fire_side=right", yaw: 5, pitch: -18 },
  { name: "pedestal-settle-pedestal", q: "world=p2_start&fire_side=right", yaw: 20, pitch: -35 },
];
for (const s of SETTLES) {
  test(s.name, async ({ page }) => {
    await open(page, `${s.q}&look=1`);
    await page.evaluate(([y, p]) => (window as unknown as W).__wingin.look(y, p), [
      s.yaw,
      s.pitch,
    ] as const);
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as W).__wingin.freeze());
    await page.waitForTimeout(1800);
    await snap(page, s.name);
  });
}
