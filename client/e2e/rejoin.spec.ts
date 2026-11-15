// §F22 e2e 3 plus the §A5 handshake and swap roles: the join form handshake (welcome → 5 pings
// → join with gender), a taken role, refreshing the Flyer mid-phase (rejoin with the role-keyed
// token, same action active), and swap roles at the deck re-keying the token.
//   fake server:  npm run e2e -- rejoin.spec.ts
//   real server:  E2E_SERVER=real npm run e2e -- rejoin.spec.ts
import type { Frame } from "@playwright/test";
import type { Role } from "../src/net/protocol";
import {
  devKey,
  enableSound,
  flyerCurrentPip,
  openSplit,
  refreshFrames,
  screenOf,
  skipCinematic,
  towerStep,
  type Split,
} from "./kit/split";
import { expect, expectCleanWire, roomCode, test } from "./kit/test";

const tokenIn = (frame: Frame, code: string, role: Role) =>
  frame.evaluate(`sessionStorage.getItem(${JSON.stringify(`wingin:token:${code}:${role}`)})`);

function joinedToken(frames: unknown[]): string | null {
  const last = frames[frames.length - 1];
  const token: unknown =
    typeof last === "object" && last !== null ? Reflect.get(last, "token") : null;
  return typeof token === "string" ? token : null;
}

const autoUrl = (code: string, role: Role, lang: "en" | "hi", name: string) =>
  `/r/${code}?${new URLSearchParams({ role, lang, name, gender: role === "tower" ? "male" : "female", auto: "1" }).toString()}`;

test("handshake: the join form sends 5 pings then join with gender; a taken role is refused", async ({
  page,
  context,
  server,
}) => {
  const code = roomCode("HS");
  // The Tower joins by URL (auto=1) in its own tab.
  const towerTab = await context.newPage();
  await towerTab.goto(autoUrl(code, "tower", "hi", "Tara"));
  await expect(towerTab.locator('main[data-screen="lobby"]')).toBeVisible();

  // The Flyer joins through character select (§F8.2).
  await page.goto(`/r/${code}`);
  await expect(page.locator('main[data-screen="character-select"]')).toBeVisible();
  // room_state (spectator view) already disabled the Tower's role card.
  await expect(page.getByTestId("role-tower")).toBeDisabled();
  await expect(page.getByTestId("join")).toBeDisabled();
  await page.getByTestId("role-flyer").click();
  await page.getByTestId("gender-female").click();
  await page.getByTestId("lang-en").click();
  await page.getByTestId("name").fill("Farah");
  await page.getByTestId("join").click();
  await expect(page.locator('main[data-screen="lobby"]')).toBeVisible();

  // What each tab sent to join (§A7 `join`: name, role, lang, gender; no token the first time).
  const join = server.wire.sent(code, "join", "flyer");
  expect(join).toEqual([
    { type: "join", name: "Farah", role: "flyer", lang: "en", gender: "female" },
  ]);
  const tJoin = server.wire.sent(code, "join", "tower");
  expect(tJoin[0]).toMatchObject({ role: "tower", lang: "hi", gender: "male", name: "Tara" });
  // On the Flyer's socket: welcome first, then ≥ 5 pings, then join, then joined (§A5).
  const frames = server.wire.frames(code);
  const joinFrame = frames.find((f) => f.dir === "c2s" && f.type === "join" && f.role === "flyer");
  expect(joinFrame).toBeDefined();
  const socket = frames.filter((f) => f.conn === joinFrame?.conn);
  expect(socket[0]?.type).toBe("welcome");
  const sentBeforeJoin = socket.filter((f) => f.dir === "c2s").map((f) => f.type);
  expect(sentBeforeJoin.slice(0, 5)).toEqual(["ping", "ping", "ping", "ping", "ping"]);
  expect(sentBeforeJoin[5]).toBe("join");
  const afterJoin = socket.slice(socket.findIndex((f) => f === joinFrame));
  expect(afterJoin.find((f) => f.dir === "s2c" && f.type !== "pong")?.type).toBe("joined");

  // The token is stored under the role (§A5: split-view iframes share sessionStorage).
  const token = joinedToken(server.wire.received(code, "joined", "flyer"));
  expect(token).not.toBeNull();
  expect(await tokenIn(page.mainFrame(), code, "flyer")).toBe(token);
  expect(await tokenIn(page.mainFrame(), code, "tower")).toBeNull();

  // Both character cards in both lobbies, in each viewer's own language.
  for (const tab of [page, towerTab]) {
    await expect(tab.getByTestId("player-flyer")).toContainText("Farah");
    await expect(tab.getByTestId("player-tower")).toContainText("Tara");
  }
  await expect(page.getByTestId("player-flyer")).toContainText("Flyer");
  await expect(towerTab.getByTestId("player-flyer")).toContainText("फ़्लायर");

  // A third tab can't take a held role.
  const late = await context.newPage();
  await late.goto(`/r/${code}`);
  await expect(late.getByTestId("role-flyer")).toBeDisabled();
  await expect(late.getByTestId("role-tower")).toBeDisabled();
  expectCleanWire(server, code);
});

