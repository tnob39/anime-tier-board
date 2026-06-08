import { test, expect } from "@playwright/test";

// テストデータ:
//   watching: U-NEXT anime, watching: Amazon anime, planned: Netflix anime
//   subscriptions: unext + amazon_prime
//   expected covered = 2/3 = 67%

test.describe("/subscriptions", () => {
  test("shows subscribed services in beginner view", async ({ page }) => {
    await page.goto("/subscriptions");

    // ページタイトルを確認
    await expect(page.getByRole("heading", { name: "今すぐ見れるもの" })).toBeVisible();

    // 加入中サービス (U-NEXT, Amazon) が表示される
    await expect(page.getByText("U-NEXT")).toBeVisible();
    await expect(page.getByText("Amazon Prime Video")).toBeVisible();
  });

  test("shows coverage percentage in diagnosis mode", async ({ page }) => {
    await page.goto("/subscriptions");

    // 診断モードボタンをクリック
    await page.getByRole("button", { name: "診断モードを見る" }).click();

    // カバー率 (2/3 = 67%) が表示される
    await expect(page.getByText("67%")).toBeVisible();
    await expect(page.getByText("2 / 3本が加入中サービスで見放題")).toBeVisible();
  });

  test("diagnosis mode shows per-service breakdown", async ({ page }) => {
    await page.goto("/subscriptions");
    await page.getByRole("button", { name: "診断モードを見る" }).click();

    // 加入中セクションの見出し
    await expect(page.getByRole("heading", { name: "加入中" })).toBeVisible();

    // 追加すると増えるセクションに Netflix が出てくる (未加入)
    const additionalSection = page.getByRole("heading", { name: "追加すると増える" });
    await expect(additionalSection).toBeVisible();
    await expect(page.locator(".subscription-additional-list").getByText("Netflix")).toBeVisible();
  });

  test("back button returns to beginner view", async ({ page }) => {
    await page.goto("/subscriptions");
    await page.getByRole("button", { name: "診断モードを見る" }).click();
    await page.getByRole("button", { name: "シンプル表示に戻る" }).click();

    await expect(page.getByRole("heading", { name: "今すぐ見れるもの" })).toBeVisible();
  });
});
