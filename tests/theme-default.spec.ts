import { expect, test, type Page } from "@playwright/test";

const THEME_KEY = "numanie:theme";

async function setThemePreferenceBeforeNavigation(
  page: Page,
  preference: string | null
) {
  await page.addInitScript(
    ([key, value]) => {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    },
    [THEME_KEY, preference] as const
  );
}

async function readThemeTokens(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      datasetTheme: root.dataset.theme,
      colorScheme: style.colorScheme,
      background: style.getPropertyValue("--background").trim(),
      surface: style.getPropertyValue("--surface").trim(),
      ink: style.getPropertyValue("--ink").trim(),
      focus: style.getPropertyValue("--focus").trim(),
      fg: style.getPropertyValue("--fg").trim(),
    };
  });
}

test.describe("theme defaults", () => {
  test("uses the dark token palette when no preference was saved", async ({ page }) => {
    await setThemePreferenceBeforeNavigation(page, null);
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => readThemeTokens(page)).toMatchObject({
      datasetTheme: "dark",
      colorScheme: "dark",
      background: "#0f1214",
      surface: "#181c1f",
      ink: "#e7eaec",
      focus: "#2dd4bf",
      fg: "#e7eaec",
    });
    const topbarBackground = await page.evaluate(() => {
      const topbar = document.createElement("header");
      topbar.className = "topbar";
      document.body.append(topbar);
      const background = getComputedStyle(topbar).backgroundColor;
      topbar.remove();
      return background;
    });
    expect(topbarBackground).toBe("rgba(24, 28, 31, 0.94)");
  });

  test("falls back to dark when a saved preference is invalid", async ({ page }) => {
    await setThemePreferenceBeforeNavigation(page, "invalid-theme");
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => readThemeTokens(page)).toMatchObject({
      datasetTheme: "dark",
      colorScheme: "dark",
      background: "#0f1214",
    });
  });

  test("keeps an explicit light preference", async ({ page }) => {
    await setThemePreferenceBeforeNavigation(page, "light");
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => readThemeTokens(page)).toMatchObject({
      datasetTheme: "light",
      colorScheme: "light",
      background: "#f6f7f8",
      surface: "#fff",
      ink: "#161a1d",
      focus: "#0f766e",
      fg: "#161a1d",
    });
  });
});
