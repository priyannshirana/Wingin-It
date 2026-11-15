// §F22 e2e 1 — `/dev/split?room=…&seed=42&bots=both`: the prologue plays, Phase 1 starts, and
// the game reaches the word deck within 6 minutes with the bots playing. A screenshot per phase
// title lands in e2e/__screenshots__/split-bots/ (for review, never diffed).
//   fake server:  npm run e2e -- split-bots.spec.ts
//   real server:  E2E_SERVER=real npm run e2e -- split-bots.spec.ts
import type { Frame } from "@playwright/test";
import { openSplit, screenOf } from "./kit/split";
import { expect, expectCleanWire, roomCode, test } from "./kit/test";

const SHOTS = "e2e/__screenshots__/split-bots";
const PHASE_TITLE = (n: number) => new RegExp(`(PHASE|चरण) ${n}`);

async function onDeck(frame: Frame): Promise<boolean> {
  return (await screenOf(frame)) === "deck";
}

test("bots play a whole game in split view, prologue to word deck", async ({ page, server }) => {
  test.setTimeout(7 * 60_000);
  const code = roomCode();
  const split = await openSplit(page, code, { seed: 42, bots: "both" });

  // Both auto-joined, readied, and the Tower sent the seed and the bots (§F4 `seed`, `bots`).
  await expect.poll(() => server.wire.sent(code, "ready").length).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => server.wire.sent(code, "dev", "tower").map((m) => m.cmd))
    .toEqual(expect.arrayContaining(["set_seed", "bots"]));
  expect(server.wire.sent(code, "dev", "tower")).toContainEqual({
    type: "dev",
    cmd: "set_seed",
    args: { seed: 42 },
  });
  // The Flyer iframe has neither param, so it sends neither command.
  expect(server.wire.sent(code, "dev", "flyer")).toHaveLength(0);

  // The prologue plays on both screens.
  await expect
    .poll(() => server.wire.received(code, "cinematic", "flyer").length)
    .toBeGreaterThan(0);
  expect(server.wire.received(code, "cinematic", "flyer")[0]).toMatchObject({ id: "prologue" });
  expect(server.wire.received(code, "cinematic", "tower")[0]).toMatchObject({ id: "prologue" });
  await expect(split.flyer.locator('main[data-screen="flyer"]')).toBeVisible();
  await expect(split.tower.locator('main[data-screen="tower"]')).toBeVisible();

  // Each phase: its title card (screenshot), then the bots finish it.
  for (const n of [1, 2, 3]) {
    await expect
      .poll(
        () =>
          server.wire
            .received(code, "cinematic", "tower")
            .some(
              (c) => typeof c === "object" && c !== null && Reflect.get(c, "id") === `p${n}_intro`,
            ),
        { timeout: 3 * 60_000, message: `p${n}_intro reached the Tower` },
      )
      .toBe(true);
    // The title card is up for the length of the intro (or until the bots' skip lands).
    await split.tower
      .getByTestId("title-card")
      .filter({ hasText: PHASE_TITLE(n) })
      .waitFor({ state: "visible", timeout: 2500 })
      .catch(() => undefined);
    await page.screenshot({ path: `${SHOTS}/phase-${n}.png` });
  }

  // The word deck on both screens, with the partner's count.
  await expect.poll(() => onDeck(split.tower), { timeout: 4 * 60_000 }).toBe(true);
  await expect.poll(() => onDeck(split.flyer), { timeout: 30_000 }).toBe(true);
  await expect(split.flyer.getByTestId("deck-count")).toBeVisible();
  await expect(split.tower.getByTestId("deck-count")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/deck.png` });

  // Bots played: the Flyer heard the Tower bot, nobody pressed a control by hand.
  expect(server.wire.received(code, "utterance", "flyer").length).toBeGreaterThan(0);
  expect(server.wire.sent(code, "interact")).toHaveLength(0);
  expectCleanWire(server, code);
});
