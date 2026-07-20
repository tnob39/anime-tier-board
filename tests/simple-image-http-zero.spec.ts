import { test, expect, type Page, type Request } from "@playwright/test";
import {
  E2E_SENTINEL_HOST,
  E2E_SENTINEL_MARKER,
} from "./global-setup";

const DISPLAY_MODE_KEY = "numanie-display-mode";
const FIXTURE_TITLES = [
  "テストアニメ U-NEXT",
  "テストアニメ Netflix",
  "テストアニメ Amazon",
] as const;

/** Unique HomeAddSection seasonal fixture title (playwright.config webServer.env). */
const HOME_ADD_FIXTURE_TITLE = "ATB-621 HomeAdd フィクスチャ";
const HOME_ADD_FIXTURE_SENTINEL_MARKERS = [
  "home-add-001",
  "home-add-logo-001",
  "anilist-e2e-home-add-621",
] as const;

/** 1x1 PNG — deterministic fulfill for Visual control sentinel responses */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function isSentinelOrProxyRequest(url: string): boolean {
  if (url.includes(E2E_SENTINEL_HOST) || url.includes(E2E_SENTINEL_MARKER)) {
    return true;
  }
  try {
    const parsed = new URL(url, "http://localhost:3000");
    return parsed.pathname === "/api/image-proxy" || parsed.pathname.endsWith("/api/image-proxy");
  } catch {
    return url.includes("/api/image-proxy");
  }
}

function isFixtureSentinelRequest(url: string): boolean {
  return url.includes(E2E_SENTINEL_HOST) || url.includes(E2E_SENTINEL_MARKER);
}

function isHomeAddFixtureSentinelRequest(url: string): boolean {
  if (!isFixtureSentinelRequest(url) && !url.includes("/api/image-proxy")) {
    return false;
  }
  return HOME_ADD_FIXTURE_SENTINEL_MARKERS.some((marker) => url.includes(marker));
}

function attachImageRequestMonitor(page: Page) {
  const tracked: string[] = [];
  const onRequest = (request: Request) => {
    const url = request.url();
    if (isSentinelOrProxyRequest(url)) {
      tracked.push(url);
    }
  };
  page.on("request", onRequest);
  return {
    tracked,
    fixtureCount: () => tracked.filter((u) => isFixtureSentinelRequest(u)).length,
    homeAddFixtureCount: () => tracked.filter((u) => isHomeAddFixtureSentinelRequest(u)).length,
    proxyCount: () =>
      tracked.filter((u) => {
        try {
          return new URL(u, "http://localhost:3000").pathname.includes("/api/image-proxy");
        } catch {
          return u.includes("/api/image-proxy");
        }
      }).length,
    allCount: () => tracked.length,
    dispose: () => page.off("request", onRequest),
  };
}

async function setDisplayModeBeforeNav(page: Page, mode: "simple" | "visual") {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    [DISPLAY_MODE_KEY, mode] as const
  );
}

async function fulfillSentinelImages(page: Page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isFixtureSentinelRequest(url) || url.includes("/api/image-proxy")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG,
      });
      return;
    }
    await route.continue();
  });
}

async function assertNoSharedPosterImageFrames(page: Page) {
  // Shared PosterCard / DiscoveryLane + StatusBottomSheet image frames
  await expect(page.locator(".wl2g-poster .anime-card-placeholder")).toHaveCount(0);
  await expect(page.locator(".wl2g-poster .pic")).toHaveCount(0);
  await expect(page.locator(".wl2g-discover-poster")).toHaveCount(0);
  await expect(page.locator(".sbs-thumb")).toHaveCount(0);
  await expect(page.locator(".sbs-thumb-fallback")).toHaveCount(0);
  const bgCount = await page.locator(".wl2g-poster").evaluateAll((nodes) =>
    nodes.filter((n) => {
      const pic = (n as HTMLElement).querySelector(".pic") as HTMLElement | null;
      if (!pic) return false;
      const bg = getComputedStyle(pic).backgroundImage;
      return Boolean(bg && bg !== "none");
    }).length
  );
  expect(bgCount).toBe(0);
}

