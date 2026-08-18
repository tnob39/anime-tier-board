import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR =
  process.env.ATB_713_EVIDENCE_DIR ||
  path.join("test-results", "atb-713-tier-toolbar");

test.describe.configure({ timeout: 120_000 });

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function gotoTier(page: Page) {
  await page.goto("/tier", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".control-bar")).toBeVisible({ timeout: 30_000 });
}

async function measureToolbar(page: Page) {
  return page.evaluate(() => {
    const controlBar = document.querySelector(".control-bar");
    const season = document.querySelector(".control-bar-season");
    const actions = document.querySelector(".control-bar-actions");
    const year = document.querySelector(".control-bar-season .field");
    const reload = document.querySelector(
      '.control-bar-actions > .command-button[title="再取得"]'
    );
    const share = document.querySelector(
      '.control-bar-actions > .command-button[title="共有URLを作成"]'
    );
    const more = document.querySelector(
      '.control-bar-actions .command-button[title="その他の操作"]'
    );

    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controlBar: rect(controlBar),
      season: rect(season),
      actions: rect(actions),
      year: rect(year),
      reload: rect(reload),
      share: rect(share),
      more: rect(more),
    };
  });
}

test.describe("ATB-713 Tier toolbar mobile grouping", () => {
  test("390px keeps more button with action peers and 44px targets", async ({
    page,
  }, testInfo) => {
    ensureDir(EVIDENCE_DIR);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoTier(page);

    const metrics = await measureToolbar(page);
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, "toolbar-390.json"),
      JSON.stringify(metrics, null, 2),
      "utf8"
    );
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "toolbar-390.png"),
      fullPage: false,
    });
    await testInfo.attach("toolbar-390.json", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });
    await testInfo.attach("toolbar-390.png", {
      path: path.join(EVIDENCE_DIR, "toolbar-390.png"),
      contentType: "image/png",
    });

    expect(metrics.innerWidth).toBe(390);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(390 + 1);
    expect(metrics.season).toBeTruthy();
    expect(metrics.actions).toBeTruthy();
    expect(metrics.reload).toBeTruthy();
    expect(metrics.share).toBeTruthy();
    expect(metrics.more).toBeTruthy();

    // Intentional two rows: season group above actions group.
    expect(metrics.season!.bottom).toBeLessThanOrEqual(metrics.actions!.top + 1);

    // More must share the action row with reload/share (not orphaned alone below).
    const actionTops = [metrics.reload!.top, metrics.share!.top, metrics.more!.top];
    expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(2);

    for (const target of [metrics.year, metrics.reload, metrics.share, metrics.more]) {
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }

    const moreBtn = page.getByRole("button", { name: "その他" });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    const menuTargets = [
      page.getByRole("button", { name: "映画OFF" }),
      page.getByRole("button", { name: "旧作OFF" }),
      page.getByRole("button", { name: "自動配置" }),
      page.getByRole("button", { name: "リセット" }),
    ];
    for (const target of menuTargets) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }

    await menuTargets[0].click();
    await expect(menuTargets[0]).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
  });

  test("desktop keeps season and actions groups operable without overflow", async ({
    page,
  }, testInfo) => {
    ensureDir(EVIDENCE_DIR);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoTier(page);

    const metrics = await measureToolbar(page);
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, "toolbar-desktop.json"),
      JSON.stringify(metrics, null, 2),
      "utf8"
    );
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "toolbar-desktop.png"),
      fullPage: false,
    });
    await testInfo.attach("toolbar-desktop.json", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });
    await testInfo.attach("toolbar-desktop.png", {
      path: path.join(EVIDENCE_DIR, "toolbar-desktop.png"),
      contentType: "image/png",
    });

    expect(metrics.innerWidth).toBe(1280);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(1280 + 1);
    expect(metrics.season).toBeTruthy();
    expect(metrics.actions).toBeTruthy();
    expect(metrics.more).toBeTruthy();
    expect(metrics.more!.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByRole("button", { name: "再取得" })).toBeVisible();
    await expect(page.getByRole("button", { name: "共有" })).toBeVisible();
    await expect(page.getByRole("button", { name: "その他" })).toBeVisible();
  });
});
