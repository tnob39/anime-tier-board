import { test, expect, type Page, type Route } from "@playwright/test";
import { encode } from "@auth/core/jwt";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

/**
 * /explore is owner-gated; do not use the default non-owner storageState.
 * Block service workers so page.route fixtures are not bypassed by public/sw.js.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block"
});

const DISPLAY_MODE_KEY = "numanie-display-mode";
const OWNER_EMAIL = "tnob38@gmail.com";
const COOKIE_NAME = "authjs.session-token";
const OWNER_USER_ID = "playwright-owner-atb-314";

/** Fixed fixture year — never derive from Date.now / getFullYear. */
const FIXTURE_YEAR = 2025;

const FETCHED_AT = "2026-01-15T03:00:00.000Z";
const FORMATTED_FETCHED_AT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(FETCHED_AT));

const FRESH_TEXT = `最新の季節データです。データ元: anilist / 最終取得: ${FORMATTED_FETCHED_AT}`;
const STALE_TEXT = `データを更新できていません（キャッシュ表示・最大7日）。データ元: jikan / 最終取得: ${FORMATTED_FETCHED_AT}`;
const UNAVAILABLE_TEXT =
  "季節データを取得できませんでした。時間をおいて「さがす」を押してください。";

const FIXTURE_TITLE_A = "ATB-314 Freshness A";
const FIXTURE_TITLE_B = "ATB-314 Freshness B";

const LIVE_UPSTREAM_RE =
  /graphql\.anilist\.co|api\.jikan\.moe|api\.themoviedb\.org|image\.tmdb\.org/i;

type SeasonalFixture = {
  year: number;
  season: string;
  items: Array<Record<string, unknown> | null>;
  source?: string;
  freshness?: string;
  fetchedAt?: string;
  cached?: boolean;
};

function makeItem(id: string, title: string): Record<string, unknown> {
  return {
    id,
    source: "anilist",
    title,
    titles: { native: title, romaji: title },
    imageUrl: "",
    proxiedImageUrl: "",
    siteUrl: `https://example.invalid/anime/${id}`,
    popularity: 1000,
    score: 80,
    genres: ["Action"]
  };
}

function freshPayload(): SeasonalFixture {
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A)],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: FETCHED_AT,
    cached: false
  };
}

function stalePayload(): SeasonalFixture {
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [
      makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A),
      makeItem("anilist-e2e-314-b", FIXTURE_TITLE_B)
    ],
    source: "jikan",
    freshness: "stale",
    fetchedAt: FETCHED_AT,
    cached: true
  };
}

function unavailablePayload(): SeasonalFixture {
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A)],
    source: "anilist",
    freshness: "unavailable",
    fetchedAt: FETCHED_AT,
    cached: false
  };
}

function malformedPayload(): SeasonalFixture {
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A)]
    // missing freshness/source/fetchedAt
  };
}

/** Success envelope with a null item — must normalize to unavailable without page error. */
function nullItemPayload(): SeasonalFixture {
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A), null],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: FETCHED_AT,
    cached: false
  };
}

/** Nested genres malformed — whole payload unavailable, zero cards, no pageerror. */
function malformedGenresPayload(): SeasonalFixture {
  const item = makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A);
  item.genres = [1, "Action"] as unknown as string[];
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [item],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: FETCHED_AT,
    cached: false
  };
}

/** Nested titles values malformed — whole payload unavailable, zero cards, no pageerror. */
function malformedTitlesPayload(): SeasonalFixture {
  const item = makeItem("anilist-e2e-314-a", FIXTURE_TITLE_A);
  item.titles = { native: 123, romaji: FIXTURE_TITLE_A } as unknown as Record<string, unknown>;
  return {
    year: FIXTURE_YEAR,
    season: "ALL",
    items: [item],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: FETCHED_AT,
    cached: false
  };
}

async function installOwnerAuth(page: Page) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET missing — cannot mint owner session for /explore");
  }

  const sessionToken = await encode({
    token: {
      sub: OWNER_USER_ID,
      name: "Playwright Owner ATB-314",
      email: OWNER_EMAIL
    },
    secret: authSecret,
    salt: COOKIE_NAME,
    maxAge: 60 * 60 * 24
  });

  await page.context().addCookies([
    {
      name: COOKIE_NAME,
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax"
    }
  ]);
}

