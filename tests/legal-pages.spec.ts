import { expect, test, type Page } from "@playwright/test";

/** Guest-only legal surface — do not use global authenticated storageState. */
test.use({ storageState: { cookies: [], origins: [] } });

const LEGAL_ROUTES = [
  {
    path: "/privacy",
    title: /プライバシーポリシー/,
    heading: "プライバシーポリシー",
    disclosure: /暫定|専門家確認前|運用確認中/,
  },
  {
    path: "/terms",
    title: /利用規約/,
    heading: "利用規約",
    disclosure: /暫定/,
  },
  {
    path: "/contact",
    title: /お問い合わせ/,
    heading: "お問い合わせ",
    disclosure: /SLA|保証しません|\/feedback/,
  },
] as const;

const FOOTER_LINKS = [
  { name: "プライバシーポリシー", href: "/privacy" },
  { name: "利用規約", href: "/terms" },
  { name: "お問い合わせ", href: "/contact" },
  { name: "設定", href: "/settings" },
] as const;

async function expectLegalFooter(page: Page) {
  const footer = page.getByRole("contentinfo", { name: "法務情報" });
  await expect(footer).toBeVisible();

  for (const link of FOOTER_LINKS) {
    await expect(
      footer.getByRole("link", { name: link.name, exact: true })
    ).toHaveAttribute("href", link.href);
  }
}

async function expectNoAuthRedirect(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(?:\\?.*)?$`));
  await expect(page).not.toHaveURL(/login=required/);
  await expect(
    page.getByText("このページの利用にはログインが必要です")
  ).toHaveCount(0);
}

test.describe("ATB-740 legal pages (guest)", () => {
  for (const route of LEGAL_ROUTES) {
    test(`desktop: ${route.path} title/h1/disclosure/footer/no-redirect`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(route.path);

      await expectNoAuthRedirect(page, route.path);
      await expect(page).toHaveTitle(route.title);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByRole("note")).toContainText(route.disclosure);
      await expectLegalFooter(page);
      await expect(page.getByRole("link", { name: "/feedback" }).first()).toBeVisible();
    });

    test(`mobile: ${route.path} title/h1/disclosure/footer/no-redirect`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route.path);

      await expectNoAuthRedirect(page, route.path);
      await expect(page).toHaveTitle(route.title);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByRole("note")).toContainText(route.disclosure);
      await expectLegalFooter(page);

      const footer = page.getByRole("contentinfo", { name: "法務情報" });
      const contactLink = footer.getByRole("link", {
        name: "お問い合わせ",
        exact: true,
      });
      await contactLink.scrollIntoViewIfNeeded();
      await expect(page.locator(".mobile-bottom-nav")).toBeVisible();

      const box = await contactLink.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        const topHref = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest("a")?.getAttribute("href") ?? null;
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        // Footer control must not be covered by the fixed mobile nav.
        expect(topHref).toBe("/contact");
      }
    });
  }

  test("keyboard: footer legal links are reachable and activate", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/privacy");

    const footer = page.getByRole("contentinfo", { name: "法務情報" });
    const termsLink = footer.getByRole("link", { name: "利用規約", exact: true });

    await termsLink.focus();
    await expect(termsLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "利用規約" })).toBeVisible();

    const contactLink = page
      .getByRole("contentinfo", { name: "法務情報" })
      .getByRole("link", { name: "お問い合わせ", exact: true });
    await contactLink.focus();
    await expect(contactLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByRole("heading", { level: 1, name: "お問い合わせ" })).toBeVisible();
  });

  test("privacy export section reflects implemented settings export", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/privacy");

    const exportSection = page.locator("#privacy-export").locator("..");
    await expect(page.getByRole("heading", { level: 2, name: "8. データエクスポート" })).toBeVisible();
    await expect(exportSection).toContainText("設定");
    await expect(exportSection).not.toContainText("準備中");
    await expect(page.getByRole("link", { name: "設定" }).first()).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  test("guest footer 設定 preserves login-required returnTo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/privacy");

    const settingsLink = page
      .getByRole("contentinfo", { name: "法務情報" })
      .getByRole("link", { name: "設定", exact: true });
    await settingsLink.scrollIntoViewIfNeeded();
    await Promise.all([
      page.waitForURL((url) => {
        const u = new URL(url);
        return (
          u.pathname === "/" &&
          u.searchParams.get("login") === "required" &&
          u.searchParams.get("returnTo") === "/settings"
        );
      }),
      settingsLink.click()
    ]);
  });

  test("public share shell still exposes legal footer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Probe share id may keep network activity open; footer is in the shell HTML.
    await page.goto("/share/e2e-legal-footer-probe", { waitUntil: "domcontentloaded" });
    await expectLegalFooter(page);
  });
});
