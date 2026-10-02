import { expect, test, type Page, type Route } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";


test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block"
});

const pageErrors: Error[] = [];

function seasonalPayload(year: number, season: string) {
  return {
    year,
    season,
    items: [
      {
        id: `anilist-${year}${["WINTER", "SPRING", "SUMMER", "FALL"].indexOf(season) + 1}`,
        source: "anilist",
        title: `${year}${season} フィクスチャ`,
        titles: { native: `${year}${season} フィクスチャ` },
        imageUrl: "",
        proxiedImageUrl: "",
        siteUrl: "https://example.invalid/anime/season-context"
      }
    ],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: "2026-01-15T03:00:00.000Z"
  };
}

async function mockSeasonalApi(page: Page) {
  await page.route("**/api/anime/seasonal**", async (route: Route) => {
    const url = new URL(route.request().url());
    const year = Number(url.searchParams.get("year"));
    const season = url.searchParams.get("season") ?? "FALL";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seasonalPayload(year, season))
    });
  });
  await page.route("**/api/boards**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ board: null })
    });
  });
  await page.route("**/api/auth/session", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });
}

async function attachErrorCollector(page: Page) {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error));
}

async function waitForSeasonControl(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-display-mode", /simple|visual/);
  const control = page.locator(".season-context-control");
  await expect(control).toBeVisible({ timeout: 30_000 });
  await expect(control.locator('select[aria-label="年"]')).toBeEnabled({ timeout: 30_000 });
  return control;
}

async function expectCanonical(page: Page, pathname: string, year: number, season: string) {
  await expect(page).toHaveURL(`${new URL(page.url()).origin}${pathname}?year=${year}&season=${season}&keep=1#context`);
  const control = page.locator(".season-context-control");
  await expect(control.getByRole("combobox", { name: "年", exact: true })).toHaveValue(String(year));
  await expect(control.getByRole("combobox", { name: "クール", exact: true })).toHaveValue(season);
  await expect(page.locator('.mobile-bottom-nav a[href^="/tier/impressions"]')).toHaveAttribute(
    "href", `/tier/impressions?year=${year}&season=${season}`
  );
}

