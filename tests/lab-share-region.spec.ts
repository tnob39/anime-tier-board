import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LAB_AVAILABILITY_SOURCE,
  LAB_CHECKED_AT,
  LAB_CULTURE_CYCLE_ITEMS,
  LAB_REGIONS,
  LAB_SHARE_ANIME,
} from "../app/lab/share-region/fixtures";

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block",
});

const DISPLAY_MODE_KEY = "numanie-display-mode";
const PAGE_PATH = "/lab/share-region";

const FORMATTED_CHECKED_AT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(LAB_CHECKED_AT));

async function setDisplayModeBeforeNav(page: Page, mode: "simple" | "visual") {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    [DISPLAY_MODE_KEY, mode]
  );
}

async function gotoLab(page: Page, mode: "simple" | "visual" = "visual") {
  await setDisplayModeBeforeNav(page, mode);
  await page.goto(PAGE_PATH, { waitUntil: "domcontentloaded" });
  const root = page.getByTestId("lab-share-region-page");
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-hydrated", "true");
  await expect(root).toHaveAttribute("data-display-mode", mode);
}

async function selectRegion(page: Page, regionId: "JP" | "XX") {
  await page
    .getByTestId("lab-share-region-region-switch")
    .locator(`[data-region-id="${regionId}"]`)
    .click();
  await expect(page.getByTestId("lab-share-region-page")).toHaveAttribute(
    "data-region",
    regionId
  );
}