async function blockLiveUpstream(page: Page) {
  await page.route(LIVE_UPSTREAM_RE, async (route) => {
    await route.fulfill({
      status: 599,
      contentType: "application/json",
      body: JSON.stringify({ error: "live upstream blocked in ATB-314 fixture test" })
    });
  });
}

function isSeasonalApi(url: string): boolean {
  try {
    return new URL(url).pathname.includes("/api/anime/seasonal");
  } catch {
    return url.includes("/api/anime/seasonal");
  }
}

/**
 * Always fulfill seasonal API (never continue to live Next handler).
 * `getResponse` is read per request so tests can switch modes between clicks.
 */
async function installSeasonalFixture(
  page: Page,
  getResponse: () => { status: number; body: unknown }
) {
  // Glob is more reliable than URL predicates across Playwright versions.
  await page.route("**/api/anime/seasonal**", async (route: Route) => {
    const next = getResponse();
    await route.fulfill({
      status: next.status,
      contentType: "application/json",
      body: JSON.stringify(next.body)
    });
  });
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

async function gotoExplore(page: Page) {
  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByRole("heading", { name: "年代を選んで作品をさがす" })).toBeVisible();
}

/**
 * Mobile CSS hides `.command-button span` (icon-only), so role name "さがす"
 * is not exposed. Target the explore controls emphasis button instead.
 */
function searchButton(page: Page) {
  return page.locator(".explore-controls button.emphasis-button").first();
}

async function clickSearch(page: Page) {
  const button = searchButton(page);
  await expect(button).toBeVisible({ timeout: 15_000 });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.scrollIntoViewIfNeeded();
  const responsePromise = page.waitForResponse(
    (res) => isSeasonalApi(res.url()) && res.request().method() === "GET",
    { timeout: 20_000 }
  );
  await button.click();
  await responsePromise;
  await expect(button).toBeEnabled({ timeout: 15_000 });
}

function freshnessNotice(page: Page) {
  return page.locator(".notice.warning").first();
}