async function assertHomeAddSectionImageFree(page: Page) {
  const section = page.locator("#home-add-section");
  await expect(section).toBeVisible();
  await expect(section.getByText(HOME_ADD_FIXTURE_TITLE).first()).toBeVisible();
  await expect(section.getByRole("button", { name: "見たい" }).first()).toBeVisible();
  await expect(section.getByRole("button", { name: "視聴中" }).first()).toBeVisible();
  await expect(section.locator(".home-add-card--simple").first()).toBeVisible();

  // Zero artwork img, provider-logo img, placeholder, poster wrapper, image-reserved DOM
  await expect(section.locator(".home-add-card-img")).toHaveCount(0);
  await expect(section.locator(".home-add-card-poster")).toHaveCount(0);
  await expect(section.locator(".home-add-card-placeholder")).toHaveCount(0);
  await expect(section.locator(".card-provider-badge")).toHaveCount(0);
  await expect(section.locator(".card-provider-badge img")).toHaveCount(0);
  await expect(section.locator("img")).toHaveCount(0);

  const reservedBg = await section.locator(".home-add-card").evaluateAll((nodes) =>
    nodes.filter((n) => {
      const el = n as HTMLElement;
      const selfBg = getComputedStyle(el).backgroundImage;
      if (selfBg && selfBg !== "none") return true;
      return Array.from(el.querySelectorAll("*")).some((child) => {
        const bg = getComputedStyle(child as HTMLElement).backgroundImage;
        return Boolean(bg && bg !== "none");
      });
    }).length
  );
  expect(reservedBg, "HomeAddSection must not reserve background-image frames").toBe(0);
}