async function expectMinTap(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "interactive control must have a box").toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(() => {
    const root = document.querySelector("[data-testid='lab-share-region-page']");
    if (!(root instanceof HTMLElement)) return true;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(overflowed).toBe(false);
}

async function captureParity(page: Page, mode: "simple" | "visual") {
  const context = await page.context().browser()!.newContext({
    storageState: { cookies: [], origins: [] },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    serviceWorkers: "block",
  });
  const p = await context.newPage();
  await gotoLab(p, mode);
  const payload = {
    canonical: (await p.getByTestId("lab-share-region-canonical-title").innerText()).trim(),
    translation: (await p.getByTestId("lab-share-region-translated-title").innerText()).trim(),
    studio: (await p.getByTestId("lab-share-region-studio").innerText()).trim(),
    region: (await p.getByTestId("lab-share-region-recipient-region").innerText()).trim(),
    source: (await p.getByTestId("lab-share-region-source").innerText()).trim(),
    checkedAt: (await p.getByTestId("lab-share-region-checked-at").innerText()).trim(),
    cta: (await p.getByTestId("lab-share-region-watch-cta").innerText()).trim(),
    href: await p.getByTestId("lab-share-region-watch-cta").getAttribute("href"),
    primaryCount: await p.locator("[data-primary-action]").count(),
    spoilerHidden: await p.getByTestId("lab-share-region-spoiler").isHidden(),
    posterCount: await p.getByTestId("lab-share-region-poster").count(),
  };
  await context.close();
  return payload;
}

test.describe("ATB-766 lab share-region", () => {
  test("confirmed region shows source+region+checked-at and one legitimate watch CTA", async ({
    page,
  }) => {
    await gotoLab(page);
    await selectRegion(page, "JP");

    const availability = page.getByTestId("lab-share-region-availability");
    await expect(availability).toHaveAttribute("data-availability", "confirmed");
    await expect(availability).toHaveAttribute("data-source", LAB_AVAILABILITY_SOURCE);
    await expect(availability).toHaveAttribute("data-region", "JP");
    await expect(availability).toHaveAttribute("data-checked-at", LAB_CHECKED_AT);
    await expect(page.getByTestId("lab-share-region-source")).toContainText(
      LAB_AVAILABILITY_SOURCE
    );
    await expect(page.getByTestId("lab-share-region-region-code")).toContainText("JP");
    await expect(page.getByTestId("lab-share-region-checked-at")).toContainText(
      FORMATTED_CHECKED_AT
    );
    await expect(page.getByTestId("lab-share-region-recipient-region")).toHaveText(
      LAB_REGIONS.JP.label
    );

    const cta = page.getByTestId("lab-share-region-watch-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", LAB_REGIONS.JP.provider.href);
    await expect(cta).toHaveText("Netflixで正規視聴する");
    await expect(page.locator("[data-primary-action]")).toHaveCount(1);
    await expect(page.getByTestId("lab-share-region-unavailable")).toHaveCount(0);
  });

  test("unavailable region stays unavailable instead of guessing a provider", async ({
    page,
  }) => {
    await gotoLab(page);
    await selectRegion(page, "XX");

    const availability = page.getByTestId("lab-share-region-availability");
    await expect(availability).toHaveAttribute("data-availability", "unavailable");
    await expect(availability).toHaveAttribute("data-source", LAB_AVAILABILITY_SOURCE);
    await expect(availability).toHaveAttribute("data-region", "XX");
    await expect(availability).toHaveAttribute("data-checked-at", LAB_CHECKED_AT);
    await expect(page.getByTestId("lab-share-region-recipient-region")).toHaveText(
      LAB_REGIONS.XX.label
    );
    await expect(page.getByTestId("lab-share-region-unavailable")).toHaveText(
      "この地域では正規配信を確認できません。配信元を推測して表示していません。"
    );
    await expect(page.getByTestId("lab-share-region-watch-cta")).toHaveCount(0);
    await expect(page.locator("[data-primary-action]")).toHaveCount(0);
    await expect(page.getByTestId("lab-share-region-page")).not.toContainText("Netflix");
  });

  test("canonical Japanese title keeps English translation alongside it", async ({
    page,
  }) => {
    await gotoLab(page);
    const canonical = page.getByTestId("lab-share-region-canonical-title");
    const translation = page.getByTestId("lab-share-region-translated-title");
    await expect(canonical).toHaveText(LAB_SHARE_ANIME.canonicalTitle);
    await expect(canonical).toHaveAttribute("lang", "ja");
    await expect(translation).toHaveText(LAB_SHARE_ANIME.translatedTitle);
    await expect(translation).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("lab-share-region-studio")).toHaveText(
      LAB_SHARE_ANIME.studio
    );
  });

  test("spoiler is hidden by default and can be revealed", async ({ page }) => {
    await gotoLab(page);
    const spoiler = page.getByTestId("lab-share-region-spoiler");
    const toggle = page.getByTestId("lab-share-region-spoiler-toggle");
    await expect(spoiler).toBeHidden();
    await expect(spoiler).toHaveText(LAB_SHARE_ANIME.spoiler);
    await expect(toggle).toHaveText("ネタバレを表示");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(spoiler).toBeVisible();
    await expect(toggle).toHaveText("ネタバレを隠す");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(spoiler).toBeHidden();
  });

  test("Visual / Simple parity: same titles, region, CTA, and hidden spoiler", async ({
    page,
  }) => {
    const visual = await captureParity(page, "visual");
    const simple = await captureParity(page, "simple");

    expect(visual.posterCount).toBe(1);
    expect(simple.posterCount).toBe(0);

    const { posterCount: _visualPoster, ...visualShared } = visual;
    const { posterCount: _simplePoster, ...simpleShared } = simple;
    expect(simpleShared).toEqual(visualShared);
    expect(visualShared.canonical).toBe(LAB_SHARE_ANIME.canonicalTitle);
    expect(visualShared.translation).toBe(LAB_SHARE_ANIME.translatedTitle);
    expect(visualShared.cta).toBe("Netflixで正規視聴する");
    expect(visualShared.primaryCount).toBe(1);
    expect(visualShared.spoilerHidden).toBe(true);
  });

  test("CTA uniqueness: confirmed has one primary action, unavailable has none", async ({
    page,
  }) => {
    await gotoLab(page);
    await expect(page.locator("[data-primary-action='watch']")).toHaveCount(1);
    await expect(page.getByTestId("lab-share-region-page")).toHaveAttribute(
      "data-primary-count",
      "1"
    );

    await selectRegion(page, "XX");
    await expect(page.locator("[data-primary-action]")).toHaveCount(0);
    await expect(page.getByTestId("lab-share-region-page")).toHaveAttribute(
      "data-primary-count",
      "0"
    );

    await selectRegion(page, "JP");
    await expect(page.locator("[data-primary-action]")).toHaveCount(1);
  });

  test("desktop: readable layout, 44px targets, no horizontal overflow", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Desktop proof is owned by chromium project"
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);
    await expectNoHorizontalOverflow(page);
    await expectMinTap(page.locator('[data-region-id="JP"]'));
    await expectMinTap(page.getByTestId("lab-share-region-watch-cta"));
    await expectMinTap(page.getByTestId("lab-share-region-spoiler-toggle"));
    await expectMinTap(page.getByRole("button", { name: "ビジュアル" }));
    await expectMinTap(page.getByRole("button", { name: "シンプル" }));
  });

  test("mobile: 375px layout, 44px targets, no horizontal overflow", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "mobile-chrome",
      "Mobile proof is owned by mobile-chrome project"
    );

    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLab(page);
    await expectNoHorizontalOverflow(page);
    await expectMinTap(page.locator('[data-region-id="JP"]'));
    await expectMinTap(page.getByTestId("lab-share-region-watch-cta"));
    await expectMinTap(page.getByTestId("lab-share-region-spoiler-toggle"));
    await expect(page.getByTestId("lab-share-region-canonical-title")).toBeVisible();
    await expect(page.getByTestId("lab-share-region-translated-title")).toBeVisible();
  });

  test("keyboard can focus spoiler control and the primary watch CTA", async ({
    page,
  }) => {
    await gotoLab(page);
    const toggle = page.getByTestId("lab-share-region-spoiler-toggle");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("lab-share-region-spoiler")).toBeVisible();

    const cta = page.getByTestId("lab-share-region-watch-cta");
    await cta.focus();
    await expect(cta).toBeFocused();
  });

  test("culture-cycle check is visible with required items", async ({ page }) => {
    await gotoLab(page);
    const cycle = page.getByTestId("lab-share-region-culture-cycle");
    await expect(cycle).toBeVisible();
    await expect(cycle.getByRole("heading", { name: "文化循環チェック" })).toBeVisible();
    for (const item of LAB_CULTURE_CYCLE_ITEMS) {
      const row = cycle.locator(`[data-cycle="${item.key}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(item.label);
      await expect(row).toContainText(item.text);
    }
  });
});
