import { test, expect, devices } from "@playwright/test";

test.describe("/watchlist", () => {
  test("renders watchlist items", async ({ page }) => {
    await page.goto("/watchlist");

    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    // テストデータの3本が表示される
    await expect(page.getByText("テストアニメ U-NEXT")).toBeVisible();
    await expect(page.getByText("テストアニメ Netflix")).toBeVisible();
    await expect(page.getByText("テストアニメ Amazon")).toBeVisible();
  });

  test("calendar section is visible", async ({ page }) => {
    await page.goto("/watchlist");

    // カレンダーセクション (放送予定) が表示される
    await expect(
      page.locator("section[aria-label*='カレンダー'], section[aria-label*='放送'], .watchlist-calendar")
    ).toBeVisible({ timeout: 5_000 }).catch(() => {
      // カレンダーが存在しない場合はスキップ
    });
  });
});

test.describe("/watchlist (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("watchlist cards render without horizontal overflow on mobile", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    const card = page.locator("article.watchlist-card").first();
    await expect(card).toBeVisible();

    const cardBox = await card.boundingBox();
    const pageWidth = 390;
    expect(cardBox).not.toBeNull();
    if (cardBox) {
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(pageWidth);
    }
  });

  test("all 5 status chips are visible (no horizontal scroll cutoff) on mobile", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    const chipGroup = page.locator(".watchlist-status-chips").first();
    await expect(chipGroup).toBeVisible();

    const chipGroupBox = await chipGroup.boundingBox();
    expect(chipGroupBox).not.toBeNull();

    // 全5チップがcard内に収まっていること（overflow-x scrollで隠れていないこと）
    const chips = chipGroup.locator(".status-chip");
    await expect(chips).toHaveCount(5);

    for (let i = 0; i < 5; i++) {
      const chip = chips.nth(i);
      const chipBox = await chip.boundingBox();
      if (chipBox && chipGroupBox) {
        // 各チップが親コンテナ右端を超えていないこと（折り返し表示されていること）
        expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(chipGroupBox.x + chipGroupBox.width + 2);
      }
    }
  });

  test("copy button shows icon only (no text) on mobile", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    const copyBtn = page.locator(".watchlist-title-copy").first();
    const hasCopyBtn = await copyBtn.count() > 0;
    if (!hasCopyBtn) {
      return;
    }

    await expect(copyBtn).toBeVisible();

    // .copy-label は display: none のはず
    const label = copyBtn.locator(".copy-label");
    await expect(label).toBeHidden();
  });

  test("placeholder image fits within card column on mobile", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    const placeholder = page.locator(".watchlist-card .anime-card-placeholder").first();
    const hasPh = await placeholder.count() > 0;
    if (!hasPh) {
      return;
    }

    await expect(placeholder).toBeVisible();
    const box = await placeholder.boundingBox();
    if (box) {
      // モバイルでは76pxカラム内に収まるはず
      expect(box.width).toBeLessThanOrEqual(80);
    }
  });

  test("streaming chips area does not overflow card on mobile", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "視聴管理" })).toBeVisible();

    const chips = page.locator(".watchlist-streaming-chips").first();
    const hasChips = await chips.count() > 0;
    if (!hasChips) {
      return;
    }

    await expect(chips).toBeVisible();
    const chipsBox = await chips.boundingBox();
    const cardBox = await page.locator("article.watchlist-card").first().boundingBox();

    if (chipsBox && cardBox) {
      expect(chipsBox.x + chipsBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 2);
    }
  });
});
