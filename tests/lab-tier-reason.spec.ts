import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  COPY,
  LAB_ANIME_FIXTURES,
  LAB_TIER_REASON_PATH,
  REASON_MAX_LENGTH,
} from "../app/lab/tier-reason/tier-reason-model";

test.use({ serviceWorkers: "block" });

const MOBILE_WIDTHS = [320, 375, 430] as const;

async function gotoLab(page: Page) {
  await page.goto(LAB_TIER_REASON_PATH, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: COPY.title, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".lab-tr-page")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

function saveButton(page: Page) {
  return page.getByTestId("lab-tr-save");
}

function reasonField(page: Page) {
  return page.getByTestId("lab-tr-reason");
}

function status(page: Page) {
  return page.getByTestId("lab-tr-status");
}

function failNextBox(page: Page) {
  return page.getByTestId("lab-tr-fail-next");
}

async function expectTapTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be visible`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}

function spoilerChoice(page: Page) {
  return page.locator("label.lab-tr-choice").filter({ hasText: COPY.spoilerUnspecified });
}

async function readLabOverflow(page: Page) {
  return page.locator(".lab-tr-page").evaluate((el) => ({
    clientWidth: Math.round((el as HTMLElement).clientWidth),
    scrollWidth: Math.round((el as HTMLElement).scrollWidth),
  }));
}

async function sharedControlsVisible(page: Page) {
  await expect(page.getByLabel(COPY.reasonLabel)).toBeVisible();
  await expect(page.getByText(COPY.spoilerLegend, { exact: true })).toBeVisible();
  await expect(page.getByText(COPY.visibilityLegend, { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeVisible();
  await expect(page.getByTestId("lab-tr-culture")).toHaveAttribute(
    "data-culture-check",
    "recorded"
  );
  await expect(page.getByRole("button", { name: COPY.modeVisual })).toBeVisible();
  await expect(page.getByRole("button", { name: COPY.modeSimple })).toBeVisible();
  await expect(page.locator(".lab-tr-primary")).toHaveCount(1);
}

test.describe("ATB-763 lab tier-reason", () => {
  test("optional empty reason saves without forcing input", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);

    await expect(page.getByRole("radio", { name: COPY.visibilityPrivate })).toBeChecked();
    await expect(page.getByRole("radio", { name: COPY.spoilerUnspecified })).toBeChecked();
    await saveButton(page).click();

    await expect(status(page)).toHaveText(COPY.savedWithoutReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText(COPY.savedOriginalNone);
    await expect(page.getByTestId("lab-tr-share-preview")).toHaveText(COPY.shareHiddenPrivate);
    await expect(page.getByTestId("lab-tr-metric")).toHaveText(`${COPY.metricLabel}: 0/1`);
    await expect(page.getByTestId("lab-tr-next")).toContainText("マッドハウス");
  });

  test("whitespace-only reason is stored as no-reason and keeps user text canonical", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLab(page);

    await reasonField(page).fill("   ");
    await saveButton(page).click();
    await expect(status(page)).toHaveText(COPY.savedWithoutReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText(COPY.savedOriginalNone);

    await reasonField(page).fill("  間の静けさが好き  ");
    await saveButton(page).click();
    await expect(status(page)).toHaveText(COPY.savedWithReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText("間の静けさが好き");
    await expect(page.getByText("生成する")).toHaveCount(0);
    await expect(page.getByText("補完する")).toHaveCount(0);
    await expect(page.getByText(COPY.noAi)).toBeVisible();
  });

  test("spoiler unspecified and has-spoiler hide shared body; no-spoiler shows original", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);
    const original = "最終話の会話が好き";
    await reasonField(page).fill(original);

    await page.getByRole("radio", { name: COPY.visibilityShared }).check();
    await expect(page.locator(".lab-tr-page")).toHaveAttribute("data-visibility", "shared");
    await expect(page.getByTestId("lab-tr-share-preview")).toHaveText(COPY.shareHiddenSpoiler);
    await expect(page.getByTestId("lab-tr-share-body")).toHaveCount(0);

    await page.getByRole("radio", { name: COPY.spoilerYes }).check();
    await expect(page.getByTestId("lab-tr-share-preview")).toHaveText(COPY.shareHiddenSpoiler);

    await page.getByRole("radio", { name: COPY.spoilerNo }).check();
    await expect(page.getByTestId("lab-tr-share-body")).toHaveText(original);

    await page.getByRole("radio", { name: COPY.visibilityPrivate }).check();
    await expect(page.getByTestId("lab-tr-share-preview")).toHaveText(COPY.shareHiddenPrivate);
    await expect(page.getByTestId("lab-tr-share-body")).toHaveCount(0);
  });

  test("save states transition idle → saving → saved and error → retry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);
    const root = page.locator(".lab-tr-page");

    await expect(root).toHaveAttribute("data-save-status", "idle");
    await expect(saveButton(page)).toHaveText(COPY.save);

    await reasonField(page).fill("画面の空気が好き");
    await page.getByTestId("lab-tr-fail-next").check();

    const saveClick = saveButton(page).click();
    await expect(root).toHaveAttribute("data-save-status", "saving");
    await saveClick;
    await expect(status(page)).toHaveText(COPY.saveFailed);
    await expect(saveButton(page)).toHaveText(COPY.retry);
    await expect(reasonField(page)).toHaveValue("画面の空気が好き");

    await saveButton(page).click();
    await expect(status(page)).toHaveText(COPY.savedWithReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText("画面の空気が好き");
    await expect(root).toHaveAttribute("data-save-status", "saved");
    await expect(saveButton(page)).toHaveText(COPY.save);
  });

  test("Visual / Simple keep the same information and the one primary action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);

    await sharedControlsVisible(page);
    await expect(page.getByTestId("lab-tr-poster")).toBeVisible();
    await expect(page.locator(".lab-tr-page img")).toHaveCount(0);

    await page.getByTestId("lab-tr-mode-simple").click();
    await expect(page.locator(".lab-tr-page")).toHaveAttribute("data-display-mode", "simple");
    await sharedControlsVisible(page);
    await expect(page.getByTestId("lab-tr-poster")).toHaveCount(0);
    await expect(page.locator(".lab-tr-page img")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: LAB_ANIME_FIXTURES.sourced.titleJa })).toBeVisible();
    await expect(page.getByTestId("lab-tr-next")).toContainText("マッドハウス");

    await page.getByTestId("lab-tr-mode-visual").click();
    await expect(page.getByTestId("lab-tr-poster")).toBeVisible();
    await expect(saveButton(page)).toHaveText(COPY.save);
  });

  test("keyboard completes reason, spoiler, visibility, and save", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);

    await reasonField(page).focus();
    await page.keyboard.type("間の静けさが好き");
    await expect(reasonField(page)).toHaveValue("間の静けさが好き");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.getByRole("radio", { name: COPY.visibilityShared }).focus();
    await page.keyboard.press("Space");
    await saveButton(page).focus();
    await expect(saveButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(status(page)).toHaveText(COPY.savedWithReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText("間の静けさが好き");
  });

  test("320–430px and desktop keep 44px targets, focus, and no horizontal overflow", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const viewports = [
      ...MOBILE_WIDTHS.map((width) => ({ width, height: 844 })),
      { width: 1280, height: 800 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoLab(page);
      await sharedControlsVisible(page);

      await expectTapTarget(saveButton(page), `${viewport.width} save`);
      await expectTapTarget(page.getByTestId("lab-tr-mode-visual"), `${viewport.width} visual`);
      await expectTapTarget(page.getByTestId("lab-tr-mode-simple"), `${viewport.width} simple`);
      await expectTapTarget(spoilerChoice(page), `${viewport.width} spoiler`);

      const overflow = await readLabOverflow(page);
      expect(overflow.scrollWidth, `${viewport.width} overflow`).toBeLessThanOrEqual(
        overflow.clientWidth + 1
      );

      await page.getByTestId("lab-tr-fail-next").focus();
      await page.keyboard.press("Tab");
      await expect(saveButton(page)).toBeFocused();
      const outline = await saveButton(page).evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.outlineStyle} ${style.outlineWidth}`;
      });
      expect(outline, `${viewport.width} focus`).toMatch(/solid/);
    }
  });

  test("reduced motion disables primary transition and unsourced fixture stays unavailable", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLab(page);

    const duration = await saveButton(page).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(",").every((part) => part.trim() === "0s")).toBeTruthy();

    await page.getByTestId("lab-tr-fixture").selectOption("unsourced");
    await expect(page.getByRole("heading", { name: LAB_ANIME_FIXTURES.unsourced.titleJa })).toBeVisible();
    await expect(page.getByTestId("lab-tr-next")).toHaveText(COPY.nextUnavailable);
    await expect(page.getByText(COPY.nextUnavailableHint)).toBeVisible();
    await reasonField(page).fill("あ".repeat(REASON_MAX_LENGTH + 1));
    await expect(saveButton(page)).toBeDisabled();
    await expect(page.locator("#lab-tr-reason-count")).toHaveText(
      `${REASON_MAX_LENGTH + 1} / ${REASON_MAX_LENGTH}`
    );
    await expect(page.getByTestId("lab-tr-reason-error")).toHaveText(COPY.overLimit);
  });

  test("pending save ignores mutations so preview matches the saved snapshot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);
    const original = "画面の空気が好き";
    await reasonField(page).fill(original);
    await page.getByRole("radio", { name: COPY.spoilerNo }).check();
    await page.getByRole("radio", { name: COPY.visibilityShared }).check();
    await failNextBox(page).uncheck();
    await expect(failNextBox(page)).not.toBeChecked();

    const root = page.locator(".lab-tr-page");
    const saveClick = saveButton(page).click();
    await expect(root).toHaveAttribute("data-save-status", "saving");
    await expect(reasonField(page)).toBeDisabled();
    await expect(page.getByRole("radio", { name: COPY.spoilerYes })).toBeDisabled();
    await expect(page.getByRole("radio", { name: COPY.visibilityPrivate })).toBeDisabled();
    await expect(failNextBox(page)).toBeDisabled();
    await expect(page.getByTestId("lab-tr-share-body")).toHaveText(original);

    await reasonField(page)
      .fill("書き換え", { force: true })
      .catch(() => undefined);
    await page
      .getByRole("radio", { name: COPY.spoilerYes })
      .check({ force: true })
      .catch(() => undefined);
    await page
      .getByRole("radio", { name: COPY.visibilityPrivate })
      .check({ force: true })
      .catch(() => undefined);
    await failNextBox(page)
      .check({ force: true })
      .catch(() => undefined);
    await page.evaluate(() => {
      const field = document.querySelector(
        '[data-testid="lab-tr-reason"]'
      ) as HTMLTextAreaElement | null;
      const box = document.querySelector(
        '[data-testid="lab-tr-fail-next"]'
      ) as HTMLInputElement | null;
      if (field) {
        field.value = "書き換え";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (box) {
        box.checked = true;
        box.dispatchEvent(new Event("input", { bubbles: true }));
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await expect(root).toHaveAttribute("data-save-status", "saving");
    await expect(reasonField(page)).toHaveValue(original);
    await expect(failNextBox(page)).toBeDisabled();
    await expect(failNextBox(page)).not.toBeChecked();
    await expect(page.getByTestId("lab-tr-share-preview")).toHaveText(
      COPY.savedOriginalHeading
    );
    await expect(page.getByTestId("lab-tr-share-body")).toHaveText(original);
    await expect(root).toHaveAttribute("data-visibility", "shared");
    await expect(root).toHaveAttribute("data-spoiler", "no_spoiler");

    await saveClick;
    await expect(status(page)).toHaveText(COPY.savedWithReason);
    await expect(page.getByTestId("lab-tr-saved-reason")).toHaveText(original);
    await expect(page.getByTestId("lab-tr-share-body")).toHaveText(original);
    await expect(reasonField(page)).toHaveValue(original);
    await expect(reasonField(page)).toBeEnabled();
    await expect(failNextBox(page)).toBeEnabled();
    await expect(failNextBox(page)).not.toBeChecked();
  });

  test("over-limit textarea is aria-invalid with a live associated error", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoLab(page);

    await expect(reasonField(page)).toHaveAttribute("aria-invalid", "false");
    await reasonField(page).focus();
    await reasonField(page).fill("あ".repeat(REASON_MAX_LENGTH + 1));

    await expect(reasonField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(reasonField(page)).toHaveAttribute(
      "aria-errormessage",
      "lab-tr-reason-error"
    );
    const describedBy = await reasonField(page).getAttribute("aria-describedby");
    expect(describedBy?.split(/\s+/)).toContain("lab-tr-reason-error");
    const error = page.getByTestId("lab-tr-reason-error");
    await expect(error).toHaveText(COPY.overLimit);
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toHaveAttribute("aria-live", "assertive");
    await expect(error).toHaveAttribute("id", "lab-tr-reason-error");
    await expect(saveButton(page)).toBeDisabled();
    await expect(reasonField(page)).toBeFocused();
  });
});
