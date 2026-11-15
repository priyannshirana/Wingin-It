// M4 audio UI against a fake in-browser server (no backend needed) and Chromium's fake mic:
// the lobby mic check (ask → listening → "Mic works!", denied), the PTT indicator states on
// both screens (idle / transmitting / busy) with real worklet frames, Settings and the sound
// chip. PNGs land in e2e/__screenshots__/audio/ for review.
import { expect, test, type Page } from "@playwright/test";
import { fakeServer, roomUrl } from "./fakeServer";

const SHOTS = "e2e/__screenshots__/audio";

// The fake-UI flag accepts the permission prompt, so the real "Allow microphone" flow runs.
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** React-DevTools / Vite noise that isn't ours. */
const ours = (errors: string[]) =>
  errors.filter((e) => !/Download the React DevTools|\[vite\]/.test(e));

const tower = {
  me: { role: "tower", lang: "hi", gender: "female", name: "Asha" },
  partner: { lang: "en", gender: "male", name: "Sam" },
} as const;

const flyer = {
  me: { role: "flyer", lang: "en", gender: "male", name: "Sam" },
  partner: { lang: "hi", gender: "female", name: "Asha" },
} as const;

/**
 * A fake getUserMedia that "speaks": a 220 Hz tone with a 4 Hz syllable wobble, loud enough to
 * hold the meter above 0.15 (Chromium's own fake device only emits short quiet beeps).
 */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = new AudioContext();
      const tone = c.createOscillator();
      tone.frequency.value = 220;
      const amp = c.createGain();
      amp.gain.value = 0.6;
      const lfo = c.createOscillator();
      lfo.frequency.value = 4;
      const depth = c.createGain();
      depth.gain.value = 0.25;
      lfo.connect(depth).connect(amp.gain);
      const dest = c.createMediaStreamDestination();
      tone.connect(amp).connect(dest);
      tone.start();
      lfo.start();
      await c.resume();
      return dest.stream;
    };
  });
}

