// §F22 e2e 4 — the Phase 3 lifeline: a partner line in the last 3 is decodable; clicking it
// sends `lifeline {utterance_id}`, the translation opens in the viewer's own script, the dots go
// 3 → 2 → 1 → 0; with none left a click is refused (toast, nothing sent). Both pairings.
//   fake server:  npm run e2e -- lifeline.spec.ts
//   real server:  E2E_SERVER=real npm run e2e -- lifeline.spec.ts
import type { Frame } from "@playwright/test";
import type { Lang } from "../src/net/protocol";
import {
  devKey,
  enableSound,
  openSplit,
  say,
  skipCinematic,
  skipToPlaying,
  subtitleText,
  type Split,
} from "./kit/split";
import { expect, expectCleanWire, roomCode, test } from "./kit/test";

const DEVANAGARI = /[ऀ-ॿ]/;
const LINES: Record<Lang, string[]> = {
  hi: ["Teen number button dabao", "Laal lever kheencho", "Ek number button dabao", "Haan, neela"],
  en: ["Press button three", "Pull the red lever", "Press button one", "Yes, blue"],
};
const NO_LIFELINES: Record<Lang, string> = { en: "No lifelines left", hi: "कोई लाइफ़लाइन नहीं बची" };

const filledDots = (frame: Frame) =>
  frame.locator('[data-testid="lifeline-dot"][data-filled="true"]').count();

/** Go to Phase 3 (dev `goto_phase 3`) and skip its intro until lifelines are on. */
async function toPhase3(split: Split): Promise<void> {
  await skipToPlaying(split);
  await devKey(split.tower, "Digit3");
  await expect
    .poll(
      async () => {
        if (await split.flyer.getByTestId("lifelines").isVisible()) return true;
        await skipCinematic(split.flyer, 1000);
        return false;
      },
      { timeout: 60_000, intervals: [200], message: "Phase 3 with lifelines on" },
    )
    .toBe(true);
  await expect(split.tower.getByTestId("lifelines")).toBeVisible();
}

for (const swapLanguages of [false, true]) {
  const pairing = swapLanguages ? "Flyer hi / Tower en" : "Flyer en / Tower hi";

  test(`phase 3 lifelines: decode, count down, refuse at 0 (${pairing})`, async ({
    page,
    server,
  }) => {
    const code = roomCode();
    const split = await openSplit(page, code, { swapLanguages });
    await enableSound(split.flyer);
    await enableSound(split.tower);
    await toPhase3(split);
    const flyerLang = split.langs.flyer;
    const towerLang = split.langs.tower;
    expect(await filledDots(split.flyer)).toBe(3);

    for (let i = 0; i < 3; i++) {
      await say(split.tower, LINES[towerLang][i] ?? "");
      const line = split.flyer.getByTestId("subtitle-line").last();
      await expect(line).toContainText(LINES[towerLang][i]?.split(" ")[0] ?? "", {
        ignoreCase: true,
      });
      const heard = server.wire.received(code, "utterance", "flyer");
      const id: unknown = Reflect.get(Object(heard.at(-1)), "id");

      // Subtitles are Latin only, in both pairings (§A2 rule 3).
      expect(await subtitleText(line)).not.toMatch(DEVANAGARI);
      await expect(line).toHaveAttribute("data-decodable", "true");
      await line.getByTestId("decode").click();
      // The translation opens in the Flyer's own language and script (§A2 rule 3).
      const tr = line.getByTestId("translation");
      await expect(tr).toBeVisible({ timeout: 5000 });
      const text = (await tr.textContent()) ?? "";
      expect(DEVANAGARI.test(text)).toBe(flyerLang === "hi");
      await expect.poll(() => filledDots(split.flyer)).toBe(2 - i);
      expect(server.wire.sent(code, "lifeline", "flyer").at(-1)).toEqual({
        type: "lifeline",
        utterance_id: id,
      });
    }

    // None left: the line is still clickable, but the click is refused locally (§F13).
    await say(split.tower, LINES[towerLang][3] ?? "");
    const last = split.flyer.getByTestId("subtitle-line").last();
    await expect(last).toContainText(LINES[towerLang][3]?.split(/[ ,]/)[0] ?? "", {
      ignoreCase: true,
    });
    const decode = last.getByTestId("decode");
    if (await decode.isVisible()) await decode.click();
    await expect(split.flyer.getByTestId("toasts")).toContainText(NO_LIFELINES[flyerLang]);
    await expect(last.getByTestId("translation")).toHaveCount(0);
    expect(server.wire.sent(code, "lifeline", "flyer")).toHaveLength(3);

    // A line already decoded stays readable at 0 lifelines (§B14.2: a repeat is free; the
    // client's "show" link is local and sends nothing). The server side of that rule is checked
    // in tests/e2eCheckers.test.ts against the fake and is part of the contract for the real one.
    const show = split.flyer.getByTestId("lifeline-show").first();
    await expect(show).toBeVisible({ timeout: 15_000 });
    await show.click();
    await expect(split.flyer.getByTestId("translation").first()).toBeVisible();
    expect(server.wire.sent(code, "lifeline", "flyer")).toHaveLength(3);
    expect(await filledDots(split.flyer)).toBe(0);

    // The Tower has its own three: it decodes a Flyer line into its own script.
    await say(split.flyer, LINES[flyerLang][0] ?? "");
    const towerLine = split.tower.getByTestId("subtitle-line").last();
    expect(await subtitleText(towerLine)).not.toMatch(DEVANAGARI);
    await expect(towerLine).toHaveAttribute("data-decodable", "true");
    await towerLine.getByTestId("decode").click();
    const towerTr = towerLine.getByTestId("translation");
    await expect(towerTr).toBeVisible({ timeout: 5000 });
    expect(DEVANAGARI.test((await towerTr.textContent()) ?? "")).toBe(towerLang === "hi");
    await expect.poll(() => filledDots(split.tower)).toBe(2);
    expect(await filledDots(split.flyer)).toBe(0);
    expectCleanWire(server, code);
  });
}
