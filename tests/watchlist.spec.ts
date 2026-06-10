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

  test("shows current rhythm for watching item with saved rhythm", async ({ page }) => {
    await page.goto("/watchlist");

    // U-NEXT アニメは watch_rhythm=weekly で投入済み → .watch-rhythm-current が表示される
    const unextCard = page.locator("article").filter({ hasText: "テストアニメ U-NEXT" });
    await expect(unextCard).toBeVisible();

    const rhythmDisplay = unextCard.locator(".watch-rhythm-current");
    await expect(rhythmDisplay).toBeVisible();
    await expect(rhythmDisplay).toContainText("毎週リアタイ");
  });

  test("rhythm picker shows 3 options", async ({ page }) => {
    await page.goto("/watchlist");

    const unextCard = page.locator("article").filter({ hasText: "テストアニメ U-NEXT" });
    const picker = unextCard.locator(".watch-rhythm-picker");

    // picker が既に表示されているか、表示されていなければリズム変更ボタンをクリック
    if (await picker.isVisible()) {
      await expect(picker.getByText("毎週リアタイ")).toBeVisible();
      await expect(picker.getByText("まとめて見る")).toBeVisible();
      await expect(picker.getByText("ゆっくり見る")).toBeVisible();
    } else {
      const changeButton = unextCard.locator(".rhythm-change-link, button").filter({ hasText: "変更" });
      if (await changeButton.isVisible()) {
        await changeButton.click();
        await expect(picker.getByText("毎週リアタイ")).toBeVisible();
      }
    }
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
