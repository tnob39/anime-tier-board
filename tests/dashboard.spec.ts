import { test, expect } from "@playwright/test";

test.describe("retired /dashboard", () => {
  test("redirects to the actionable subscription diagnosis", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/subscriptions$/);
    await expect(page.getByRole("heading", { name: "サブスク" })).toBeVisible();
  });

  test("legacy dashboard share remains readable", async ({ page }) => {
    await page.goto("/dashboard/share/missing-dashboard-share");
    await expect(page).not.toHaveURL(/\/subscriptions$/);
  });
});
