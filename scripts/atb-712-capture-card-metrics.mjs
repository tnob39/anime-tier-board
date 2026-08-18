import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const phase = process.argv[2] === "after" ? "after" : "before";
const outDir = path.join("test-results", "atb-712-tier-card-density");
fs.mkdirSync(outDir, { recursive: true });

async function measure(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".anime-card")).slice(0, 12);
    const heights = cards.map((card) => Math.round(card.getBoundingClientRect().height));
    const sample = cards[0];
    const hasSubline = !!sample?.querySelector(".anime-subline");
    const hasReputation = !!sample?.querySelector(".reputation-badges");
    const hasAiring = !!sample?.querySelector(".airing-badges");
    const hasStreaming = !!sample?.querySelector(".streaming-links");
    const hasStatus = !!sample?.querySelector(".status-chip, .status-chip-group");
    const title = sample?.querySelector(".anime-title");
    const titleClamp = title
      ? getComputedStyle(title).webkitLineClamp || getComputedStyle(title).lineClamp
      : null;
    return {
      innerWidth: window.innerWidth,
      cardCount: document.querySelectorAll(".anime-card").length,
      sampleHeights: heights,
      avgHeight: heights.length
        ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length)
        : null,
      maxHeight: heights.length ? Math.max(...heights) : null,
      minHeight: heights.length ? Math.min(...heights) : null,
      hasSubline,
      hasReputation,
      hasAiring,
      hasStreaming,
      hasStatus,
      titleClamp,
      hasDragActivator: !!document.querySelector('[data-sortable-drag="true"]'),
      hasDetailControl: !!document.querySelector(".sortable-card-detail"),
    };
  });
}

async function runViewport(browser, width, height, label) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/tier", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "今期アニメTier表" }).waitFor({ timeout: 60000 });
  await page.locator(".anime-card").first().waitFor({ timeout: 60000 });
  // Ensure pool is open for denser cards when present
  const poolTrigger = page.locator(".pool-drawer-trigger");
  if (await poolTrigger.count()) {
    const expanded = await poolTrigger.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await poolTrigger.click();
    }
  }
  await page.waitForTimeout(800);
  const metrics = await measure(page);
  const shotPath = path.join(outDir, `${phase}-${label}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  await context.close();
  return { label, metrics, shotPath };
}

const browser = await chromium.launch({ headless: true });
try {
  const mobile = await runViewport(browser, 390, 844, "mobile-390");
  const desktop = await runViewport(browser, 1280, 800, "desktop-1280");
  const payload = { phase, capturedAt: new Date().toISOString(), mobile, desktop };
  const jsonPath = path.join(outDir, `${phase}-metrics.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
} finally {
  await browser.close();
}
