// Driving `/dev/split` (§F18.1) and single room tabs like a player would: through what the
// client renders. Dev commands go through the dev panel's hotkeys (§F18.4), so they behave the
// same against the fake and the real server.
import { expect, type BrowserContext, type Frame, type Locator, type Page } from "@playwright/test";
import type { Lang, Role } from "../../src/net/protocol";

export interface Split {
  page: Page;
  code: string;
  tower: Frame;
  flyer: Frame;
  langs: Record<Role, Lang>;
}

export interface SplitOptions {
  seed?: number;
  bots?: "" | "tower" | "flyer" | "both";
  /** Flyer Hindi, Tower English (the toolbar's "swap languages"). Default: Tower hi, Flyer en. */
  swapLanguages?: boolean;
}

const param = (f: Frame, key: string): string | null => {
  try {
    return new URL(f.url()).searchParams.get(key);
  } catch {
    return null; // a frame that hasn't navigated yet
  }
};

function frameFor(page: Page, role: Role): Frame {
  const f = page.frames().find((fr) => param(fr, "role") === role);
  if (!f) throw new Error(`no ${role} iframe`);
  return f;
}

/** Open the split view and wait until both sides have joined (lobby or later). */
export async function openSplit(page: Page, code: string, opts: SplitOptions = {}): Promise<Split> {
  const q = new URLSearchParams({
    room: code,
    seed: String(opts.seed ?? 42),
    bots: opts.bots ?? "",
  });
  await page.goto(`/dev/split?${q.toString()}`);
  if (opts.swapLanguages) {
    await page.getByRole("button", { name: "swap languages" }).click();
  }
  const langs: Record<Role, Lang> = opts.swapLanguages
    ? { tower: "en", flyer: "hi" }
    : { tower: "hi", flyer: "en" };
  await expect
    .poll(() =>
      page
        .frames()
        .map((f) => param(f, "lang") ?? "")
        .filter(Boolean)
        .sort()
        .join(","),
    )
    .toBe("en,hi");
  await expect.poll(() => page.frames().filter((f) => f.url().includes("auto=1")).length).toBe(2);
  const split: Split = {
    page,
    code,
    tower: frameFor(page, "tower"),
    flyer: frameFor(page, "flyer"),
    langs,
  };
  expect(param(split.tower, "lang")).toBe(langs.tower);
  return split;
}

/**
 * Two full-size tabs instead of the split view (each its own sessionStorage, like two laptops).
 * Used where the Flyer clicks controls: at the split view's half width the station shots crop
 * the outer controls (see INTEGRATION.md, known client issues).
 */
export async function openTabs(
  context: BrowserContext,
  towerPage: Page,
  code: string,
  opts: Pick<SplitOptions, "seed" | "swapLanguages"> = {},
): Promise<Split> {
  const langs: Record<Role, Lang> = opts.swapLanguages
    ? { tower: "en", flyer: "hi" }
    : { tower: "hi", flyer: "en" };
  const url = (role: Role, name: string, extra: Record<string, string> = {}) =>
    `/r/${code}?${new URLSearchParams({ role, lang: langs[role], name, auto: "1", ...extra }).toString()}`;
  await towerPage.goto(url("tower", "Tower", { seed: String(opts.seed ?? 42) }));
  const flyerPage = await context.newPage();
  await flyerPage.goto(url("flyer", "Flyer"));
  return {
    page: towerPage,
    code,
    tower: towerPage.mainFrame(),
    flyer: flyerPage.mainFrame(),
    langs,
  };
}

/** The iframe again after it navigated (reload keeps the element, Playwright may swap the Frame). */
export function refreshFrames(split: Split): void {
  split.tower = frameFor(split.page, "tower");
  split.flyer = frameFor(split.page, "flyer");
}

/** Status as the screen shows it: which top-level screen is mounted. */
export async function screenOf(frame: Frame): Promise<string | null> {
  return frame
    .locator("main[data-screen]")
    .first()
    .getAttribute("data-screen", { timeout: 1000 })
    .catch(() => null);
}

/**
 * Press a real key inside a frame, with nothing editable focused. Split-view iframes don't take
 * keyboard focus from `body.press`, so focus the frame's window first (a click would be a game
 * input on the Flyer).
 */
export async function key(frame: Frame, k: string): Promise<void> {
  await frame.evaluate(
    "(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.focus(); })()",
  );
  await frame.page().keyboard.press(k);
}

/** Open (or close) the backtick dev panel in a frame. */
export async function setDevPanel(frame: Frame, open: boolean): Promise<void> {
  const panel = frame.getByTestId("dev-panel");
  if ((await panel.isVisible()) !== open) await key(frame, "Backquote");
  await expect(panel).toBeVisible({ visible: open });
}

