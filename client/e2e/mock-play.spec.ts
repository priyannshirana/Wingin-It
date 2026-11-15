// §F22 e2e 2 — manual mock play in two full-size tabs (one per role): the Tower clicks quick-say, the Flyer clicks the
// right control → the step ticks; a wrong control → buzzer (wrong result), fuel −10 and
// "Flyer used …" on the Tower. Both language pairings (§A2 rule 9).
//   fake server:  npm run e2e -- mock-play.spec.ts
//   real server:  E2E_SERVER=real npm run e2e -- mock-play.spec.ts
import type { StationId } from "../src/net/protocol";
import { STATIONS } from "./fakeServer/fixtures";
import { clickControl } from "./kit/cockpit";
import { enableSound, expectedStep, fuelShown, openTabs, skipToPlaying } from "./kit/split";
import { expect, expectCleanWire, REAL, roomCode, test } from "./kit/test";

const PREFIX: Record<string, StationId> = { OH: "overhead", PD: "pedestal", FP: "front" };

/** A push button on the same station that is not the expected control. */
function wrongControlFor(expected: string): string {
  const station = PREFIX[expected.slice(0, 2)];
  if (!station) throw new Error(`unknown station for ${expected}`);
  const pick = STATIONS[station].find((c) => c.type === "PushButton" && c.id !== expected);
  if (!pick) throw new Error(`no other button on ${station}`);
  return pick.id;
}

for (const swapLanguages of [false, true]) {
  const pairing = swapLanguages ? "Flyer hi / Tower en" : "Flyer en / Tower hi";

  test(`mock play: quick-say, a wrong control, then the right one (${pairing})`, async ({
    page,
    context,
    server,
  }) => {
    const code = roomCode("MP");
    const split = await openTabs(context, page, code, { swapLanguages });
    await enableSound(split.tower);
    await enableSound(split.flyer);
    await skipToPlaying(split);

    // Both screens speak the viewer's language, never the role's (§A2 rule 9).
    const FUEL = { en: "FUEL", hi: "ईंधन" };
    const STEP = { en: "Step 1", hi: "कदम 1" };
    await expect(split.tower.getByTestId("fuel")).toContainText(FUEL[split.langs.tower]);
    await expect(split.flyer.getByTestId("fuel")).toContainText(FUEL[split.langs.flyer]);
    await expect(split.tower.getByTestId("step-pill")).toContainText(STEP[split.langs.tower]);

    // Tower quick-say → `say_text` → the Flyer sees the line as a subtitle.
    await split.tower.getByTestId("quick-say").first().click();
    await expect(split.flyer.getByTestId("subtitle-line").last()).toBeVisible();
    expect(server.wire.sent(code, "say_text", "tower")).toHaveLength(1);

    const step = await expectedStep(split);
    const wrong = wrongControlFor(step.object);

    // A wrong control: the Tower gets the "Flyer used" slip and the fuel drops by 10.
    const fuelBefore = await fuelShown(split.tower);
    await clickControl(split.flyer, wrong);
    await expect(split.tower.getByTestId("wrong-slip")).toBeVisible({ timeout: 5000 });
    if (!REAL) await expect(split.tower.getByTestId("wrong-slip")).toContainText(wrong);
    await expect.poll(() => fuelShown(split.tower)).toBeLessThanOrEqual(fuelBefore - 10);
    expect(server.wire.sent(code, "interact", "flyer")).toContainEqual({
      type: "interact",
      object_id: wrong,
      verb: "press",
    });
    expect(server.wire.received(code, "action_result", "flyer")).toContainEqual(
      expect.objectContaining({ success: false, fuel_delta: -10 }),
    );

    // The right control: the step ticks on both screens.
    await clickControl(split.flyer, step.object, step.count);
    await expect(
      split.flyer.locator('[data-testid="progress-pips"] [data-state="done"]'),
    ).toHaveCount(1, { timeout: 8000 });
    await expect(split.tower.getByTestId("row-stamp").first()).toBeVisible();
    const sent = server.wire
      .sent(code, "interact", "flyer")
      .filter((m) => m.object_id === step.object);
    expect(sent).toHaveLength(step.count);
    expect(sent[0]?.verb).toBe(step.verb);

    // The Tower never sends Flyer intents.
    expect(server.wire.sent(code, "interact", "tower")).toHaveLength(0);
    expectCleanWire(server, code);
  });
}
