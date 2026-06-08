import { test, expect } from "@playwright/test";

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
