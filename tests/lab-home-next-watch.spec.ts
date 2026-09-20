import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CHECKED_AT_JA,
  CONFIRMED_SOURCE,
  CONFIRMED_WATCH_HREF,
  LAB_REGION_LABEL,
  UNKNOWN_SOURCE
} from "../app/lab/home-next-watch/fixtures";
import { CULTURE_CYCLE_CHECKS } from "../app/lab/home-next-watch/culture-check";

/** Guest-only lab surface — do not depend on authenticated storageState. */
test.use({ storageState: { cookies: [], origins: [] } });

const LAB_PATH = "/lab/home-next-watch";
const CONFIRMED_TITLE = "葬送のフリーレン";
const UNAVAILABLE_TITLE = "視聴先未確認の作品";
const MISSING_PROVENANCE_TITLE = "出典欠落の確認済み候補";
const IMPOSSIBLE_TIMESTAMP_TITLE = "存在しない確認日時の候補";
const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "desktop", width: 1280, height: 800 }
] as const;

async function gotoLab(
  page: Page,
  fixture?: "confirmed" | "unavailable" | "missing-provenance" | "impossible-timestamp"
) {
  const path = fixture ? `${LAB_PATH}?fixture=${fixture}` : LAB_PATH;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "今夜の1本", level: 1 })).toBeVisible();
}

function root(page: Page) {
  return page.locator("[data-hnw-root='true']");
}

function watchLinks(page: Page) {
  return page.locator("[data-hnw-watch-link='true']");
}

