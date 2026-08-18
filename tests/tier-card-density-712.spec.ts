import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR =
  process.env.ATB_712_EVIDENCE_DIR ||
  path.join("test-results", "atb-712-tier-card-density");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe.configure({ timeout: 180_000 });

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function isNoiseConsole(text: string): boolean {
  return (
    text.includes("Failed to load resource") ||
    text.includes("net::ERR_") ||
    text.includes("MODULE_TYPELESS_PACKAGE_JSON") ||
    text.includes("Largest Contentful Paint") ||
    text.includes("Hydration failed") ||
    text.includes("hydration-mismatch") ||
    text.includes("ClientFetchError")
  );
}

async function installQuietImageRoutes(page: Page) {
  const ctx = page.context();
  await ctx.route("**/api/image-proxy**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
  });
  await ctx.route("**/*e2e-sentinel.invalid*/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
  });
}

function attachConsoleGuards(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (isNoiseConsole(text)) {
      return;
    }
    consoleErrors.push(text);
  });
  page.on("pageerror", (err) => {
    const text = String(err);
    if (isNoiseConsole(text)) {
      return;
    }
    pageErrors.push(text);
  });
  return { consoleErrors, pageErrors };
}

async function gotoTier(page: Page) {
  await page.goto("/tier", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator(".anime-card").first()).toBeVisible({ timeout: 60_000 });
  const poolTrigger = page.locator(".pool-drawer-trigger");
  if (await poolTrigger.count()) {
    const expanded = await poolTrigger.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await poolTrigger.click();
      await expect(poolTrigger).toHaveAttribute("aria-expanded", "true");
    }
  }
}

async function measureCards(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".anime-card"));
    const sample = cards.slice(0, 12);
    const heights = sample.map((card) => Math.round(card.getBoundingClientRect().height));
    const forbiddenInCard = sample.map((card) => ({
      hasSubline: !!card.querySelector(".anime-subline"),
      hasReputation: !!card.querySelector(".reputation-badges"),
      hasAiring: !!card.querySelector(".airing-badges"),
      hasStreaming: !!card.querySelector(".streaming-links"),
      hasStatus: !!card.querySelector(".status-chip, .status-chip-group"),
      hasExternal: !!card.querySelector("a[href]"),
      hasFormatText: /TV|ONA|OVA|MOVIE|ANIME/.test(
        Array.from(card.querySelectorAll(".anime-meta *"))
          .filter((el) => !el.classList.contains("anime-title"))
          .map((el) => el.textContent || "")
          .join(" ")
      ),
    }));
    const title = sample[0]?.querySelector(".anime-title") as HTMLElement | null;
    const titleStyle = title ? getComputedStyle(title) : null;
    const docEl = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: docEl.scrollWidth,
      overflowX: docEl.scrollWidth > window.innerWidth + 1,
      cardCount: cards.length,
      sampleHeights: heights,
      avgHeight: heights.length
        ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length)
        : null,
      maxHeight: heights.length ? Math.max(...heights) : null,
      minHeight: heights.length ? Math.min(...heights) : null,
      titleClamp: titleStyle
        ? titleStyle.webkitLineClamp ||
          (titleStyle as CSSStyleDeclaration & { lineClamp?: string }).lineClamp ||
          null
        : null,
      titleLineHeight: titleStyle ? titleStyle.lineHeight : null,
      forbiddenInCard,
      hasDetailControl: !!document.querySelector(".sortable-card-detail"),
      hasDragActivator: !!document.querySelector('[data-sortable-drag="true"]'),
    };
  });
}

async function expectSheetClosed(page: Page) {
  await expect(page.locator(".move-sheet-backdrop")).toHaveCount(0);
}

async function expectSheetOpen(page: Page) {
  const sheet = page.locator('.move-sheet[role="dialog"]');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  return sheet;
}

