import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const viewport = { width: 1440, height: 900 };

// §F22: flows run against `docker compose up` (MOCK_SPEECH=1 DEV_MODE=1). The visual suite runs
// in headed Google Chrome so WebGL uses the real GPU; its PNGs land in e2e/__screenshots__/.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 7 * 60_000, // the bots game must reach the deck within 6 minutes
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: BASE_URL, viewport, trace: "retain-on-failure" },
  projects: [
    {
      name: "flows",
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport },
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
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        env: { VITE_DEV_MODE: "1" },
      },
});