test.describe("ATB-621 Simple image HTTP zero", () => {
  test("Simple: home, watchlist, status sheet make zero sentinel/image-proxy requests", async ({
    page,
  }) => {
    await setDisplayModeBeforeNav(page, "simple");
    // Focused E2E request monitoring must be installed before first navigation
    const monitor = attachImageRequestMonitor(page);

    // --- Home (includes hydration window + HomeAddSection) ---
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#home-add-section")).toBeVisible();
    // Watchlist-seeded poster title still present on Home
    await expect(page.getByText(FIXTURE_TITLES[0]).first()).toBeVisible();
    await expect(page.locator(".wl2g-poster--simple").first()).toBeVisible();
    await assertNoSharedPosterImageFrames(page);
    await assertHomeAddSectionImageFree(page);
    await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();

    const homeSentinel = monitor.fixtureCount();
    const homeAddSentinel = monitor.homeAddFixtureCount();
    const homeProxy = monitor.proxyCount();
    const homeProxyFixture = monitor.tracked.filter(
      (u) => u.includes("/api/image-proxy") && isFixtureSentinelRequest(u)
    ).length;
    expect(homeSentinel, `home sentinel requests: ${monitor.tracked.join("\n")}`).toBe(0);
    expect(homeAddSentinel, `home HomeAdd fixture sentinel: ${monitor.tracked.join("\n")}`).toBe(0);
    expect(homeProxy, `home image-proxy requests: ${monitor.tracked.join("\n")}`).toBe(0);
    expect(homeProxyFixture, `home fixture proxy requests: ${monitor.tracked.join("\n")}`).toBe(0);

    const afterHomeLen = monitor.tracked.length;

    // --- Watchlist ---
    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    for (const title of FIXTURE_TITLES) {
      await expect(page.getByText(title).first()).toBeVisible();
    }
    await assertNoSharedPosterImageFrames(page);
    await expect(page.getByRole("heading", { name: "マイリスト" })).toBeVisible();
    const openCard = page.getByRole("button", { name: `${FIXTURE_TITLES[0]}の詳細を開く` }).first();
    await expect(openCard).toBeVisible();
    await openCard.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: FIXTURE_TITLES[0] })).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const afterWatchlistOps = monitor.tracked.length;
    const watchlistNew = monitor.tracked.slice(afterHomeLen);
    const watchlistSentinel = watchlistNew.filter((u) => isFixtureSentinelRequest(u)).length;
    expect(
      watchlistSentinel,
      `watchlist sentinel requests: ${watchlistNew.join("\n")}`
    ).toBe(0);

    // --- Status Bottom Sheet from ⋯ menu ---
    const card = page.getByRole("button", { name: `${FIXTURE_TITLES[0]}の詳細を開く` }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "その他の操作" }).click();
    await page.getByRole("menuitem", { name: "ステータスを変更" }).click();
    const sheet = page.locator(".sbs-root");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: FIXTURE_TITLES[0] })).toBeVisible();
    await expect(sheet.locator(".sbs-thumb")).toHaveCount(0);
    await expect(sheet.locator(".sbs-thumb-fallback")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "視聴中" })).toBeVisible();
    await expect(sheet.getByLabel("視聴話数を増やす")).toBeVisible();
    await sheet.locator(".sbs-close-btn").click();
    await expect(sheet).toHaveCount(0);

    const sheetNew = monitor.tracked.slice(afterWatchlistOps);
    const sheetSentinel = sheetNew.filter((u) => isFixtureSentinelRequest(u)).length;
    expect(sheetSentinel, `bottom sheet sentinel requests: ${sheetNew.join("\n")}`).toBe(0);

    expect(
      monitor.fixtureCount(),
      `total fixture sentinel/proxy: ${monitor.tracked.join("\n")}`
    ).toBe(0);
    expect(monitor.proxyCount(), `total image-proxy: ${monitor.tracked.join("\n")}`).toBe(0);
    expect(
      monitor.homeAddFixtureCount(),
      `total HomeAdd fixture sentinel: ${monitor.tracked.join("\n")}`
    ).toBe(0);

    test.info().annotations.push(
      { type: "home_sentinel_request_count", description: String(homeSentinel) },
      { type: "home_add_sentinel_request_count", description: String(homeAddSentinel) },
      { type: "watchlist_sentinel_request_count", description: String(watchlistSentinel) },
      { type: "bottom_sheet_sentinel_request_count", description: String(sheetSentinel) }
    );
    // eslint-disable-next-line no-console
    console.log(
      `ATB-621 counts home=${homeSentinel} home_add=${homeAddSentinel} watchlist=${watchlistSentinel} bottom_sheet=${sheetSentinel}`
    );

    monitor.dispose();
  });

  test("Visual control: HomeAddSection fixture image DOM and sentinel requests", async ({
    page,
  }) => {
    await setDisplayModeBeforeNav(page, "visual");
    // Deterministic fulfill so sentinel + proxy still produce request events (no live host)
    await fulfillSentinelImages(page);

    const monitor = attachImageRequestMonitor(page);
    // Register before navigation: Visual may request the fixture during hydration.
    const fixtureImageRequest = page.waitForRequest((request) =>
      isHomeAddFixtureSentinelRequest(request.url())
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const section = page.locator("#home-add-section");
    await expect(section).toBeVisible();
    await expect(section.getByText(HOME_ADD_FIXTURE_TITLE).first()).toBeVisible();
    // Visible HomeAddSection artwork or provider image DOM (Visual)
    const homeAddImage = section.locator(
      ".home-add-card-img, .home-add-card-poster img, .card-provider-badge img"
    );
    await homeAddImage.first().scrollIntoViewIfNeeded();
    await expect(homeAddImage.first()).toBeVisible();
    await fixtureImageRequest;

    const visualHomeAdd = monitor.homeAddFixtureCount();
    const visualSentinel = monitor.fixtureCount();
    expect(
      visualHomeAdd,
      `visual HomeAdd fixture sentinel should be >=1; saw: ${monitor.tracked.join("\n")}`
    ).toBeGreaterThanOrEqual(1);
    expect(
      visualSentinel,
      `visual control should observe >=1 sentinel request; saw: ${monitor.tracked.join("\n")}`
    ).toBeGreaterThanOrEqual(1);

    // Retain existing Visual control path: watchlist posters also request fixture sentinels
    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(FIXTURE_TITLES[0]).first()).toBeVisible();
    await expect(page.locator(".wl2g-poster .pic").first()).toBeVisible();
    expect(
      monitor.fixtureCount(),
      `visual control cumulative sentinel should remain >=1; saw: ${monitor.tracked.join("\n")}`
    ).toBeGreaterThanOrEqual(1);

    test.info().annotations.push(
      {
        type: "visual_control_home_add_sentinel_request_count",
        description: String(visualHomeAdd),
      },
      {
        type: "visual_control_sentinel_request_count",
        description: String(monitor.fixtureCount()),
      }
    );
    // eslint-disable-next-line no-console
    console.log(
      `ATB-621 counts visual_home_add=${visualHomeAdd} visual_control=${monitor.fixtureCount()}`
    );

    monitor.dispose();
  });
});
