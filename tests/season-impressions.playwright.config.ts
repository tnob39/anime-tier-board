import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// No global auth setup: the default suite signs synthetic JWTs and may access remote Turso.
// This suite exercises real Next routes as a guest, without an OAuth/session substitute.
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
      AUTH_URL: "http://localhost:3179",
      AUTH_SECRET: "local-guest-router-tests-no-authentication-issued",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      TURSO_DATABASE_URL: "file::memory:",
      TURSO_AUTH_TOKEN: "local-only"
    }
  }
});
