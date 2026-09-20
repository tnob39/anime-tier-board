import { expect, test, type Page } from "@playwright/test";

/** Independent lab mock — do not reuse authenticated production storage. */
test.use({ storageState: { cookies: [], origins: [] } });

const LAB_PATH = "/lab/my-list-next";

async function openLab(page: Page, width: number, height = 800) {
  const apiHits: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/(watchlist|statuses|anime|account)\b/.test(url)) {
      apiHits.push(url);
    }
  });
  await page.setViewportSize({ width, height });
  await page.goto(LAB_PATH, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "マイリストの次の一手" })).toBeVisible({
    timeout: 15_000
  });
  await expect(page.getByTestId("lab-my-list-next")).toHaveAttribute("data-hydrated", "true");
  return apiHits;
}

async function expectOnePrimary(page: Page) {
  const primaries = page.locator("[data-primary-action='true']");
  await expect(primaries).toHaveCount(1);
  const box = await page.getByTestId("primary-next-action").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectLabFitsViewport(page: Page) {
  const fits = await page.getByTestId("lab-my-list-next").evaluate((el) => {
    return el.scrollWidth <= el.clientWidth + 1;
  });
  expect(fits).toBe(true);
}

async function readSuggestedFacts(page: Page) {
  const facts = page.locator("[data-testid^='facts-']").first();
  await expect(facts).toBeVisible();
  return {
    id: await facts.getAttribute("data-testid"),
    text: (await facts.innerText()).replace(/\s+/g, " ").trim(),
    action: (await page.getByTestId("primary-next-action").innerText()).trim()
  };
}

test.describe("ATB-765-LAB my-list-next mock", () => {
  test.describe.configure({ timeout: 60_000 });

  test("desktop shows three states, one primary action, and culture-cycle", async ({
    page
  }) => {
    const apiHits = await openLab(page, 1280);
    await expect(page).toHaveURL(/\/lab\/my-list-next/);
    await expect(page.getByTestId("work-uw-frieren")).toBeVisible();
    await expect(page.getByTestId("work-uw-frieren")).toHaveAttribute("data-state", "unwatched");
    await expect(page.getByTestId("work-dm-heike")).toHaveAttribute("data-state", "dormant");
    await expect(page.getByTestId("work-ex-mujica")).toHaveAttribute("data-state", "expiring");
    await expect(page.getByTestId("work-uw-frieren")).toContainText("未消化");
    await expect(page.getByTestId("work-dm-heike")).toContainText("長期放置");
    await expect(page.getByTestId("work-ex-mujica")).toContainText("配信終了間近");
    await expect(page.getByTestId("culture-cycle-check")).toContainText(
      "確認できた正規配信での視聴か、本人の見直し判断へ一つだけ動かします"
    );
    await expectOnePrimary(page);
    await expectLabFitsViewport(page);
    expect(apiHits).toEqual([]);
  });

  test("unknown expiry stays unavailable and is not treated as 配信終了間近", async ({
    page
  }) => {
    await openLab(page, 1280);
    for (const id of [
      "fail-region",
      "fail-source",
      "fail-checked",
      "fail-date",
      "fail-unofficial",
      "fail-spoof-host",
      "fail-spoof-userinfo"
    ]) {
      const row = page.getByTestId(`work-${id}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText("unavailable");
      await expect(row).not.toHaveAttribute("data-state", "expiring");
    }

    await page.getByTestId("filter-expiring").click();
    await expect(page.getByTestId("filter-expiring")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("work-ex-mujica")).toBeVisible();
    await expect(page.getByTestId("work-fail-region")).toHaveCount(0);
    await expect(page.getByTestId("work-fail-unofficial")).toHaveCount(0);
    await expect(page.getByTestId("work-fail-spoof-host")).toHaveCount(0);
    await expect(page.getByTestId("work-fail-spoof-userinfo")).toHaveCount(0);
  });

  test("spoofed Netflix URLs stay unavailable and do not offer a legal watch action", async ({
    page
  }) => {
    await openLab(page, 1280);
    await page.getByTestId("work-fail-spoof-host").click();
    await expect(page.getByTestId("facts-fail-spoof-host")).toContainText("unavailable");
    await expect(page.getByTestId("primary-next-action")).toHaveText("見直し判断する");
    await expect(page.getByTestId("primary-next-action")).not.toHaveText(/正規配信で見る/);

    await page.getByTestId("work-fail-spoof-userinfo").click();
    await expect(page.getByTestId("facts-fail-spoof-userinfo")).toContainText("unavailable");
    await expect(page.getByTestId("primary-next-action")).toHaveText("見直し判断する");
    await expect(page.getByTestId("primary-next-action")).not.toHaveText(/正規配信で見る/);
    await expectOnePrimary(page);
  });

  test("filters switch states and completing the next action keeps a single primary", async ({
    page
  }) => {
    await openLab(page, 1280);

    await page.getByTestId("filter-unwatched").click();
    await expect(page.getByTestId("filter-unwatched")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("work-uw-frieren")).toBeVisible();
    await expect(page.getByTestId("work-ex-mujica")).toHaveCount(0);
    await expectOnePrimary(page);

    await page.getByTestId("filter-dormant").click();
    await expect(page.getByTestId("work-dm-heike")).toBeVisible();
    await expect(page.getByTestId("work-uw-frieren")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "見直し判断する" })).toBeVisible();
    await expectOnePrimary(page);

    await page.getByTestId("filter-expiring").click();
    await expect(page.getByTestId("work-ex-mujica")).toBeVisible();
    await expect(page.getByTestId("primary-next-action")).toHaveText(
      "確認済みの正規配信で見る"
    );
    await page.getByTestId("primary-next-action").click();
    await expect(page.getByRole("status")).toContainText("正規配信での視聴へ進めました");
    await expect(page.getByTestId("work-ex-mujica")).toHaveCount(0);
    await expectOnePrimary(page);
    await expect(page.getByTestId("done-log")).toContainText("BanG Dream! Ave Mujica");
  });

  test("Visual and Simple expose equivalent facts and the same primary action", async ({
    page
  }) => {
    await openLab(page, 1280);
    await page.getByTestId("display-mode-visual").click();
    await expect(page.getByTestId("lab-my-list-next")).toHaveAttribute(
      "data-display-mode",
      "visual"
    );
    await expect(page.getByTestId("visual-poster")).toBeVisible();
    const visual = await readSuggestedFacts(page);

    await page.getByTestId("display-mode-simple").click();
    await expect(page.getByTestId("lab-my-list-next")).toHaveAttribute(
      "data-display-mode",
      "simple"
    );
    await expect(page.getByTestId("visual-poster")).toHaveCount(0);
    const simple = await readSuggestedFacts(page);

    expect(simple.id).toEqual(visual.id);
    expect(simple.text).toEqual(visual.text);
    expect(simple.action).toEqual(visual.action);
    expect(simple.text).toMatch(/出典 ABEMA/);
    expect(simple.text).toMatch(/地域 JP/);
    expect(simple.text).toMatch(/確認 2026-09-19/);
    await expectOnePrimary(page);
    await expect(page.locator("#lab-my-list-next img, [data-testid='lab-my-list-next'] img")).toHaveCount(0);
  });

  test("keyboard path completes the primary next action", async ({ page }) => {
    await openLab(page, 1280);
    const primary = page.getByTestId("primary-next-action");
    await primary.focus();
    await expect(primary).toBeFocused();
    await primary.press("Enter");
    await expect(page.getByRole("status")).toContainText("正規配信での視聴へ進めました");
    await expect(page.getByTestId("done-log")).toContainText("BanG Dream! Ave Mujica");
    await expectOnePrimary(page);
  });

  test("mobile 320–430px keeps 44px targets and the three-state next action", async ({
    page
  }) => {
    for (const width of [320, 375, 430]) {
      await openLab(page, width, 720);
      await expect(page.getByTestId("work-uw-frieren")).toBeVisible();
      await expect(page.getByTestId("work-dm-heike")).toBeVisible();
      await expect(page.getByTestId("work-ex-mujica")).toBeVisible();
      await expectOnePrimary(page);
      await expectLabFitsViewport(page);
      const chip = await page.getByTestId("filter-unwatched").boundingBox();
      expect(chip).not.toBeNull();
      expect(chip!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("review decision stays one primary and records a conscious keep", async ({
    page
  }) => {
    await openLab(page, 375, 812);
    await page.getByTestId("filter-dormant").click();
    await page.getByTestId("work-dm-heike").click();
    await expect(page.getByTestId("primary-next-action")).toHaveText("見直し判断する");
    await page.getByTestId("primary-next-action").click();
    await expect(page.getByTestId("primary-next-action")).toHaveText("見続ける");
    await expectOnePrimary(page);
    await page.getByTestId("primary-next-action").click();
    await expect(page.getByRole("status")).toContainText("見続ける判断を記録しました");
    await page.getByTestId("filter-unwatched").click();
    await expect(page.getByTestId("work-dm-heike")).toBeVisible();
  });
});