test.describe("ATB-314 explore seasonal freshness", () => {
  test.beforeEach(async ({ page }) => {
    await installOwnerAuth(page);
    await blockLiveUpstream(page);
  });

  test("fresh: status notice + cards", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: freshPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    await expect(notice).toHaveText(FRESH_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toBeVisible();
  });

  test("stale: status notice keeps cards", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: stalePayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    await expect(notice).toHaveText(STALE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toBeVisible();
    await expect(page.getByText(FIXTURE_TITLE_B)).toBeVisible();
  });

  test("unavailable: alert notice clears cards", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: unavailablePayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(notice).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
    await expect(page.getByText("年代を選んで「さがす」を押すと、作品が表示されます。")).toBeVisible();
  });

  test("malformed success payload normalizes to unavailable", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: malformedPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(notice).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
  });

  test("null malformed item normalizes to unavailable without page error", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: nullItemPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(notice).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
    await expect(page.locator(".explore-card")).toHaveCount(0);
    await expect(page.getByText("年代を選んで「さがす」を押すと、作品が表示されます。")).toBeVisible();
    expect(pageErrors, `unexpected page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toEqual(
      []
    );
  });

  test("malformed genres: zero cards + alert + empty + no pageerror", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: malformedGenresPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(notice).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
    await expect(page.locator(".explore-card")).toHaveCount(0);
    await expect(page.getByText("年代を選んで「さがす」を押すと、作品が表示されます。")).toBeVisible();
    expect(pageErrors, `unexpected page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toEqual(
      []
    );
  });

  test("malformed titles values: zero cards + alert + empty + no pageerror", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: malformedTitlesPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "alert");
    await expect(notice).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
    await expect(page.locator(".explore-card")).toHaveCount(0);
    await expect(page.getByText("年代を選んで「さがす」を押すと、作品が表示されます。")).toBeVisible();
    expect(pageErrors, `unexpected page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toEqual(
      []
    );
  });

  test("recovery: unavailable → さがす → fresh restores cards", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    let mode: "unavailable" | "fresh" = "unavailable";
    await installSeasonalFixture(page, () =>
      mode === "unavailable"
        ? { status: 200, body: unavailablePayload() }
        : { status: 200, body: freshPayload() }
    );
    await gotoExplore(page);

    await expect(freshnessNotice(page)).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);

    mode = "fresh";
    await clickSearch(page);

    await expect(freshnessNotice(page)).toHaveAttribute("role", "status");
    await expect(freshnessNotice(page)).toHaveText(FRESH_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toBeVisible();
  });

  test("stale → unavailable clears previously shown cards", async ({ page }) => {
    await setDisplayModeBeforeNav(page, "visual");
    let mode: "stale" | "unavailable" = "stale";
    await installSeasonalFixture(page, () =>
      mode === "stale"
        ? { status: 200, body: stalePayload() }
        : { status: 200, body: unavailablePayload() }
    );
    await gotoExplore(page);
    await expect(page.getByText(FIXTURE_TITLE_A)).toBeVisible();
    await expect(page.getByText(FIXTURE_TITLE_B)).toBeVisible();

    mode = "unavailable";
    await clickSearch(page);

    await expect(freshnessNotice(page)).toHaveAttribute("role", "alert");
    await expect(freshnessNotice(page)).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
    await expect(page.getByText(FIXTURE_TITLE_B)).toHaveCount(0);
  });

  test("Visual / Simple parity: same notice text, role, and card titles", async ({ page }) => {
    const capture = async (mode: "simple" | "visual") => {
      const context = await page.context().browser()!.newContext({
        storageState: undefined,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        serviceWorkers: "block"
      });
      const p = await context.newPage();
      await installOwnerAuth(p);
      await blockLiveUpstream(p);
      await setDisplayModeBeforeNav(p, mode);
      await installSeasonalFixture(p, () => ({
        status: 200,
        body: stalePayload()
      }));
      await p.goto("/explore", { waitUntil: "domcontentloaded" });
      await expect(p).toHaveURL(/\/explore/);
      const notice = p.locator(".notice.warning").first();
      await expect(notice).toBeVisible();
      const role = await notice.getAttribute("role");
      const text = (await notice.innerText()).trim();
      const titleA = await p.getByText(FIXTURE_TITLE_A).isVisible();
      const titleB = await p.getByText(FIXTURE_TITLE_B).isVisible();
      const noticeCount = await p.locator(".notice.warning").count();
      await context.close();
      return { role, text, titleA, titleB, noticeCount };
    };

    const visual = await capture("visual");
    const simple = await capture("simple");
    expect(simple).toEqual(visual);
    expect(visual.role).toBe("status");
    expect(visual.text).toBe(STALE_TEXT);
    expect(visual.titleA).toBe(true);
    expect(visual.titleB).toBe(true);
    expect(visual.noticeCount).toBe(1);
  });

  test("non-OK seasonal response uses unavailable alert and clears cards", async ({
    page
  }) => {
    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 502,
      body: { error: "upstream failed", items: [makeItem("x", FIXTURE_TITLE_A)] }
    }));
    await gotoExplore(page);
    await expect(freshnessNotice(page)).toHaveAttribute("role", "alert");
    await expect(freshnessNotice(page)).toHaveText(UNAVAILABLE_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toHaveCount(0);
  });
});

test.describe("ATB-314 explore seasonal freshness (mobile)", () => {
  test.beforeEach(async ({ page }) => {
    await installOwnerAuth(page);
    await blockLiveUpstream(page);
  });

  test("mobile: fresh notice readable without horizontal page overflow", async ({ page }) => {
    test.skip(
      test.info().project.name !== "mobile-chrome",
      "Mobile overflow proof is owned by mobile-chrome project"
    );

    await setDisplayModeBeforeNav(page, "visual");
    await installSeasonalFixture(page, () => ({
      status: 200,
      body: freshPayload()
    }));
    await gotoExplore(page);

    const notice = freshnessNotice(page);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(FRESH_TEXT);
    await expect(page.getByText(FIXTURE_TITLE_A)).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        bodyScrollWidth: document.body.scrollWidth
      };
    });
    expect(
      overflow.scrollWidth,
      `horizontal overflow: ${JSON.stringify(overflow)}`
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
