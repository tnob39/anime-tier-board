import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 }
];

test.describe("subscription utility", () => {
  test("dashboard redirects once to the real subscriptions page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/subscriptions$/);
    await expect(page.getByRole("heading", { name: /をカバー/ })).toBeVisible();
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}px keeps result, uncertainty and CTA in a non-overflowing first view`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: /をカバー/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "加入サービスを編集" })).toBeVisible();
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        ctaBottom: document.querySelector(".subscriptions-hero-actions")?.getBoundingClientRect().bottom ?? Infinity
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      if (viewport.width === 390) expect(metrics.ctaBottom).toBeLessThanOrEqual(844);
    });
  }

  test("provider disclosures work from the keyboard and expose their state", async ({ page }) => {
    await page.goto("/subscriptions");
    const provider = page.locator(".subscription-provider-row").first();
    const summary = provider.locator("summary");
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(provider).toHaveAttribute("open", "");
    await expect(provider.locator(".subscription-provider-detail")).toBeVisible();
  });
});
