import { test, expect } from "@playwright/test";

test.describe("/dashboard", () => {
  test("renders dashboard with status counts", async ({ page }) => {
    await page.goto("/dashboard");

    // ページ見出し
    await expect(page.getByRole("heading", { name: "好み分析ダッシュボード" })).toBeVisible();

    // ステータス件数が表示される (watching=2, planned=1)
    await expect(page.getByText("3件の視聴ステータスを保存中")).toBeVisible();
  });

  test("shows v0.8 NEW badge", async ({ page }) => {
    await page.goto("/dashboard");

    const newsBadgeLink = page.locator(".dashboard-updates-link");
    await expect(newsBadgeLink).toContainText("v0.8");
    await expect(newsBadgeLink).toContainText("今夜何見る？");
  });

  test("NEW badge links to /updates", async ({ page }) => {
    await page.goto("/dashboard");

    const link = page.locator(".dashboard-updates-link");
    await expect(link).toHaveAttribute("href", "/updates");
  });

  test("shows 今夜何見る？ section when user has watching items", async ({ page }) => {
    await page.goto("/dashboard");

    // watching=2 なので today section が表示される
    await expect(page.getByRole("heading", { name: "今夜何見る？" })).toBeVisible();

    // CTA ボタンが2つある
    await expect(page.getByRole("button", { name: "続きを見る" })).toBeVisible();
    await expect(page.getByRole("button", { name: "今夜完結したい" })).toBeVisible();
  });

  test("今夜何見る？ shows candidate card on click", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "続きを見る" }).click();

    // 候補カードまたはローディング、または空メッセージのいずれか
    await expect(
      page.locator(".tonight-candidate-card, .tonight-watch-empty, .tonight-watch-loading")
    ).toBeVisible({ timeout: 8_000 });
  });
});
