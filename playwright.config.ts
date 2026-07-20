import { defineConfig, devices } from "@playwright/test";

/** Deterministic HomeAddSection seasonal fixture (ATB-621-E1). No live hosts/clock/random. */
const ATB_E2E_HOME_SEASONAL_ARTWORK =
  "https://e2e-sentinel.invalid/atb-621/home-add-001.jpg";
const ATB_E2E_HOME_SEASONAL_PROXY =
  "/api/image-proxy?url=" + encodeURIComponent(ATB_E2E_HOME_SEASONAL_ARTWORK);
const ATB_E2E_HOME_SEASONAL_PROVIDER_LOGO =
  "https://e2e-sentinel.invalid/atb-621/home-add-logo-001.png";

const ATB_E2E_HOME_SEASONAL_FIXTURE = [
  {
    id: "anilist-e2e-home-add-621",
    source: "anilist",
    title: "ATB-621 HomeAdd フィクスチャ",
    titles: {
      native: "ATB-621 HomeAdd フィクスチャ",
      userPreferred: "ATB-621 HomeAdd フィクスチャ",
      romaji: "ATB-621 HomeAdd Fixture",
    },
    imageUrl: ATB_E2E_HOME_SEASONAL_ARTWORK,
    proxiedImageUrl: ATB_E2E_HOME_SEASONAL_PROXY,
    siteUrl: "https://anilist.co/anime/e2e-home-add-621",
    streamingProvidersJp: {
      flatrate: [
        {
          id: 621001,
          name: "E2E Provider",
          logoUrl: ATB_E2E_HOME_SEASONAL_PROVIDER_LOGO,
        },
      ],
    },
  },
];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        storageState: "tests/.auth/user.json",
      },
    },
  ],
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  webServer: {
    command: "npm run dev:local",
    url: "http://localhost:3000",
    // ATB-621 requires this server's deterministic Home fixture; a reused dev server
    // does not receive webServer.env and would invalidate the negative proof.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      AUTH_URL: "http://localhost:3000",
      ATB_E2E_HOME_SEASONAL_FIXTURE_JSON: JSON.stringify(ATB_E2E_HOME_SEASONAL_FIXTURE),
    },
  },
});