function primaryCtas(page: Page) {
  return page.locator(".hnw-primary-cta");
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectMinTapTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must have a bounding box`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}

async function collectParitySnapshot(page: Page) {
  const lab = root(page);
  return lab.evaluate((node) => {
    const source = node.querySelector("[data-hnw-source]")?.textContent?.trim() ?? "";
    const region = node.querySelector("[data-hnw-region]")?.textContent?.trim() ?? "";
    const checkedAt = node.querySelector("[data-hnw-checked-at]")?.textContent?.trim() ?? "";
    const unavailable = node.querySelector("[data-hnw-unavailable]")?.textContent?.trim() ?? "";
    const watch = node.querySelector("[data-hnw-watch-link]") as HTMLAnchorElement | null;
    const radios = Array.from(node.querySelectorAll('input[name="hnw-tonight"]')).map((input) => ({
      value: (input as HTMLInputElement).value,
      checked: (input as HTMLInputElement).checked
    }));
    const checks = Array.from(node.querySelectorAll("[data-hnw-check]")).map((item) => ({
      id: (item as HTMLElement).dataset.hnwCheck ?? "",
      result: (item as HTMLElement).dataset.hnwCheckResult ?? ""
    }));
    return {
      title: node.querySelector(".hnw-title")?.textContent?.trim() ?? "",
      nextHeading: node.querySelector("#hnw-next-heading")?.textContent?.trim() ?? "",
      source,
      region,
      checkedAt,
      unavailable,
      href: watch?.getAttribute("href") ?? null,
      ctaText: watch?.textContent?.trim() ?? null,
      radios,
      checks,
      watchCount: node.querySelectorAll("[data-hnw-watch-link]").length,
      primaryCount: node.querySelectorAll(".hnw-primary-cta").length
    };
  });
}

test.describe("ATB-762 lab home next watch", () => {
  test.describe.configure({ timeout: 60_000 });

  test("confirmed fixture shows source, region, checked-at, and one regional CTA", async ({
    page
  }) => {
    await gotoLab(page, "confirmed");
    const lab = root(page);
    await expect(lab).toHaveAttribute("data-hnw-availability", "confirmed");
    await expect(lab.locator("[data-hnw-source]")).toHaveText(CONFIRMED_SOURCE);
    await expect(lab.locator("[data-hnw-region]")).toHaveText(LAB_REGION_LABEL);
    await expect(lab.locator("[data-hnw-checked-at]")).toHaveText(CHECKED_AT_JA);
    await expect(lab.getByText(CONFIRMED_TITLE)).toBeVisible();
    await expect(lab.getByText("マッドハウス")).toHaveCount(2);
    await expect(primaryCtas(page)).toHaveCount(1);
    await expect(watchLinks(page)).toHaveCount(1);
    await expect(watchLinks(page)).toHaveAttribute("href", CONFIRMED_WATCH_HREF);
    await expect(watchLinks(page)).toHaveText("Netflix で見る");
    await expect(lab).toHaveAttribute("data-hnw-cta-eligible", "true");
    await expect(page.locator("[data-hnw-unavailable]")).toHaveCount(0);
    await expect(lab.locator("a[href^='http']")).toHaveCount(0);
    await expect(lab.locator("a[href*='netflix.com']")).toHaveCount(0);
  });

  test("unavailable fixture hides watch links and does not invent a provider destination", async ({
    page
  }) => {
    await gotoLab(page, "unavailable");
    const lab = root(page);
    await expect(lab).toHaveAttribute("data-hnw-availability", "unknown");
    await expect(lab).toHaveAttribute("data-hnw-cta-eligible", "false");
    await expect(lab.locator("[data-hnw-source]")).toHaveText(UNKNOWN_SOURCE);
    await expect(lab.locator("[data-hnw-region]")).toHaveText(LAB_REGION_LABEL);
    await expect(lab.locator("[data-hnw-checked-at]")).toHaveText(CHECKED_AT_JA);
    await expect(lab.getByText(UNAVAILABLE_TITLE)).toBeVisible();
    await expect(page.getByText("正規の視聴先は未確認です。リンクは表示しません。")).toBeVisible();
    await expect(primaryCtas(page)).toHaveCount(0);
    await expect(watchLinks(page)).toHaveCount(0);
    await expect(lab.locator("a[href*='/api/go/']")).toHaveCount(0);
    await expect(lab.locator("a[href^='http']")).toHaveCount(0);
    await expect(lab.locator("a[href*='netflix']")).toHaveCount(0);
  });

  test("nominally confirmed candidate missing provenance does not show a CTA", async ({
    page
  }) => {
    await gotoLab(page, "missing-provenance");
    const lab = root(page);
    await expect(lab).toHaveAttribute("data-hnw-fixture", "missing-provenance");
    await expect(lab).toHaveAttribute("data-hnw-availability", "confirmed");
    await expect(lab).toHaveAttribute("data-hnw-cta-eligible", "false");
    await expect(lab.getByText(MISSING_PROVENANCE_TITLE)).toBeVisible();
    await expect(page.getByText("正規の視聴先は未確認です。リンクは表示しません。")).toBeVisible();
    await expect(primaryCtas(page)).toHaveCount(0);
    await expect(watchLinks(page)).toHaveCount(0);
    await expect(lab.locator("a[href*='/api/go/']")).toHaveCount(0);
    await expect(lab.locator("a[href^='http']")).toHaveCount(0);
    await expect(lab.locator("a.hnw-primary-cta")).toHaveCount(0);
  });

  test("impossible calendar timestamp renders no CTA", async ({ page }) => {
    await gotoLab(page, "impossible-timestamp");
    const lab = root(page);
    await expect(lab).toHaveAttribute("data-hnw-fixture", "impossible-timestamp");
    await expect(lab).toHaveAttribute("data-hnw-availability", "confirmed");
    await expect(lab).toHaveAttribute("data-hnw-cta-eligible", "false");
    await expect(lab.getByText(IMPOSSIBLE_TIMESTAMP_TITLE)).toBeVisible();
    await expect(lab.locator("[data-hnw-checked-at]")).toHaveText("2026年2月30日 12:00（日本時間）");
    await expect(page.getByText("正規の視聴先は未確認です。リンクは表示しません。")).toBeVisible();
    await expect(primaryCtas(page)).toHaveCount(0);
    await expect(watchLinks(page)).toHaveCount(0);
    await expect(lab.locator("a[href*='/api/go/']")).toHaveCount(0);
    await expect(lab.locator("a.hnw-primary-cta")).toHaveCount(0);
  });

  test("choosing a candidate is deterministic and keeps a single primary next action", async ({
    page
  }) => {
    await gotoLab(page, "confirmed");
    await expect(primaryCtas(page)).toHaveCount(1);
    await page.getByRole("radio", { name: UNAVAILABLE_TITLE }).check();
    await expect(root(page)).toHaveAttribute("data-hnw-fixture", "unavailable");
    await expect(page).toHaveURL(/fixture=unavailable/);
    await expect(primaryCtas(page)).toHaveCount(0);
    await expect(watchLinks(page)).toHaveCount(0);
    await page.getByRole("radio", { name: CONFIRMED_TITLE }).check();
    await expect(root(page)).toHaveAttribute("data-hnw-fixture", "confirmed");
    await expect(primaryCtas(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "次の一手" })).toHaveCount(1);
  });

  test("Visual and Simple keep the same watch destination and provenance", async ({ page }) => {
    await gotoLab(page, "confirmed");
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    const visual = await collectParitySnapshot(page);
    await expect(root(page).locator("img.hnw-art")).toHaveCount(1);

    await page.getByRole("button", { name: "Simple", exact: true }).click();
    await expect(root(page)).toHaveAttribute("data-hnw-mode", "simple");
    await expect(root(page).locator("img")).toHaveCount(0);
    const simple = await collectParitySnapshot(page);
    expect(simple).toEqual(visual);

    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(root(page).locator("img.hnw-art")).toHaveCount(1);
    expect(await collectParitySnapshot(page)).toEqual(simple);
  });

  test("keyboard moves between tonight candidates and shows a visible focus ring", async ({
    page
  }) => {
    await gotoLab(page, "confirmed");
    const confirmed = page.getByRole("radio", { name: CONFIRMED_TITLE });
    const unavailable = page.getByRole("radio", { name: UNAVAILABLE_TITLE });
    await page.getByRole("button", { name: "Simple", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(confirmed).toBeFocused();
    await expect(confirmed).toBeChecked();

    const outline = await confirmed.evaluate((node) => {
      const target = (node as HTMLElement).closest(".hnw-candidate") ?? node;
      const style = getComputedStyle(target as HTMLElement);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle
      };
    });
    expect(Number.parseFloat(outline.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(outline.outlineStyle).toBe("solid");

    await page.keyboard.press("ArrowDown");
    await expect(unavailable).toBeChecked();
    await expect(unavailable).toBeFocused();
    await expect(root(page)).toHaveAttribute("data-hnw-availability", "unknown");
    await page.keyboard.press("ArrowUp");
    await expect(confirmed).toBeChecked();
    await expect(confirmed).toBeFocused();
    await expect(watchLinks(page)).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(watchLinks(page)).toBeFocused();
  });

  test("culture-cycle check is visible with §1.8 items", async ({ page }) => {
    await gotoLab(page);
    const region = page.getByRole("region", { name: "文化循環チェック" });
    await expect(region).toBeVisible();
    await expect(region.locator("[data-hnw-check]")).toHaveCount(CULTURE_CYCLE_CHECKS.length);
    for (const item of CULTURE_CYCLE_CHECKS) {
      const row = region.locator(`[data-hnw-check="${item.id}"]`);
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute("data-hnw-check-result", item.result);
      await expect(row.getByText(item.label, { exact: true })).toBeVisible();
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: layout stays inside the viewport with 44px targets`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoLab(page, "confirmed");
      await expectNoHorizontalOverflow(page);
      await expectMinTapTarget(page.getByRole("button", { name: "Visual", exact: true }), "Visual");
      await expectMinTapTarget(page.getByRole("button", { name: "Simple", exact: true }), "Simple");
      await expectMinTapTarget(
        page.locator(".hnw-candidate").first(),
        "confirmed candidate"
      );
      await expectMinTapTarget(watchLinks(page), "watch CTA");

      await page.getByRole("radio", { name: UNAVAILABLE_TITLE }).check();
      await expectNoHorizontalOverflow(page);
      await expect(watchLinks(page)).toHaveCount(0);
    });
  }

  test("reduced motion removes transform on the primary CTA", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoLab(page, "confirmed");
    const motion = await watchLinks(page).evaluate((node) => {
      const style = getComputedStyle(node as HTMLElement);
      return {
        duration: style.transitionDuration,
        transform: style.transform
      };
    });
    expect(motion.duration.split(",").every((part) => part.trim() === "0s")).toBe(true);
    expect(motion.transform === "none" || motion.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(
      true
    );
  });
});