async function rapidSelect(page: Page, changes: Array<[string, string]>) {
  await page.locator(".season-context-control").evaluate((control, steps) => {
    for (const [label, value] of steps) {
      const select = control.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, changes);
}

test.describe("ATB-780 season context", () => {
  test.beforeEach(async ({ page }) => {
    await attachErrorCollector(page);
    await mockSeasonalApi(page);
  });

  test.afterEach(() => {
    expect(pageErrors, pageErrors.map((error) => error.message).join("\n")).toEqual([]);
  });

  test("invalid query canonicalizes so URL, heading, and fetch agree on /tier", async ({
    page
  }) => {
    await page.goto("/tier?year=nope&season=WINTER", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
      timeout: 30_000
    });
    const control = await waitForSeasonControl(page);
    await expect(page).toHaveURL(/\/tier(?:\?.*)?$/);
    await expect(page).not.toHaveURL(/year=nope/);
    await expect(control).toHaveAttribute("data-season-context-kind", "current");
    const year = await control.getAttribute("data-season-context-year");
    const season = await control.getAttribute("data-season-context-season");
    expect(year).toMatch(/^\d{4}$/);
    expect(season).toMatch(/^(WINTER|SPRING|SUMMER|FALL)$/);
    await expect(control.locator("[data-season-heading]")).toHaveText(new RegExp(`今期（${year}年`));
  });

  test("explicit year+season persists across reload and history", async ({ page }) => {
    await page.goto("/tier?year=2024&season=WINTER", { waitUntil: "domcontentloaded" });
    const control = await waitForSeasonControl(page);
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "WINTER");
    await expect(control).toHaveAttribute("data-season-context-kind", "selected");
    await expect(page.getByRole("heading", { name: "2024年冬アニメTier表" })).toBeVisible();
    await expect(control.locator("[data-season-heading]")).toHaveText("選択中の期（2024年冬）");
    await expect(control.locator(".season-context-note")).toContainText("今期（");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=WINTER/);
    await expect(page.getByRole("heading", { name: "2024年冬アニメTier表" })).toBeVisible({
      timeout: 30_000
    });

    await page.getByRole("button", { name: /次の期/ }).click();
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=SPRING/);
    await expect(page.getByRole("heading", { name: "2024年春アニメTier表" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/season=WINTER/);
    await expect(page.getByRole("heading", { name: "2024年冬アニメTier表" })).toBeVisible();
  });

  test("375px and keyboard can move year and season", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tier?year=2023&season=SUMMER", { waitUntil: "domcontentloaded" });
    const control = await waitForSeasonControl(page);
    const yearSelect = control.locator('select[aria-label="年"]');
    const seasonSelect = control.locator('select[aria-label="クール"]');
    const prevButton = page.getByRole("button", { name: /前の期/ });

    const yearBox = await yearSelect.boundingBox();
    const seasonBox = await seasonSelect.boundingBox();
    const prevBox = await prevButton.boundingBox();
    expect(yearBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(seasonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(prevBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(yearBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(seasonBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(prevBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    const controlBox = await control.boundingBox();
    const groupBox = await page.locator(".control-bar-season").boundingBox();
    expect(controlBox?.width).toBe(groupBox?.width);
    expect(await prevButton.evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
    expect(page.viewportSize()?.width).toBe(375);

    await yearSelect.selectOption("2025");
    await expect(page).toHaveURL(/year=2025/);
    await expect(control).toHaveAttribute("data-season-context-year", "2025");

    await seasonSelect.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(control).toHaveAttribute("data-season-context-year", "2025");
  });

  test("legacy season landing lowercase URLs remain; invalid path 404s", async ({
    page
  }) => {
    await page.goto("/seasons/2026/autumn", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ページが見つかりませんでした" })).toBeVisible({
      timeout: 30_000
    });

    await page.goto("/seasons/nope/summer", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ページが見つかりませんでした" })).toBeVisible({
      timeout: 30_000
    });
  });

  test("home guest selector writes year+season and keeps 今期 distinct", async ({
    page
  }) => {
    await page.goto("/?year=2024&season=FALL", { waitUntil: "domcontentloaded" });
    const control = await waitForSeasonControl(page);
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "FALL");
    await expect(control.locator("[data-season-heading]")).toHaveText("選択中の期（2024年秋）");
    await control.locator('select[aria-label="クール"]').selectOption("SUMMER");
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=SUMMER/);
    await expect(control).toHaveAttribute("data-season-context-season", "SUMMER");

    await expect(page.locator('.global-nav-link[href^="/tier"]')).toHaveAttribute(
      "href", "/tier?year=2024&season=SUMMER"
    );
    await expect(control.locator("[data-season-heading]")).toHaveText("選択中の期（2024年夏）");
    await expect(control.locator(".season-context-note")).toContainText("今期（");
  });

  test("rapid year then season and season then year keep both dimensions", async ({
    page
  }) => {
    await page.goto("/?year=2023&season=WINTER", { waitUntil: "domcontentloaded" });
    const control = await waitForSeasonControl(page);
    const yearSelect = control.locator('select[aria-label="年"]');
    const seasonSelect = control.locator('select[aria-label="クール"]');

    await yearSelect.selectOption("2024");
    await seasonSelect.selectOption("SUMMER");
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=SUMMER/);
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "SUMMER");

    await page.goBack();
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=WINTER/);
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "WINTER");

    await page.goBack();
    await expect(page).toHaveURL(/year=2023/);
    await expect(page).toHaveURL(/season=WINTER/);

    await page.goForward();
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=WINTER/);

    await seasonSelect.selectOption("FALL");
    await yearSelect.selectOption("2025");
    await expect(page).toHaveURL(/year=2025/);
    await expect(page).toHaveURL(/season=FALL/);
    await expect(control).toHaveAttribute("data-season-context-year", "2025");
    await expect(control).toHaveAttribute("data-season-context-season", "FALL");
  });

  test("tier rapid year then season keeps both dimensions and history", async ({
    page
  }) => {
    await page.goto("/tier?year=2023&season=FALL", { waitUntil: "domcontentloaded" });
    const control = await waitForSeasonControl(page);
    const yearSelect = control.locator('select[aria-label="年"]');
    const seasonSelect = control.locator('select[aria-label="クール"]');

    await yearSelect.selectOption("2024");
    await seasonSelect.selectOption("SUMMER");
    await expect(page).toHaveURL(/\/tier\?/);
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=SUMMER/);
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "SUMMER");
    await expect(page.getByRole("heading", { name: "2024年夏アニメTier表" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/season=FALL/);

    await seasonSelect.selectOption("WINTER");
    await yearSelect.selectOption("2025");
    await expect(page).toHaveURL(/year=2025/);
    await expect(page).toHaveURL(/season=WINTER/);
    await expect(control).toHaveAttribute("data-season-context-year", "2025");
    await expect(control).toHaveAttribute("data-season-context-season", "WINTER");
  });

  test("seasonal API rejects invalid season instead of mixing current season", async ({
    request
  }) => {
    const response = await request.get("/api/anime/seasonal?year=2020&season=banana");
    expect(response.status()).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error ?? JSON.stringify(payload)).toMatch(/season/i);
  });

  for (const pathname of ["/", "/tier", "/tier/impressions"]) {
    test(`${pathname} same-task selections and both history directions use canonical location`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("numanie-display-mode", "simple"));
      await page.goto(`${pathname}?year=2023&season=FALL&keep=1#context`);
      await waitForSeasonControl(page);
      await rapidSelect(page, [["年", "2024"], ["クール", "SUMMER"]]);
      await expectCanonical(page, pathname, 2024, "SUMMER");
      await expect(page.getByText("2024SUMMER フィクスチャ", { exact: true }).first()).toBeVisible();
      await page.goBack();
      await expectCanonical(page, pathname, 2024, "FALL");
      await page.goBack();
      await expectCanonical(page, pathname, 2023, "FALL");
      await page.goForward();
      await expectCanonical(page, pathname, 2024, "FALL");
      await page.goForward();
      await expectCanonical(page, pathname, 2024, "SUMMER");

      await rapidSelect(page, [["クール", "WINTER"], ["年", "2025"]]);
      await expectCanonical(page, pathname, 2025, "WINTER");
      await page.goBack();
      await expectCanonical(page, pathname, 2024, "WINTER");
      await page.goForward();
      await expectCanonical(page, pathname, 2025, "WINTER");
    });
  }

  test("returning to an implicit current URL does not reuse the initial explicit season", async ({ page }) => {
    await page.goto("/?year=2024&season=WINTER");
    const control = await waitForSeasonControl(page);
    await page.evaluate(() => window.history.pushState(null, "", "/?keep=1"));
    const current = getCurrentAnimeSeason();
    await expect(control).toHaveAttribute("data-season-context-kind", "current");
    await expect(control).toHaveAttribute("data-season-context-year", String(current.year));
    await expect(control).toHaveAttribute("data-season-context-season", current.season);
    await page.goBack();
    await expect(control).toHaveAttribute("data-season-context-year", "2024");
    await expect(control).toHaveAttribute("data-season-context-season", "WINTER");
    await page.goForward();
    await expect(control).toHaveAttribute("data-season-context-kind", "current");
    await expect(page).toHaveURL(/\/\?keep=1$/);
  });

  for (const mode of ["simple", "visual"]) {
    for (const navV5 of [false, true]) {
      test(`375px ${mode} navV5=${navV5} exposes one-tap 今期チェック in the existing Tier slot`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.addInitScript(({ mode, navV5 }) => {
          localStorage.setItem("numanie-display-mode", mode);
          localStorage.setItem("numanie:nav-v5", navV5 ? "1" : "0");
        }, { mode, navV5 });
        await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
          user: { name: "Local owner fixture", email: "tnob38@gmail.com" },
          expires: "2099-01-01T00:00:00.000Z"
        } }));
        await page.goto("/?year=2024&season=SUMMER");
        await waitForSeasonControl(page);
        await expect(page.locator("html")).toHaveAttribute("data-display-mode", mode);
        const nav = page.getByRole("navigation", { name: "主要ページ", exact: true });
        await expect(nav.getByRole("link")).toHaveCount(navV5 ? 5 : 4);
        const check = nav.getByRole("link", { name: "Tier 今期チェック" });
        await expect(check).toBeVisible();
        await expect(check).toHaveAttribute("href", "/tier/impressions?year=2024&season=SUMMER");
        const metrics = await check.evaluate((link) => {
          const label = link.querySelector(".mobile-nav-tier-label")!;
          return { width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height,
            labelWidth: label.scrollWidth, available: link.clientWidth,
            labelHeight: label.getBoundingClientRect().height,
            labelLineHeight: parseFloat(getComputedStyle(label).lineHeight),
            overflow: document.documentElement.scrollWidth > window.innerWidth };
        });
        expect(metrics.width).toBeGreaterThanOrEqual(44);
        expect(metrics.height).toBeGreaterThanOrEqual(44);
        expect(metrics.labelWidth).toBeLessThanOrEqual(metrics.available);
        expect(metrics.labelHeight).toBeLessThanOrEqual(metrics.labelLineHeight + 1);
        expect(metrics.overflow).toBe(false);
        await page.goto("/tier?year=2024&season=SUMMER");
        await waitForSeasonControl(page);
        await expect(check).toHaveAttribute("aria-current", "page");
        const area = page.getByRole("navigation", { name: "Tierの表示切り替え" });
        await expect(area.getByRole("link", { name: "Tier表", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(area.getByRole("link", { name: "今期チェック", exact: true })).not.toHaveAttribute("aria-current", "page");
        await expect(area.getByRole("link", { name: "今期チェック", exact: true })).toHaveAttribute(
          "href", "/tier/impressions?year=2024&season=SUMMER"
        );
        await page.screenshot({ path: testInfo.outputPath(`tier-nav-${mode}-${navV5}.png`) });

        await page.goto("/tier/impressions?year=2024&season=SUMMER");
        await expect(check).toHaveAttribute("aria-current", "page");
        await expect(area.getByRole("link", { name: "今期チェック", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(area.getByRole("link", { name: "Tier表", exact: true })).not.toHaveAttribute("aria-current", "page");
        await expect(area.getByRole("link", { name: "Tier表", exact: true })).toHaveAttribute(
          "href", "/tier?year=2024&season=SUMMER"
        );
      });
    }

    test(`post-779 ${mode}: one tap opens impressions and preserves active state and season on return`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addInitScript((mode) => {
        localStorage.setItem("numanie-display-mode", mode);
        localStorage.setItem("numanie:nav-v5", "1");
      }, mode);
      await page.goto("/?year=2024&season=SUMMER");
      await waitForSeasonControl(page);
      const nav = page.getByRole("navigation", { name: "主要ページ", exact: true });
      await nav.getByRole("link", { name: "Tier 今期チェック" }).click();
      await expect(page).toHaveURL(/\/tier\/impressions\?year=2024&season=SUMMER$/);
      await expect(page.getByRole("heading", { name: "今期チェック", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Tier 今期チェック" })).toHaveAttribute("aria-current", "page");
      const area = page.getByRole("navigation", { name: "Tierの表示切り替え" });
      await expect(page.locator(".tier-area-nav")).toHaveCount(1);
      await expect(area.getByRole("link", { name: "今期チェック", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(area.getByRole("link", { name: "Tier表", exact: true })).not.toHaveAttribute("aria-current", "page");
      const control = await waitForSeasonControl(page);
      await expect(control).toHaveAttribute("data-season-context-year", "2024");
      await expect(control).toHaveAttribute("data-season-context-season", "SUMMER");
      await expect(control.locator("[data-season-heading]")).toHaveText("選択中の期（2024年夏）");
      await expect(page.getByRole("button", { name: /2024SUMMER フィクスチャ/ })).toBeEnabled();
      for (const target of [...await control.getByRole("combobox").all(), ...await control.getByRole("button").all(), ...await area.getByRole("link").all()]) {
        const box = await target.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`impressions-${mode}-375.png`), fullPage: true });
      await area.getByRole("link", { name: "Tier表", exact: true }).click();
      await expect(page).toHaveURL(/\/tier\?year=2024&season=SUMMER$/);
      await expect(page.getByRole("heading", { name: "2024年夏アニメTier表" })).toBeVisible();
      await expect(area.getByRole("link", { name: "Tier表", exact: true })).toHaveAttribute("aria-current", "page");
      await area.getByRole("link", { name: "今期チェック", exact: true }).click();
      await expect(page).toHaveURL(/\/tier\/impressions\?year=2024&season=SUMMER$/);
      await expect(control.locator("[data-season-heading]")).toHaveText("選択中の期（2024年夏）");
    });
  }
});