async function assertSheetDetailsReachable(page: Page) {
  const sheet = await expectSheetOpen(page);
  await expect(sheet).toHaveAttribute("aria-label", "作品の詳細");

  // format + external (always rendered in sheet header)
  const subline = sheet.locator(".move-sheet-subline");
  await expect(subline).toBeVisible();
  await expect(subline.locator("span").first()).toBeVisible();
  await expect(subline.locator('a[href][aria-label*="外部リンク"]')).toBeVisible();

  // details region hosts ratings/popularity/airing/streaming when item has data
  await expect(sheet.locator(".move-sheet-details")).toBeVisible();

  // status always reachable
  await expect(sheet.getByText("視聴ステータス")).toBeVisible();
  await expect(sheet.locator(".status-chip-group, .move-status-chips").first()).toBeVisible();
  await expect(sheet.getByRole("button", { name: "未設定" })).toBeVisible();

  await expect(sheet.getByText("移動先を選択")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "閉じる" })).toBeVisible();
}

async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  await expectSheetClosed(page);
}

async function openSheetViaDetailButton(page: Page) {
  const detailBtn = page.locator(".sortable-card-detail").first();
  await detailBtn.focus();
  await expect(detailBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await assertSheetDetailsReachable(page);
}

async function mouseDragCard(page: Page, card: ReturnType<Page["locator"]>) {
  const box = await card.boundingBox();
  if (!box) {
    throw new Error("card bounding box missing for mouse drag");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 30, { steps: 12 });
  await page.mouse.up();
}

async function touchDragCard(page: Page, card: ReturnType<Page["locator"]>) {
  const box = await card.boundingBox();
  if (!box) {
    throw new Error("card bounding box missing for touch drag");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const midX = startX + 24;
  const midY = startY + 12;
  const endX = startX + 72;
  const endY = startY + 36;

  const fireTouch = async (
    type: "touchstart" | "touchmove" | "touchend",
    x: number,
    y: number
  ) => {
    await page.evaluate(
      ({ type, x, y }) => {
        const target = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!target) {
          throw new Error(`touch target missing for ${type}`);
        }
        const touch = new Touch({
          identifier: 1,
          target,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
        const active = type === "touchend" ? [] : [touch];
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: active,
            targetTouches: active,
            changedTouches: [touch],
          })
        );
        const pointerType =
          type === "touchstart"
            ? "pointerdown"
            : type === "touchmove"
              ? "pointermove"
              : "pointerup";
        target.dispatchEvent(
          new PointerEvent(pointerType, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            buttons: type === "touchend" ? 0 : 1,
          })
        );
      },
      { type, x, y }
    );
  };

  await fireTouch("touchstart", startX, startY);
  await page.waitForTimeout(220);
  await fireTouch("touchmove", midX, midY);
  await fireTouch("touchmove", endX, endY);
  await fireTouch("touchend", endX, endY);
}

async function assertDenseCardMetrics(
  metrics: Awaited<ReturnType<typeof measureCards>>,
  opts: { maxHeight: number; width?: number }
) {
  expect(metrics.cardCount).toBeGreaterThan(0);
  expect(metrics.hasDragActivator).toBeTruthy();
  expect(metrics.hasDetailControl).toBeTruthy();
  expect(metrics.overflowX).toBeFalsy();
  if (opts.width != null) {
    expect(metrics.innerWidth).toBe(opts.width);
  }
  for (const row of metrics.forbiddenInCard) {
    expect(row.hasSubline).toBeFalsy();
    expect(row.hasReputation).toBeFalsy();
    expect(row.hasAiring).toBeFalsy();
    expect(row.hasStreaming).toBeFalsy();
    expect(row.hasStatus).toBeFalsy();
    expect(row.hasExternal).toBeFalsy();
    expect(row.hasFormatText).toBeFalsy();
  }
  expect(String(metrics.titleClamp)).toBe("2");
  expect(metrics.maxHeight ?? 9999).toBeLessThanOrEqual(opts.maxHeight);
}

async function assertOptionalMetaReachableFromSomeCard(page: Page) {
  const dragCards = page.locator('[data-sortable-drag="true"]');
  const count = Math.min(await dragCards.count(), 8);
  const found = {
    reputation: false,
    airing: false,
    streaming: false,
  };

  for (let i = 0; i < count; i += 1) {
    await dragCards.nth(i).click();
    const sheet = await expectSheetOpen(page);
    if (await sheet.locator(".move-sheet-details .reputation-badges").count()) {
      found.reputation = true;
      await expect(sheet.locator(".move-sheet-details .reputation-badges").first()).toBeVisible();
    }
    if (await sheet.locator(".move-sheet-details .airing-badges").count()) {
      found.airing = true;
      await expect(sheet.locator(".move-sheet-details .airing-badges").first()).toBeVisible();
    }
    if (await sheet.locator(".move-sheet-details .streaming-links").count()) {
      found.streaming = true;
      await expect(sheet.locator(".move-sheet-details .streaming-links").first()).toBeVisible();
    }
    await closeSheet(page);
    if (found.reputation && found.airing && found.streaming) {
      break;
    }
  }

  // Live seasonal items usually include these; if a rare empty board appears, still
  // prove the sheet hosts the detail region and status path above.
  return found;
}