test("refreshing the Flyer mid-phase rejoins with its token and the same action is active", async ({
  page,
  server,
}) => {
  const code = roomCode("RJ");
  const split = await openSplit(page, code);
  await enableSound(split.flyer);
  await skipToAction(split);

  const stepBefore = await towerStep(split);
  const pipBefore = await flyerCurrentPip(split);
  expect(pipBefore).toBeGreaterThanOrEqual(0);
  const firstToken = joinedToken(server.wire.received(code, "joined", "flyer"));
  expect(firstToken).not.toBeNull();

  await split.flyer.evaluate("location.reload()");
  refreshFrames(split);
  await expect(split.flyer.locator('main[data-screen="flyer"]')).toBeVisible({ timeout: 20_000 });

  // The rejoin `join` carries the stored token (§A5), and the snapshot restores the same action.
  await expect.poll(() => server.wire.sent(code, "join", "flyer").length).toBe(2);
  expect(server.wire.sent(code, "join", "flyer")[1]?.token).toBe(firstToken);
  await expect.poll(() => flyerCurrentPip(split), { timeout: 15_000 }).toBe(pipBefore);
  expect(await towerStep(split)).toBe(stepBefore);
  // The snapshot is Flyer-only material: a flyer_view, never a manual card.
  expect(server.wire.received(code, "flyer_view", "flyer").length).toBeGreaterThan(1);
  // The Tower is not left on the paused overlay.
  await expect(split.tower.getByText(/Waiting up to|इंतज़ार|Reconnecting|दोबारा जुड़/)).toHaveCount(0, {
    timeout: 10_000,
  });
  expectCleanWire(server, code);
});

test("swap roles at the deck re-keys the token, and a refresh rejoins in the new role", async ({
  page,
  context,
  server,
}) => {
  test.setTimeout(4 * 60_000);
  const code = roomCode("SW");
  // Two real tabs (each has its own sessionStorage), not split iframes.
  const towerTab = page;
  const flyerTab = await context.newPage();
  await towerTab.goto(autoUrl(code, "tower", "hi", "Tara"));
  await flyerTab.goto(autoUrl(code, "flyer", "en", "Farah"));
  const split: Split = {
    page: towerTab,
    code,
    tower: towerTab.mainFrame(),
    flyer: flyerTab.mainFrame(),
    langs: { tower: "hi", flyer: "en" },
  };
  await driveToDeck(split);

  await towerTab.getByTestId("deck-swap-roles").click();
  await flyerTab.getByTestId("deck-swap-roles").click();
  await expect(towerTab.locator('main[data-screen="lobby"]')).toBeVisible({ timeout: 15_000 });
  await expect(flyerTab.locator('main[data-screen="lobby"]')).toBeVisible();
  expect(server.wire.sent(code, "swap_roles")).toHaveLength(2);

  // Roles swapped, languages kept: Tara (Hindi) is now the Flyer.
  await expect(towerTab.getByTestId("player-flyer")).toContainText("Tara");
  await expect(towerTab.getByTestId("player-tower")).toContainText("Farah");
  // Tara's tab now holds only a Flyer token (re-keyed on the new `joined`).
  await expect.poll(() => tokenIn(towerTab.mainFrame(), code, "flyer")).not.toBeNull();
  expect(await tokenIn(towerTab.mainFrame(), code, "tower")).toBeNull();

  // A refresh without URL params rejoins from the stored token in the new role (§F5.1).
  await towerTab.goto(`/r/${code}`);
  await expect(towerTab.locator('main[data-screen="lobby"]')).toBeVisible();
  const rejoin = server.wire.sent(code, "join", "flyer").at(-1);
  expect(rejoin).toMatchObject({ role: "flyer", lang: "hi", name: "Tara" });
  expect(rejoin?.token).toBe(await tokenIn(towerTab.mainFrame(), code, "flyer"));
  expectCleanWire(server, code);
});

/** Skip cinematics until the first action is open on both screens. */
async function skipToAction(split: Split): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await towerStep(split)) !== null && (await flyerCurrentPip(split)) >= 0) return true;
        await skipCinematic(split.flyer, 1000);
        return false;
      },
      { timeout: 60_000, intervals: [200] },
    )
    .toBe(true);
}

/** Dev route to the deck: goto phase 3, then skip cinematics and complete actions (N). */
async function driveToDeck(split: Split): Promise<void> {
  await expect(split.tower.locator("main[data-screen]")).toHaveAttribute(
    "data-screen",
    /tower|lobby/,
  );
  await expect.poll(() => screenOf(split.tower), { timeout: 30_000 }).toBe("tower");
  await devKey(split.tower, "Digit3");
  const deadline = Date.now() + 3 * 60_000;
  while (Date.now() < deadline) {
    if ((await screenOf(split.tower)) === "deck" && (await screenOf(split.flyer)) === "deck")
      return;
    if (await skipCinematic(split.flyer, 800)) continue;
    if ((await towerStep(split)) !== null) {
      await devKey(split.tower, "KeyN");
      await split.page.waitForTimeout(400);
    }
  }
  throw new Error("never reached the deck");
}