test("lobby mic check: allow → 12-bar meter → Mic works!", async ({ page }) => {
  const errors = watchConsole(page);
  await fakeVoice(page);
  await fakeServer(page, tower);
  await page.goto(roomUrl(tower));
  const check = page.getByTestId("mic-check");
  await expect(check).toHaveAttribute("data-state", "ask");
  await expect(page.getByTestId("sound-chip")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/lobby-ask.png` });
  await check.screenshot({ path: `${SHOTS}/mic-ask.png` });

  await page.getByTestId("mic-allow").click();
  await expect(check).toHaveAttribute("data-state", /listening|ok/);
  await expect(page.getByTestId("sound-chip")).toBeHidden(); // the click unlocked the context
  await check.screenshot({ path: `${SHOTS}/mic-listening.png` });
  await expect(check).toHaveAttribute("data-state", "ok", { timeout: 8000 });
  await check.screenshot({ path: `${SHOTS}/mic-ok.png` });
  await page.screenshot({ path: `${SHOTS}/lobby-mic-ok.png` });
  expect(ours(errors)).toEqual([]);
});

test("lobby mic check: denied shows the fix-it text", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await fakeServer(page, flyer);
  await page.goto(roomUrl(flyer));
  const check = page.getByTestId("mic-check");
  await page.getByTestId("mic-allow").click();
  await expect(check).toHaveAttribute("data-state", "denied");
  await expect(check).toContainText("Microphone blocked");
  await check.screenshot({ path: `${SHOTS}/mic-denied.png` });
  await page.screenshot({ path: `${SHOTS}/lobby-mic-denied.png` });
});

/** Both language pairings are first-class (§A2 rule 9); expected strings written out by hand. */
const PAIRINGS = [
  {
    id: "flyer-en_tower-hi",
    flyer: { lang: "en", gender: "male", name: "Sam" },
    tower: { lang: "hi", gender: "female", name: "Asha" },
    towerSees: { transmitting: "बोल रही हो…", busy: "फ़्लायर बोल रहा है" },
    flyerSees: { transmitting: "Transmitting…", busy: "Tower is talking" },
  },
  {
    id: "flyer-hi_tower-en",
    flyer: { lang: "hi", gender: "female", name: "Priya" },
    tower: { lang: "en", gender: "male", name: "Tom" },
    towerSees: { transmitting: "Transmitting…", busy: "Flyer is talking" },
    flyerSees: { transmitting: "बोल रही हो…", busy: "टावर बोल रहा है" },
  },
] as const;

for (const p of PAIRINGS) {
  const asTower = { me: { role: "tower", ...p.tower }, partner: p.flyer } as const;
  const asFlyer = { me: { role: "flyer", ...p.flyer }, partner: p.tower } as const;

  test(`[${p.id}] Tower: PTT idle → transmitting (real 3,200-byte frames) → busy`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    const server = await fakeServer(page, asTower);
    await page.goto(roomUrl(asTower));
    await page.getByTestId("mic-allow").click();
    await expect(page.getByTestId("mic-check")).toHaveAttribute("data-state", /listening|ok/);
    server.status("PLAYING", { signal_level: 2, phase: 2, action_id: "P2_B1" });
    const ptt = page.getByTestId("ptt");
    await expect(ptt).toHaveAttribute("data-state", "idle");
    await page.screenshot({ path: `${SHOTS}/${p.id}-tower-idle.png` });
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-tower-idle.png` });
    await page.getByTestId("settings").screenshot({ path: `${SHOTS}/${p.id}-settings.png` });

    await page.keyboard.down("Space");
    await expect(ptt).toHaveAttribute("data-state", "transmitting");
    await expect(ptt).toContainText(p.towerSees.transmitting);
    await page.waitForTimeout(700);
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-tower-transmitting.png` });
    await page.screenshot({ path: `${SHOTS}/${p.id}-tower-transmitting.png` });
    await page.keyboard.up("Space");
    await expect(ptt).toHaveAttribute("data-state", "idle");
    // 2 pre-roll chunks + ~0.7 s of streaming, every frame exactly 100 ms of 16 kHz Int16.
    expect(server.binary.length).toBeGreaterThanOrEqual(6);
    expect(new Set(server.binary)).toEqual(new Set([3200]));

    // A quick re-press after the release is a new transmission with its own ptt_end.
    await page.keyboard.down("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("Space");
    await expect
      .poll(() =>
        server.received.map((m) => m.type).filter((t) => t === "ptt_start" || t === "ptt_end"),
      )
      .toEqual(["ptt_start", "ptt_end", "ptt_start", "ptt_end"]);

    server.send({ type: "channel", busy_by: "flyer" });
    await expect(ptt).toHaveAttribute("data-state", "busy");
    await expect(ptt).toContainText(p.towerSees.busy);
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-tower-busy.png` });
    await page.screenshot({ path: `${SHOTS}/${p.id}-tower-busy.png` });
    await page.keyboard.down("Space"); // ignored while the partner talks
    await page.keyboard.up("Space");
    expect(server.received.filter((m) => m.type === "ptt_start")).toHaveLength(2);

    await page.getByTestId("mute").click();
    await page.getByTestId("settings").screenshot({ path: `${SHOTS}/${p.id}-settings-muted.png` });
    expect(ours(errors)).toEqual([]);
  });

  test(`[${p.id}] Flyer: PTT hold button → transmitting → busy with the Tower's portrait`, async ({
    page,
  }) => {
    test.slow(); // the cockpit renders on software WebGL in headless Chromium: slow frames
    const server = await fakeServer(page, asFlyer);
    await page.goto(roomUrl(asFlyer));
    await page.getByTestId("mic-allow").click();
    await expect(page.getByTestId("mic-check")).toHaveAttribute("data-state", /listening|ok/);
    server.status("PLAYING");
    const ptt = page.getByTestId("ptt");
    await expect(ptt).toHaveAttribute("data-state", "idle", { timeout: 15_000 });
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-flyer-idle.png` });
    await page.getByTestId("ptt-button").hover();
    await page.mouse.down();
    await expect(ptt).toHaveAttribute("data-state", "transmitting");
    await expect(ptt).toContainText(p.flyerSees.transmitting);
    await page.waitForTimeout(500);
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-flyer-transmitting.png` });
    await page.mouse.up();
    await expect(ptt).toHaveAttribute("data-state", "idle");
    server.send({ type: "channel", busy_by: "tower" });
    await expect(ptt).toContainText(p.flyerSees.busy);
    await ptt.screenshot({ path: `${SHOTS}/${p.id}-ptt-flyer-busy.png` });
    await page.screenshot({ path: `${SHOTS}/${p.id}-flyer-busy.png` });
  });
}
