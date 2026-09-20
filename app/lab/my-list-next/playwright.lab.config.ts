import { defineConfig, devices } from "@playwright/test";

/**
 * Isolated lab runner: no Turso, OAuth, or production globalSetup.
 * Invoke with --config app/lab/my-list-next/playwright.lab.config.ts
 */
export default defineConfig({
  testDir: "../../../tests",
  testMatch: "lab-my-list-next.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "on-first-retry"
  },
  timeout: 60_000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run dev:local",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_SECRET: "atb-765-lab-fixture-secret"
    }
  }
});
