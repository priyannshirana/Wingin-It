// Free look and interact mode (§F10.3), visual set + the real pointer-lock flow. Headed Chrome
// (the "visual" project), 1440 × 900, on /dev/scene?look=1. PNGs land in e2e/__screenshots__/ for
// review: both side-window looks, the lean past the pedestal, and each settle framing.
// Regenerate: `npm run e2e -- freelook.visual.spec.ts`.
import { expect, test, type Page } from "@playwright/test";

const OUT = "e2e/__screenshots__";
const MIN_FPS = 45;
const MAX_CALLS = 250;

interface Hooks {
  ready: Promise<void>;
  stats: () => { fps: number; calls: number; triangles: number };
  look: (yaw: number, pitch: number) => Promise<void>;
  freeze: () => Promise<{ station: string | null }>;
}

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/dev/scene?${query}&look=1&fps=1`);
  await page.waitForFunction(() => "__wingin" in window, undefined, { timeout: 20_000 });
  await page.evaluate(() => (window as unknown as { __wingin: Hooks }).__wingin.ready);
  return errors;
}

async function look(page: Page, yaw: number, pitch: number): Promise<void> {
  await page.evaluate(([y, p]) => (window as unknown as { __wingin: Hooks }).__wingin.look(y, p), [
    yaw,
    pitch,
  ] as const);
}

async function check(page: Page, name: string, errors: string[]): Promise<void> {
  await page.waitForTimeout(1500); // lean damping, particles and the fps window settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const stats = await page.evaluate(() =>
    (window as unknown as { __wingin: Hooks }).__wingin.stats(),
  );
  expect(stats.fps, `${name} fps`).toBeGreaterThanOrEqual(MIN_FPS);
  expect(stats.calls, `${name} draw calls`).toBeLessThan(MAX_CALLS);
  expect(errors, `${name} console errors`).toEqual([]);
}

const LOOKS = [
  // out of each side window at the wing and the fire (the side lean kicks in past 60°)
  { name: "fl-01-look-left-window", query: "world=p2_start&fire_side=left", yaw: 88, pitch: -8 },
  { name: "fl-02-look-right-window", query: "world=p2_start&fire_side=right", yaw: -78, pitch: -8 },
  // leaning forward over the pedestal (phase 2 levers) and past it to the front panel's levers
  { name: "fl-03-lean-pedestal", query: "world=p2_start&fire_side=right", yaw: 30, pitch: -48 },
  { name: "fl-04-lean-front-levers", query: "world=p3_start&fire_side=right", yaw: 14, pitch: -34 },
  // the head limits: full turn up to the overhead
  { name: "fl-05-look-up-overhead", query: "world=p1_start", yaw: 35, pitch: 60 },
] as const;

for (const f of LOOKS) {
  test(f.name, async ({ page }) => {
    const errors = await open(page, f.query);
    await look(page, f.yaw, f.pitch);
    await check(page, f.name, errors);
  });
}

const SETTLES = [
  {
    name: "fl-06-settle-overhead",
    query: "world=p1_start",
    yaw: 25,
    pitch: 30,
    station: "overhead",
  },
  {
    name: "fl-07-settle-pedestal",
    query: "world=p2_start&fire_side=right",
    yaw: 20,
    pitch: -35,
    station: "pedestal",
  },
  {
    name: "fl-08-settle-front",
    query: "world=p3_start&fire_side=right",
    yaw: 5,
    pitch: -18,
    station: "front",
  },
] as const;

for (const f of SETTLES) {
  test(f.name, async ({ page }) => {
    const errors = await open(page, f.query);
    await look(page, f.yaw, f.pitch);
    await page.waitForTimeout(400);
    const result = await page.evaluate(() =>
      (window as unknown as { __wingin: Hooks }).__wingin.freeze(),
    );
    expect(result.station).toBe(f.station);
    await expect(page.getByTestId("free-look-hint")).toHaveAttribute("data-mode", "interact");
    await check(page, f.name, errors);
  });
}

// The real browser flow: a click locks the pointer (look), the next click freezes (interact),
// and a click on empty space locks again.
test("fl-09-pointer-lock-flow", async ({ page }) => {
  const errors = await open(page, "world=p2_start&fire_side=right");
  const hint = page.getByTestId("free-look-hint");
  await expect(hint).toHaveAttribute("data-mode", "enter");
  // Pointer lock needs a focused window (the headed browser may open behind other windows).
  await page.bringToFront();
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 720, y: 120 } });
  await expect(hint).toHaveAttribute("data-mode", "look");
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe("CANVAS");
  await page.mouse.move(900, 450);
  await canvas.click({ position: { x: 720, y: 450 } });
  await expect(hint).toHaveAttribute("data-mode", "interact");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.waitForTimeout(1300); // Chrome refuses a re-lock right after an unlock
  // the sky through the windshield top-right: no control there
  await canvas.click({ position: { x: 1400, y: 40 } });
  await expect(hint).toHaveAttribute("data-mode", "look");
  expect(errors).toEqual([]);
});

// /dev/split runs each screen in a same-origin iframe (allow="microphone; autoplay", no sandbox):
// pointer lock must work there too.
test("fl-10-pointer-lock-in-iframe", async ({ page }) => {
  await page.goto("/dev/scene?world=lobby");
  await page.evaluate(() => {
    document.body.innerHTML =
      '<iframe id="flyer" src="/dev/scene?world=p2_start&look=1" allow="microphone; autoplay" ' +
      'style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>';
  });
  const frame = page.frameLocator("#flyer");
  const hint = frame.getByTestId("free-look-hint");
  await expect(hint).toHaveAttribute("data-mode", "enter", { timeout: 20_000 });
  await page.bringToFront();
  await frame.locator("canvas").click({ position: { x: 720, y: 120 } });
  await expect(hint).toHaveAttribute("data-mode", "look");
});
