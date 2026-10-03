import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3780;
const ORIGIN = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: ".",
  testMatch: "season-context.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: ORIGIN,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "off",
    serviceWorkers: "block"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] }
      }
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
        storageState: { cookies: [], origins: [] }
      }
    }
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname localhost --port 3780",
    cwd: PROJECT_ROOT,
    url: `${ORIGIN}/api/auth/session`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_URL: ORIGIN,
      AUTH_SECRET: "season-context-e2e-dummy-secret-at-least-32-chars",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `--require=${path.resolve(__dirname, "impressions-offline.cjs")}`,
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      TURSO_DATABASE_URL: "file::memory:",
      TURSO_AUTH_TOKEN: "local-only"
    }
  }
});
