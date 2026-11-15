import { defineConfig, devices } from "@playwright/test";

// Two server modes for the flow specs (client/INTEGRATION.md):
// - default: no backend. e2e/fakeServer/ answers /ws and /api inside the browser
//   (Playwright routeWebSocket) with Part A messages.
// - E2E_SERVER=real: nothing is routed; the Vite proxy forwards /ws, /api and /clips to the real
//   server at VITE_PROXY_TARGET (default http://localhost:8000), which must run with
//   DEV_MODE=1 MOCK_SPEECH=1. The global setup fails fast when it is not reachable.
const PORT = Number(process.env.E2E_PORT ?? 5176);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const viewport = { width: 1440, height: 900 };
// Headless Chromium falls back to SwiftShader, which can't keep up with two cockpits at once (the
// split view's Flyer iframe stalls in the prologue). Ask for the real GPU instead.
const GPU_ARGS = ["--enable-gpu", "--ignore-gpu-blocklist"].concat(
  process.platform === "darwin" ? ["--use-angle=metal"] : [],
);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 7 * 60_000, // the bots game must reach the deck within 6 minutes
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/fakeServer/globalSetup.ts",
  use: { baseURL: BASE_URL, viewport, trace: "retain-on-failure" },
  projects: [
    {
      name: "flows",
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport, launchOptions: { args: GPU_ARGS } },
    },
    {
      name: "visual",
      testMatch: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport, channel: "chrome", headless: false },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: true,
        env: {
          VITE_DEV_MODE: "1",
          VITE_PROXY_TARGET: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        },
      },
});