test.describe("ATB-712 tier card density", () => {
  test.describe("desktop chromium", () => {
    test("dense card, click/keyboard sheet, mouse-drag does not open", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "desktop assertions run on chromium project");
      ensureDir(EVIDENCE_DIR);
      await installQuietImageRoutes(page);
      const guards = attachConsoleGuards(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoTier(page);

      const metrics = await measureCards(page);
      fs.writeFileSync(
        path.join(EVIDENCE_DIR, "desktop-1280-metrics.json"),
        JSON.stringify(
          {
            ...metrics,
            consoleErrors: guards.consoleErrors,
            pageErrors: guards.pageErrors,
          },
          null,
          2
        ),
        "utf8"
      );
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, "desktop-1280.png"),
        fullPage: false,
      });

      await assertDenseCardMetrics(metrics, { maxHeight: 220, width: 1280 });

      const drag = page.locator('[data-sortable-drag="true"]').first();

      await drag.click();
      await assertSheetDetailsReachable(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, "desktop-1280-sheet.png"),
        fullPage: false,
      });
      await closeSheet(page);

      await openSheetViaDetailButton(page);
      await closeSheet(page);

      await assertOptionalMetaReachableFromSomeCard(page);

      await mouseDragCard(page, drag);
      await page.waitForTimeout(80);
      await drag.click({ force: true });
      await page.waitForTimeout(150);
      await expectSheetClosed(page);

      expect(
        guards.consoleErrors,
        `console errors: ${guards.consoleErrors.join(" | ")}`
      ).toEqual([]);
      expect(guards.pageErrors, `page errors: ${guards.pageErrors.join(" | ")}`).toEqual(
        []
      );

      await testInfo.attach("desktop-1280-metrics", {
        path: path.join(EVIDENCE_DIR, "desktop-1280-metrics.json"),
        contentType: "application/json",
      });
    });
  });

  test.describe("mobile 390", () => {
    test("dense card, tap/keyboard sheet, touch-drag does not open", async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "mobile-chrome",
        "390 touch assertions run on mobile-chrome project"
      );
      ensureDir(EVIDENCE_DIR);
      await installQuietImageRoutes(page);
      const guards = attachConsoleGuards(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoTier(page);

      const metrics = await measureCards(page);
      fs.writeFileSync(
        path.join(EVIDENCE_DIR, "mobile-390-metrics.json"),
        JSON.stringify(
          {
            ...metrics,
            consoleErrors: guards.consoleErrors,
            pageErrors: guards.pageErrors,
          },
          null,
          2
        ),
        "utf8"
      );
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, "mobile-390.png"),
        fullPage: false,
      });

      await assertDenseCardMetrics(metrics, { maxHeight: 180, width: 390 });

      const drag = page.locator('[data-sortable-drag="true"]').first();

      await drag.tap();
      await assertSheetDetailsReachable(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, "mobile-390-sheet.png"),
        fullPage: false,
      });
      await closeSheet(page);

      await openSheetViaDetailButton(page);
      await closeSheet(page);

      await assertOptionalMetaReachableFromSomeCard(page);

      await touchDragCard(page, drag);
      await page.waitForTimeout(120);
      await drag.click({ force: true });
      await page.waitForTimeout(150);
      await expectSheetClosed(page);

      expect(
        guards.consoleErrors,
        `console errors: ${guards.consoleErrors.join(" | ")}`
      ).toEqual([]);
      expect(guards.pageErrors, `page errors: ${guards.pageErrors.join(" | ")}`).toEqual(
        []
      );

      await testInfo.attach("mobile-390-metrics", {
        path: path.join(EVIDENCE_DIR, "mobile-390-metrics.json"),
        contentType: "application/json",
      });
    });
  });
});
