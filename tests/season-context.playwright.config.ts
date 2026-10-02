import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3780;
const ORIGIN = `http://127.0.0.1:${PORT}`;
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
    }
  ],
  webServer: {
    command: "npx.cmd --no-install next dev -p 3780 -H 127.0.0.1",
    cwd: PROJECT_ROOT,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_URL: ORIGIN,
      AUTH_SECRET: "season-context-e2e-dummy-secret-at-least-32-chars"
    }
  }
});