/** Send one dev command through its panel hotkey (N F 1 2 3, §F18.4). */
export async function devKey(
  frame: Frame,
  k: "KeyN" | "KeyF" | "Digit1" | "Digit2" | "Digit3",
): Promise<void> {
  await setDevPanel(frame, true);
  await key(frame, k);
  await setDevPanel(frame, false);
}

/**
 * Skip whatever cinematic is on screen: the Skip button shows while a skippable timeline plays;
 * K is the Dev Mode force skip (§F14.1). Returns false when nothing was skippable in time.
 */
export async function skipCinematic(frame: Frame, timeoutMs = 8000): Promise<boolean> {
  const skip = frame.getByRole("button", { name: /Skip|छोड़ो/ });
  try {
    await skip.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return false;
  }
  await key(frame, "KeyK");
  return true;
}

/** The step the Tower's open manual shows ("1/7" style pill), or null on the cover. */
export async function towerStep(split: Split): Promise<string | null> {
  const pill = split.tower.getByTestId("step-pill");
  if (!(await pill.isVisible().catch(() => false))) return null;
  return (await pill.textContent())?.trim() ?? null;
}

/** Skip cinematics until both screens are in PLAYING with an action open on the Tower. */
export async function skipToPlaying(split: Split, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await split.tower.getByTestId("step-pill").isVisible()) && (await flyerHasAction(split)))
      return;
    await skipCinematic(split.flyer, 1500);
  }
  throw new Error("never reached PLAYING with an active action");
}

async function flyerHasAction(split: Split): Promise<boolean> {
  return (
    (await split.flyer.locator('[data-testid="progress-pips"] [data-state="current"]').count()) > 0
  );
}

/** The current action index from the Flyer HUD's progress pips. */
export async function flyerCurrentPip(split: Split): Promise<number> {
  const states = await split.flyer
    .locator('[data-testid="progress-pips"] span')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  return states.indexOf("current");
}

/** Fuel seconds as the HUD / Tower shows them. */
export async function fuelShown(frame: Frame): Promise<number> {
  const text = (await frame.getByTestId("fuel").textContent()) ?? "";
  const m = /(\d+)/.exec(text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)));
  return m?.[1] ? Number(m[1]) : NaN;
}

export interface ExpectedStep {
  object: string;
  verb: string;
  count: number;
}

/**
 * Every step of the current action as the dev panel lists it (`dev_state.expected`, §A13), read
 * on the Tower so the panel never covers the Flyer's cockpit. `done` marks finished steps.
 */
export async function expectedSteps(split: Split): Promise<(ExpectedStep & { done: boolean })[]> {
  await setDevPanel(split.tower, true);
  const items = split.tower.locator('[data-testid="dev-live"] li[data-done]');
  await expect(items.first()).toBeVisible();
  const rows = await items.evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent ?? "", done: e.getAttribute("data-done") === "true" })),
  );
  await setDevPanel(split.tower, false);
  return rows.map(({ text, done }) => {
    const m = /[✓○]\s*(\S+)\s+(\S+)(?:.*×(\d+))?/.exec(text);
    if (!m?.[1] || !m[2]) throw new Error(`cannot read the expected step from "${text}"`);
    return { object: m[1], verb: m[2], count: m[3] ? Number(m[3]) : 1, done };
  });
}

/** The first step still to do (what the Flyer must click next). */
export async function expectedStep(split: Split): Promise<ExpectedStep> {
  const next = (await expectedSteps(split)).find((s) => !s.done);
  if (!next) throw new Error("the dev panel lists no open step");
  return { object: next.object, verb: next.verb, count: next.count };
}

/** The visible text of a subtitle row: the segments only, without the speaker tag or lifeline note. */
export async function subtitleText(line: Locator): Promise<string> {
  return line.evaluate((el) => {
    const copy = el.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return "";
    for (const sel of [
      '[data-testid="speaker-tag"]',
      '[data-testid="translation"]',
      '[data-testid="lifeline-show"]',
      '[data-testid="lifeline-decoding"]',
    ])
      copy.querySelectorAll(sel).forEach((n) => n.remove());
    return copy.textContent ?? "";
  });
}

/** Type a line into a screen's mock talk box (§F18.2) and send it. */
export async function say(frame: Frame, text: string): Promise<void> {
  const box = frame.getByTestId("mock-talk").getByRole("textbox");
  await box.fill(text);
  await box.press("Enter");
}

/** Click the "Click to enable sound" chip if it is up (§F20), so nothing hides behind it. */
export async function enableSound(frame: Frame): Promise<void> {
  const chip = frame.getByTestId("sound-chip");
  // A pointerdown anywhere unlocks the AudioContext and the chip unmounts mid-click; that's fine.
  if (await chip.isVisible().catch(() => false))
    await chip.click({ timeout: 3000, noWaitAfter: true }).catch(() => undefined);
}
