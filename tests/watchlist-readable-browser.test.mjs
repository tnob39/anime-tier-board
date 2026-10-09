import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "test-results", "watchlist-readable");
const baseline = process.env.WATCHLIST_BASELINE === "1";
let browser, bundle;
const styles = ["app/globals.css", "app/motion-standards.css", "components/ui/bottom-sheet.css", "components/display-mode/display-mode.css", "app/watchlist/watchlist-v2-grok.css"].map(file => readFileSync(path.join(root, file), "utf8")).join("\n");
before(async () => {
  mkdirSync(output, { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, target: "web", context: root,
      entry: path.join(root, "tests/watchlist-readable-browser-entry.tsx"), output: { path: output, filename: "feature.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      externals: { "next-auth/react": "window __watchlistAuth", "next/navigation": "window __watchlistNavigation", "next/link": "window __watchlistLink", "next/image": "window __watchlistImage" },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, "tests/impressions-tsx-loader.cjs") }] }
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  bundle = readFileSync(path.join(output, "feature.js"), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
});
after(async () => { await browser?.close(); });
const longTitle = "日本語のとても長い作品タイトル―異世界で出会った仲間たちと終わらない冒険を続ける物語 第二期";
const anime = (id, title, image = "cover.svg") => ({ id, source: "anilist", title, imageUrl: `https://watchlist.test/${image}`, proxiedImageUrl: `https://watchlist.test/${image}`, episodes: 12, seasonYear: 2026, season: "FALL" });
const items = [anime("anilist-1", longTitle), anime("anilist-2", "画像が失敗した作品", "broken.svg"), { ...anime("anilist-3", "画像がない作品"), imageUrl: null, proxiedImageUrl: null }].map(a => ({ animeId: a.id, anime: a, status: "watching", favoriteLevel: null, notes: "保存済みメモ", watchSlot: null, watchedEpisodes: 2, updatedAt: "2026-10-09T00:00:00Z" }));
async function harness({ width = 375, mode = "visual", theme = "light", textScale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const state = { images: [], writes: [], errors: [] };
  page.on("pageerror", e => state.errors.push(e.message));
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const fulfill = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/watchlist") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main class="app-main"><div id="root"></div></main></body></html>' });
    if (req.resourceType() === "image") {
      state.images.push(url.pathname);
      if (url.pathname === "/broken.svg") return route.fulfill({ status: 404, body: "missing" });
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="136"><rect width="96" height="136" fill="#42628f"/></svg>' });
    }
    if (url.pathname === "/api/boards/tiers") return fulfill({ tiers: {} });
    if (method !== "GET") {
      state.writes.push({ path: url.pathname, method, body: req.postData() ? req.postDataJSON() : null });
      if (url.pathname === "/api/watchlist/shares") return fulfill({ shareId: "fixture-share" });
      if (url.pathname === "/api/statuses" || url.pathname === "/api/watchlist") return fulfill({ ok: true });
    }
    state.errors.push(`Unexpected request: ${method} ${url.pathname}`);
    return route.abort();
  });
  await page.goto("https://watchlist.test/watchlist");
  await page.evaluate(({ mode, theme, items }) => {
    localStorage.setItem("numanie-display-mode", mode);
    document.documentElement.dataset.theme = theme;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async url => { window.copiedUrl = url; } } });
    window.fixture = { items, recommended: [ { ...items[0].anime, id: "anilist-4", title: "おすすめ作品" } ] };
  }, { mode, theme, items });
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: bundle });
  await expect(page.locator("html")).toHaveAttribute("data-display-mode", mode);
  await expect(page.locator(".wl2g-poster")).toHaveCount(3);
  if (textScale !== 1) await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, textScale);
  return { page, state, close: async () => { assert.deepEqual(state.errors, []); await context.close(); } };
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".wl2g-poster")].map(card => {
        const image = card.querySelector(".wl2g-artwork, .pic");
        const title = card.querySelector(".wl2g-ptitle");
        const t = rect(title), i = image ? rect(image) : null;
        const cs = getComputedStyle(title);
        return { title: t, image: i, overlap: !!i && t.x < i.right && t.right > i.x && t.y < i.bottom && t.bottom > i.y,
          fontSize: cs.fontSize, color: cs.color, padding: getComputedStyle(card).padding, borderRadius: getComputedStyle(card).borderRadius,
          controls: [...card.querySelectorAll("button")].map(rect) };
      }) };
  });
}
for (const width of [320, 375, 390, 1280]) for (const theme of ["light", "dark"]) for (const textScale of [1, 2]) {
  test(`${baseline ? "baseline" : "readable"}: ${width}px ${theme} ${textScale * 100}% text`, async () => {
    const h = await harness({ width, theme, textScale });
    try {
      const measured = await geometry(h.page);
      writeFileSync(path.join(output, `${baseline ? "baseline" : "proof"}-${width}-${theme}-${textScale}.json`), JSON.stringify(measured, null, 2));
      if (width === 375 && textScale === 1) await h.page.screenshot({ path: path.join(output, `${baseline ? "baseline" : "proof"}-${theme}.png`), fullPage: true });
      if (baseline) { console.log(JSON.stringify(measured)); return; }
      assert.ok(measured.scrollWidth <= width, JSON.stringify(measured));
      for (const card of measured.cards) {
        assert.equal(card.overlap, false);
        assert.ok(parseFloat(card.fontSize) >= 16 * textScale);
        for (const control of card.controls) assert.ok(control.width >= 44 && control.height >= 44);
      }
      await h.page.locator(".wl2g-more-trigger").first().click();
      for (const button of await h.page.locator(".wl2g-more-panel button").all()) {
        const r = await button.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44, JSON.stringify({ r, css: await button.evaluate(el => ({ height: getComputedStyle(el).height, transform: getComputedStyle(el).transform, parent: getComputedStyle(el.parentElement).transform } )) }));
      }
      assert.ok(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await h.close(); }
  });
}
test("Simple has no image DOM or requests; Visual positive control and failed-image fallback", { skip: baseline }, async () => {
  for (const mode of ["simple", "visual"]) {
    const h = await harness({ mode });
    try {
      if (mode === "simple") { assert.equal(await h.page.locator("img").count(), 0); assert.equal(h.state.images.length, 0); }
      else {
        await expect.poll(() => h.state.images.length).toBeGreaterThan(0);
        await expect(h.page.locator('.wl2g-poster').filter({ hasText: "画像が失敗した作品" }).locator('.wl2g-artwork[data-image-state="error"]')).toHaveCount(1);
        await expect(h.page.locator('.wl2g-poster').filter({ hasText: "画像がない作品" }).locator('.wl2g-artwork[data-image-state="error"]')).toHaveCount(1);
        await expect(h.page.locator('.wl2g-artwork[data-image-state="loaded"]')).toHaveCount(1);
        assert.equal(await h.page.locator(".wl2g-artwork img").count(), 1);
        assert.equal(await h.page.locator('.wl2g-artwork[data-image-state="error"] img').count(), 0);
      }
    } finally { await h.close(); }
  }
});
test("editor preserves status, explicit memo save, delete and share", { skip: baseline }, async () => {
  const h = await harness({ mode: "simple" });
  try {
    await h.page.getByRole("button", { name: `${longTitle}の詳細を開く`, exact: true }).click();
    const dialog = h.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText(longTitle);
    await dialog.getByRole("button", { name: "完了", exact: true }).click();
    await expect.poll(() => h.state.writes.length).toBe(1);
    assert.equal(h.state.writes[0].body.status, "completed");
    await dialog.getByLabel("メモ", { exact: true }).fill("明示保存した日本語メモ");
    assert.equal(h.state.writes.length, 1);
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect.poll(() => h.state.writes.length).toBe(3);
    // Existing explicit save repeats the status PUT because the open editor
    // retains its original record until tracking has successfully saved.
    assert.deepEqual(h.state.writes.map(({ path, method }) => ({ path, method })), [
      { path: "/api/statuses", method: "PUT" },
      { path: "/api/statuses", method: "PUT" },
      { path: "/api/watchlist", method: "PUT" },
    ]);
    assert.equal(h.state.writes[1].body.status, "completed");
    assert.equal(h.state.writes[2].body.notes, "明示保存した日本語メモ");
    await expect(dialog.getByRole("button", { name: "保存する", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await h.page.getByRole("button", { name: "共有", exact: true }).click();
    await expect.poll(() => h.state.writes.length).toBe(4);
    assert.equal(h.state.writes[3].path, "/api/watchlist/shares");
    assert.equal(h.state.writes[3].method, "POST");
    await expect(h.page.getByRole("link", { name: /fixture-share/ })).toBeVisible();
    h.page.on("dialog", d => d.accept());
    await h.page.locator(".wl2g-more-trigger").first().click();
    await h.page.getByRole("menuitem", { name: "マイリストから削除" }).click();
    await expect(h.page.locator(".wl2g-poster")).toHaveCount(2);
    await expect.poll(() => h.state.writes.length).toBe(5);
    assert.equal(h.state.writes[4].path, "/api/statuses");
    assert.equal(h.state.writes[4].method, "DELETE");
  } finally { await h.close(); }
});
