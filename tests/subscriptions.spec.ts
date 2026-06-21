import { expect, test } from "@playwright/test";

test.describe("/subscriptions", () => {
  test("redirects to dashboard", async ({ page }) => {
    await page.goto("/subscriptions");

    await expect(page).not.toHaveURL(/\/subscriptions/);
  });
});
