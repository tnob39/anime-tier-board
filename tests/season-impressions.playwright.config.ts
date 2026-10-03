import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// No global auth setup. Owner tests use a local JWT and file DB; OAuth and external services stay offline.
export default defineConfig({
  testDir: ".",
  testMatch: "season-impressions.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "../test-results/impressions-router",
  use: { baseURL: "http://localhost:3179", storageState: { cookies: [], origins: [] }, serviceWorkers: "block", locale: "ja-JP", timezoneId: "Asia/Tokyo" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } }
  ],
  webServer: {
    cwd: path.resolve(__dirname, ".."),
    command: "node node_modules/next/dist/bin/next dev --hostname localhost --port 3179",
    url: "http://localhost:3179/api/auth/session",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `--require=${path.resolve(__dirname, "impressions-offline.cjs")}`,
      AUTH_URL: "http://localhost:3179",
      AUTH_SECRET: "local-guest-router-tests-no-authentication-issued",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      TURSO_DATABASE_URL: "file:./test-results/impressions-router.sqlite",
      TURSO_AUTH_TOKEN: "local-only"
    }
  }
});
