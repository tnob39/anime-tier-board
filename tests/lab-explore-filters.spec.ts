import { expect, test, type Page } from "@playwright/test";

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block"
});

const PATH = "/lab/explore-filters";
const DISPLAY_MODE_KEY = "numanie-display-mode";

async function openLab(page: Page, mode: "visual" | "simple" = "visual") {
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
  await page.goto(PATH);
  await expect(
    page.getByRole("heading", {
      name: "正規視聴できる作品を、年代・スタジオ・スタッフからさがす"
    })
  ).toBeVisible();
}

async function expectTapTarget(page: Page, locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible").toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

test.describe("ATB-764 lab explore filters", () => {
  test("desktop filters, provenance, and one primary watch action", async ({
    page
  }, info) => {
    test.skip(info.project.name !== "chromium", "desktop proof uses chromium");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);

    await expect(page.getByTestId("lab-ef-result")).toHaveCount(7);
    await page.getByLabel("正規視聴").selectOption("legal");
    await expect(page.getByTestId("lab-ef-result")).toHaveCount(4);
    await page.getByLabel("年代").selectOption("2010s");
    await expect(page.getByTestId("lab-ef-result")).toHaveCount(2);
    await page.getByLabel("スタジオ").selectOption("ラボスタジオ北");
    await expect(page.getByTestId("lab-ef-result")).toHaveCount(2);
    await page.getByLabel("スタッフ").selectOption("高橋 葵｜監督");
    await expect(page.getByTestId("lab-ef-result")).toHaveCount(2);

    await page.getByRole("button", { name: /ATB-764 湖畔の記録/ }).click();
    await expect(page.getByTestId("lab-ef-provenance")).toContainText("許可済み");
    await expect(page.getByTestId("lab-ef-provenance")).toContainText("日本");
    await expect(page.getByTestId("lab-ef-provenance")).toContainText("見放題");
    const watch = page.getByRole("link", { name: "正規配信で見る" });
    await expect(watch).toHaveCount(1);
    await expect(watch).toHaveAttribute("href", /lab-watch\.example\.invalid/);
    await expect(page.getByTestId("lab-ef-unavailable")).toHaveCount(0);
    await expectTapTarget(page, page.getByRole("button", { name: "条件をリセット" }).first());
    await expectTapTarget(page, watch);
  });

  test("empty state resets to the full catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    await page.getByLabel("正規視聴").selectOption("legal");
    await page.getByLabel("年代").selectOption("1990s");
    await page.getByLabel("スタジオ").selectOption("ラボスタジオ北");
    await page.getByLabel("スタッフ").selectOption("井上 紬｜脚本");
    await expect(page.getByTestId("lab-ef-empty")).toBeVisible();
    await expect(page.getByText("条件に一致する作品がありません")).toBeVisible();
    await page.getByRole("button", { name: "条件をリセット" }).last().click();
    await expect(page.getByTestId("lab-ef-result")).toHaveCount(7);
  });

  test("unknown and permission-required results stay visibly unavailable", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    await page.getByRole("button", { name: /ATB-764 未確認の配信/ }).click();
    await expect(page.getByTestId("lab-ef-provenance")).toContainText("不明");
    await expect(page.getByText("正規配信先を確認できません")).toBeVisible();
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toHaveCount(0);

    await page.getByRole("button", { name: /ATB-764 許諾待ちの公式/ }).click();
    await expect(page.getByTestId("lab-ef-provenance")).toContainText("許諾が必要");
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toHaveCount(0);
  });

  test("Visual and Simple keep the same filters and primary action", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page, "visual");
    await page.getByRole("button", { name: /ATB-764 湖畔の記録/ }).click();
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toBeVisible();

    await page.getByRole("button", { name: "Simple", exact: true }).click();
    await expect(page.getByLabel("正規視聴")).toBeVisible();
    await expect(page.getByLabel("年代")).toBeVisible();
    await expect(page.getByLabel("スタジオ")).toBeVisible();
    await expect(page.getByLabel("スタッフ")).toBeVisible();
    await expect(page.getByRole("button", { name: /ATB-764 湖畔の記録/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toBeVisible();
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toHaveCount(1);
  });

  test("keyboard can select a result and reach the watch action", async ({
    page
  }, info) => {
    test.skip(info.project.name !== "chromium", "keyboard proof uses desktop chromium");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    const first = page.getByRole("button", { name: /ATB-764 湖畔の記録/ });
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    const watch = page.getByRole("link", { name: "正規配信で見る" });
    await expect(watch).toBeVisible();
    await watch.focus();
    await expect(watch).toBeFocused();
  });

  test("mobile 375px keeps filters, 44px targets, and culture-cycle copy", async ({
    page
  }, info) => {
    test.skip(info.project.name !== "mobile-chrome", "mobile proof uses Pixel 5 project");
    await page.setViewportSize({ width: 375, height: 812 });
    await openLab(page);
    await expect(page.getByLabel("正規視聴")).toBeVisible();
    await expect(page.getByLabel("年代")).toBeVisible();
    await expect(page.getByLabel("スタジオ")).toBeVisible();
    await expect(page.getByLabel("スタッフ")).toBeVisible();
    await expectTapTarget(page, page.getByRole("button", { name: "条件をリセット" }).first());
    await page.getByLabel("年代").selectOption("1990s");
    await page.getByRole("button", { name: /ATB-764 冬の手仕事/ }).click();
    await expect(page.getByRole("link", { name: "正規配信で見る" })).toBeVisible();
    await expectTapTarget(page, page.getByRole("link", { name: "正規配信で見る" }));
    await expect(page.getByTestId("lab-ef-culture-cycle")).toContainText("ループ");
    await expect(page.getByTestId("lab-ef-culture-cycle")).toContainText("正規視聴");
    await expect(page.getByTestId("lab-ef-culture-cycle")).toContainText("作り手");
  });
});
