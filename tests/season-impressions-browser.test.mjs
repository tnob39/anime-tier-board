import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "test-results", "impressions-offline");
let browser;
let bundle;
const styles = ["app/globals.css", "components/ui/bottom-sheet.css", "components/display-mode/display-mode.css", "components/tier-area-nav.css", "app/tier/impressions/impressions.css"]
  .map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
before(async () => {
  mkdirSync(output, { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, target: "web", context: root,
      entry: path.join(root, "tests/impressions-browser-entry.tsx"),
      output: { path: output, filename: "feature.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      externals: { "next-auth/react": "window __impressionAuth", "next/navigation": "window __impressionNavigation", "next/link": "window __impressionLink", "next/image": "window __impressionImage" },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, "tests/impressions-tsx-loader.cjs") }] }
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  bundle = readFileSync(path.join(output, "feature.js"), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
});
after(async () => { await browser?.close(); });

const anime = (id, title) => ({ id, source: "anilist", title, imageUrl: "https://s4.anilist.co/cover.jpg" });
const candidates = [anime("anilist-1", "日本語アニメ一"), anime("anilist-2", "日本語アニメ二")];
function record(item = candidates[0], extra = {}) {
  return { year: 2026, season: "FALL", anime: item, revision: 1, note: null, rating: null, spoiler: "unspecified", checkedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...extra };
}
async function viewCard(page) {
  const entry = page.getByRole("button", { name: "自分の今期カードを見る", exact: true });
  if (await entry.isVisible()) await entry.click();
  await expect(page.getByRole("heading", { name: /年.+、いまのわたし/ })).toBeVisible();
}
async function findWork(page, name = /日本語アニメ一/) {
  await page.getByRole("button", { name: "次の作品に一言", exact: true }).click();
  await page.getByRole("button", { name: "作品を探す", exact: true }).click();
  await page.getByRole("button", { name }).click();
}
async function harness({ guest = false, mode = "simple", initialRecords = [], width = 375, items = candidates, catalogStatus = 200, privateStatus = 200 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = { records: initialRecords, deletedRevisions: [], shares: [], writes: [], images: 0, failSave: false, expired: false, denyReads: false, conflict: false, failHistory: false, publishStatus: 200, catalogStatus, privateStatus };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/test") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/image-proxy") { state.images += 1; return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="gray"/></svg>' }); }
    if (url.pathname === "/api/anime/seasonal") return state.catalogStatus !== 200 ? fulfill({ error: "catalog unavailable" }, state.catalogStatus)
      : fulfill({ items, source: "anilist", cached: true, year: Number(url.searchParams.get("year")), season: url.searchParams.get("season") });
    if (url.pathname === "/api/season-impressions" && method === "GET") return state.denyReads
      ? fulfill({ error: "元のアカウントでログインし直してください。" }, 401)
      : state.privateStatus !== 200 ? fulfill({ error: "private records unavailable" }, state.privateStatus)
      : fulfill({ impressions: state.records.filter((entry) => entry.year === Number(url.searchParams.get("year")) && entry.season === url.searchParams.get("season")), deletedRevisions: state.deletedRevisions });
    if (method !== "GET") state.writes.push({ url: url.pathname, method, body: request.postDataJSON(), owner: request.headers()["x-impression-owner"] });
    if (url.pathname.startsWith("/api/season-impressions/") && method === "PUT") {
      if (state.expired) return fulfill({ error: "ログインが必要です。" }, 401);
      if (state.failSave) return fulfill({ error: "保存に失敗しました。再試行してください。" }, 503);
      if (state.conflict) return fulfill({ error: "別の画面で変更されています。" }, 409);
      const body = request.postDataJSON();
      const saved = record(body.anime, { ...body, revision: body.revision + 1 });
      state.records = [...state.records.filter((entry) => entry.anime.id !== body.anime.id), saved];
      return fulfill({ impression: saved });
    }
    if (url.pathname.startsWith("/api/season-impressions/") && method === "DELETE") {
      const animeId = url.pathname.split("/").at(-1);
      const cursor = { animeId, revision: request.postDataJSON().revision + 1 };
      state.records = state.records.filter((entry) => entry.anime.id !== animeId);
      state.deletedRevisions = [...state.deletedRevisions.filter((entry) => entry.animeId !== animeId), cursor];
      return fulfill({ ok: true, cursor });
    }
    if (url.pathname === "/api/shares" && method === "GET") return state.failHistory ? fulfill({ error: "履歴の取得に失敗しました。" }, 503) : fulfill({ shares: state.shares });
    if (url.pathname === "/api/shares" && method === "POST") {
      if (state.publishStatus !== 200) return fulfill({ error: "公開に失敗しました。" }, state.publishStatus);
      const body = request.postDataJSON();
      state.shares.push({ shareId: "public-1", createdAt: "2026-10-02T00:00:00Z", year: body.year, season: body.season });
      return fulfill({ shareId: "public-1" });
    }
    if (url.pathname.startsWith("/api/shares/") && method === "DELETE") { state.shares = []; return fulfill({ ok: true }); }
    errors.push(`Unexpected request ${method} ${url.pathname}`);
    return route.abort();
  });
  // Every URL is fulfilled/aborted in-process; there is no HTTP server or outbound request.
  await page.goto("https://impressions.test/test?year=2026&season=FALL");
  await page.evaluate(({ guest, mode }) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedUrl = text; } } });
    localStorage.setItem("numanie-display-mode", mode);
    document.documentElement.dataset.theme = "light";
    window.fixture = { path: "/tier/impressions", seasonKey: { year: 2026, season: "FALL" }, mount: 1,
      session: guest ? { status: "unauthenticated", data: null } : { status: "authenticated", data: { user: { id: "owner" } } } };
  }, { guest, mode });
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("heading", { name: "今期チェック", exact: true })).toBeVisible();
  if (privateStatus === 200 && ((catalogStatus === 200 && items.length) || initialRecords.length)) await expect(page.getByRole("list", { name: "一言を書く候補" }).getByRole("button").first()).toBeEnabled();
  else await expect(page.getByText("作品と記録を読み込んでいます…", { exact: true })).toHaveCount(0);
  return { page, state, errors, close: async () => { assert.deepEqual(errors, []); await context.close(); } };
}

test("375px Simple: retry retains draft/card, save alone activates, reopen/edit/delete and keyboard work", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    assert.equal(await page.locator("img").count(), 0);
    assert.equal(state.images, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, "mobile-simple.png"), fullPage: true });
    await page.getByRole("button", { name: /日本語アニメ一/ }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("いまの一言").fill("保持する😀感想");
    await dialog.getByText("評価を添える（任意）", { exact: true }).click();
    await dialog.getByLabel("自分には合わない", { exact: true }).check();
    state.failSave = true;
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("保存結果を確認できませんでした");
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("保持する😀感想");
    await expect(page.getByRole("button", { name: /日本語アニメ一.*未記録/ })).toHaveClass("impressions-card");
    state.failSave = false;
    await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
    await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
    assert.equal(state.writes.length, 1);
    await dialog.getByRole("button", { name: "保存する" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /日本語アニメ一.*記録済み/ })).toHaveClass(/impressions-card--checked/);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一.*記録済み/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("保持する😀感想");
    await expect(dialog.getByLabel("自分には合わない", { exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("0作品を記録", { exact: true })).toBeVisible();
    assert.ok(state.writes.every((entry) => entry.url.startsWith("/api/season-impressions/")));
    assert.equal(state.images, 0);
  } finally { await h.close(); }
});

test("later is session-only and conflict recovery preserves input until explicit resave", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("いまの一言").fill("あとで保存");
    await dialog.getByRole("button", { name: "今回は書かない" }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes.length, 0);
    await page.getByRole("button", { name: "作品を探す", exact: true }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("あとで保存");
    state.conflict = true;
    state.records = [record(candidates[0], { revision: 2, note: "別の編集" })];
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
    await expect(dialog.getByText(/最新の記録：.*別の編集/)).toBeVisible();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("あとで保存");
    await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
    assert.equal(state.writes.length, 1);
    state.conflict = false;
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[1].body.revision, 2);
    assert.equal(state.writes[1].body.note, "あとで保存");
  } finally { await h.close(); }
});

for (const operation of ["save", "delete"]) {
  test(`same owner/season: delayed retry GET cannot overwrite successful ${operation}`, async () => {
    const original = record(candidates[0], { note: "OLDER_RECORD" });
    const h = await harness({ initialRecords: [original], catalogStatus: 503 });
    const { page, state } = h;
    try {
      const held = [];
      await page.route("**/api/season-impressions?year=2026&season=FALL", (route) => { held.push(route); });
      // Two queued retries can overlap before React commits the disabled button.
      await page.getByRole("button", { name: "読み込みを再試行" }).evaluate((button) => { button.click(); button.click(); });
      await expect.poll(() => held.length).toBe(2);
      for (const route of held) assert.equal(route.request().headers()["x-impression-owner"], "owner");
      await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeDisabled();
      assert.equal(state.writes.length, 0);
      await held[1].fulfill({ json: { impressions: [original], deletedRevisions: [] } });
      await expect(page.getByText("作品と記録を読み込んでいます…", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      const dialog = page.getByRole("dialog");
      if (operation === "save") {
        await dialog.getByLabel("いまの一言").fill("SUCCESSFUL_SAVE");
        await dialog.getByRole("button", { name: "保存する", exact: true }).click();
      } else {
        await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
        await dialog.getByRole("button", { name: "削除を確定する" }).click();
      }
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText(`${operation === "save" ? 1 : 0}作品を記録`, { exact: true })).toBeVisible();
      assert.equal(state.writes.length, 1);
      assert.equal(state.writes[0].method, operation === "save" ? "PUT" : "DELETE");
      assert.equal(state.writes[0].body.revision, 1);
      const finished = page.waitForEvent("requestfinished", (request) => request === held[0].request());
      await Promise.all([held[0].fulfill({ json: { impressions: [original], deletedRevisions: [] } }), finished]);
      await expect(page.getByText(`${operation === "save" ? 1 : 0}作品を記録`, { exact: true })).toBeVisible();
      await expect(page.getByText("OLDER_RECORD", { exact: true })).toHaveCount(0);
      if (operation === "save") await page.getByRole("button", { name: /日本語アニメ一.*SUCCESSFUL_SAVE/ }).click();
      else {
        await page.getByRole("button", { name: "次の作品に一言", exact: true }).click();
        await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      }
      await expect(dialog.getByLabel("いまの一言")).toHaveValue(operation === "save" ? "SUCCESSFUL_SAVE" : "");
      await dialog.getByLabel("いまの一言").fill("NEXT_EXPLICIT_SAVE");
      await dialog.getByRole("button", { name: "保存する", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      assert.equal(state.writes[1].body.revision, 2, "saved revision or deletion tombstone survives the late GET");
    } finally { await h.close(); }
  });
}

test("reload blocks an open editor's save/delete handlers until both records and catalog settle", async () => {
  const original = record(candidates[0], { note: "保存前" });
  const h = await harness({ initialRecords: [original], catalogStatus: 503 });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("いまの一言").fill("保持する入力");
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    let records, catalog;
    await page.route("**/api/season-impressions?year=2026&season=FALL", (route) => { records = route; });
    await page.route("**/api/anime/seasonal**", (route) => { catalog = route; });
    // Exercise a reload already queued while the editor is open, including handler-level barriers.
    await page.getByRole("button", { name: "読み込みを再試行" }).evaluate((button) => button.click());
    await expect.poll(() => !!records && !!catalog).toBe(true);
    const save = dialog.getByRole("button", { name: "保存する", exact: true });
    const remove = dialog.getByRole("button", { name: "削除を確定する" });
    for (const button of [save, remove]) {
      await expect(button).toBeDisabled();
      await button.dispatchEvent("click");
    }
    assert.equal(state.writes.length, 0);
    await records.fulfill({ json: { impressions: [original], deletedRevisions: [] } });
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    for (const button of [save, remove]) {
      await expect(button).toBeDisabled();
      await button.dispatchEvent("click");
    }
    assert.equal(state.writes.length, 0, JSON.stringify(state.writes));
    await catalog.fulfill({ status: 503, json: { error: "catalog unavailable" } });
    await expect(save).toBeEnabled();
    await expect(remove).toBeEnabled();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("保持する入力");
    await save.click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes.length, 1);
  } finally { await h.close(); }
});

for (const failure of ["503", "lost", "409"]) for (const navigation of ["close", "skip", "switch"]) {
  test(`${failure} PUT stays unresolved per draft after ${navigation}, GET and explicit continuation are required`, async () => {
    const h = await harness({ initialRecords: [record(), record(candidates[1])] });
    const { page, state } = h;
    try {
      await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("いまの一言").fill("保持する下書き");
      await page.route("**/api/season-impressions/anilist-1", (route) => {
        state.writes.push({ method: route.request().method(), body: route.request().postDataJSON() });
        state.records[0] = record(candidates[0], { revision: 2, note: "SERVER_LATEST" });
        return failure === "lost" ? route.abort("failed") : route.fulfill({ status: Number(failure), json: { error: "最新の記録を確認してください。" } });
      }, { times: 1 });
      await dialog.getByRole("button", { name: "保存する", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" })).toBeEnabled();
      await dialog.getByRole("button", { name: navigation === "skip" ? "今回は書かない" : "閉じる", exact: true }).click();
      if (navigation === "switch") {
        await page.getByRole("button", { name: /日本語アニメ二/ }).click();
        await dialog.getByLabel("いまの一言").fill("別作品の下書き");
        await expect(dialog.getByRole("button", { name: "保存する", exact: true })).toBeEnabled();
        await expect(dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" })).toHaveCount(0);
        await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
      }
      await page.getByRole("button", { name: "作品を探す", exact: true }).click();
      await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      const save = dialog.getByRole("button", { name: "保存する", exact: true });
      await expect(dialog.getByLabel("いまの一言")).toHaveValue("保持する下書き");
      await expect(save).toBeDisabled();
      await save.dispatchEvent("click");
      await expect(dialog.getByRole("button", { name: "記録を削除", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "現在の入力で編集を続ける" })).toHaveCount(0);
      assert.equal(state.writes.length, 1);
      let held;
      await page.route("**/api/season-impressions?year=2026&season=FALL", (route) => { held = route; }, { times: 1 });
      await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
      await expect.poll(() => !!held).toBe(true);
      await expect(dialog.getByRole("button", { name: "現在の入力で編集を続ける" })).toHaveCount(0);
      assert.equal(state.writes.length, 1);
      await held.fulfill({ json: { impressions: state.records, deletedRevisions: [] } });
      await expect(dialog.getByText(/最新の記録：.*SERVER_LATEST/)).toBeVisible();
      await expect(save).toBeDisabled();
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
      await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      await expect(save).toBeDisabled();
      await expect(dialog.getByLabel("いまの一言")).toHaveValue("保持する下書き");
      await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
      await expect(save).toBeEnabled();
      assert.equal(state.writes.length, 1);
      await save.click();
      await expect(dialog).toHaveCount(0);
      assert.equal(state.writes.length, 2);
      assert.equal(state.writes[1].body.revision, 2);
      assert.equal(state.writes[1].body.note, "保持する下書き");
      assert.equal(state.records[0].anime.id, candidates[1].id);
      assert.equal(state.records[0].note, null, "switching drafts never writes the other input");
    } finally { await h.close(); }
  });
}

test("failed reconciliation and switching between unresolved save/delete drafts cannot clear either operation", async () => {
  const h = await harness({ initialRecords: [record(), record(candidates[1])] });
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    const reconcile = dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" });
    const resume = dialog.getByRole("button", { name: "現在の入力で編集を続ける" });
    const save = dialog.getByRole("button", { name: "保存する", exact: true });
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("いまの一言").fill("未解決の保存");
    state.failSave = true;
    await save.click();
    await expect(reconcile).toBeEnabled();
    state.failSave = false;
    state.privateStatus = 503;
    await reconcile.click();
    await expect(dialog.getByRole("alert")).toContainText("private records unavailable");
    await expect(resume).toHaveCount(0);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    state.privateStatus = 200;
    await page.getByRole("button", { name: "読み込みを再試行" }).click();
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await dialog.getByLabel("いまの一言").fill("未解決の削除");
    await page.route("**/api/season-impressions/anilist-2", (route) => {
      assert.equal(route.request().method(), "DELETE");
      state.writes.push({ method: "DELETE", body: route.request().postDataJSON() });
      state.records = state.records.filter((entry) => entry.anime.id !== candidates[1].id);
      state.deletedRevisions = [{ animeId: candidates[1].id, revision: 2 }];
      return route.abort("failed");
    }, { times: 1 });
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog.getByRole("alert")).toContainText("削除結果を確認できませんでした");
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(save).toBeDisabled();
    await expect(resume).toHaveCount(0);
    await reconcile.click();
    await expect(resume).toBeEnabled();
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("削除結果を確認できませんでした");
    await expect(save).toBeDisabled();
    await expect(resume).toHaveCount(0);
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("未解決の削除");
    await reconcile.click();
    await expect(dialog.getByText("最新の記録：保存された記録はありません")).toBeVisible();
    await resume.click();
    assert.equal(state.writes.length, 2);
    await save.click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[2].body.revision, 2, "recreation uses the reconciled tombstone");
    await findWork(page);
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("未解決の保存");
    await expect(save).toBeDisabled();
    await expect(resume, "another read/write invalidates the first draft's old reconciliation").toHaveCount(0);
    await reconcile.click();
    await resume.click();
    assert.equal(state.writes.length, 3);
    await save.click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes.length, 4);
    assert.equal(state.writes[3].body.revision, 1);
  } finally { await h.close(); }
});

test("guest login returns to same season/anime/draft and never saves automatically", async () => {
  const h = await harness({ guest: true });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("いまの一言").fill("ログイン後に残る😀");
    await dialog.getByText("評価を添える（任意）", { exact: true }).click();
    await dialog.getByLabel("好き", { exact: true }).check();
    await dialog.getByLabel("ネタバレなし（共有時に選べます）", { exact: true }).check();
    await dialog.getByRole("button", { name: "Googleでログインして保存へ" }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.redirectTo)).toMatch(/^\/tier\/impressions\?year=2026&season=FALL&resume=/);
    assert.equal(state.writes.length, 0);
    await page.evaluate(() => {
      window.fixture.resumeToken = new URL(window.fixture.redirectTo, location.origin).searchParams.get("resume");
      window.fixture.session = { status: "authenticated", data: { user: { id: "owner" } } };
      window.fixture.mount += 1;
      window.renderImpressions();
    });
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ一");
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("ログイン後に残る😀");
    await expect(dialog.getByLabel("好き", { exact: true })).toBeChecked();
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes.length, 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:auth-draft:v2")), null);
  } finally { await h.close(); }
});

async function sessionTransition(page, userId, { loading = false, remount = false, returnToken = false } = {}) {
  await page.evaluate(({ userId, loading, remount, returnToken }) => {
    window.fixture.session = loading ? { status: "loading", data: null }
      : userId ? { status: "authenticated", data: { user: { id: userId } } } : { status: "unauthenticated", data: null };
    if (returnToken) window.fixture.resumeToken = new URL(window.fixture.redirectTo, location.origin).searchParams.get("resume");
    if (remount) window.fixture.mount++;
    window.renderImpressions();
  }, { userId, loading, remount, returnToken });
}

test("session expiry through loading/guest/remount preserves all A drafts and restores only after A reauth", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("いまの一言").fill("Aの非公開メモ😀");
    await dialog.getByRole("button", { name: "今回は書かない" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await dialog.getByLabel("いまの一言").fill("あ".repeat(141));
    await sessionTransition(page, null, { loading: true });
    await expect(dialog).not.toBeVisible();
    await sessionTransition(page, null);
    await expect(page.getByRole("button", { name: "元のアカウントで再ログイン" })).toBeVisible();
    assert.ok(!(await page.content()).includes("Aの非公開メモ"));
    await page.getByRole("button", { name: "元のアカウントで再ログイン" }).click();
    assert.equal(await page.evaluate(() => window.fixture.redirectTo), "/tier/impressions?year=2026&season=FALL");
    assert.equal(state.writes.length, 0);
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("あ".repeat(141));
    await expect(dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("Aの非公開メモ😀");
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[0].owner, "owner");
    const stored = await page.evaluate(() => sessionStorage.getItem("numanie:impressions:owner-drafts:v2:owner:2026:FALL"));
    assert.ok(!stored.includes("Aの非公開メモ"), "successful save clears the persisted input");
  } finally { await h.close(); }
});

test("401 reauth A-to-B cannot restore or write A input; returning as A still restores it", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("いまの一言").fill("PRIVATE_ACCOUNT_A");
    state.expired = true;
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("ログインが必要");
    await dialog.getByRole("button", { name: "Googleでログインして保存へ" }).click();
    const handoff = await page.evaluate(() => JSON.parse(sessionStorage.getItem("numanie:impressions:auth-draft:v2")));
    assert.equal(handoff.ownerId, "owner");
    assert.ok(!(await page.evaluate(() => window.fixture.redirectTo)).includes("PRIVATE_ACCOUNT_A"));
    await sessionTransition(page, null);
    await expect(dialog).not.toBeVisible();
    await sessionTransition(page, "account-b", { remount: true, returnToken: true });
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    await expect(dialog).not.toBeVisible();
    assert.ok(!(await page.content()).includes("PRIVATE_ACCOUNT_A"));
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("");
    await dialog.getByLabel("いまの一言").fill("ACCOUNT_B_INPUT");
    state.expired = false;
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[1].owner, "account-b");
    assert.equal(state.writes[1].body.note, "ACCOUNT_B_INPUT");
    assert.ok(state.writes.filter((write) => write.owner === "account-b").every((write) => !JSON.stringify(write.body).includes("PRIVATE_ACCOUNT_A")));
    state.records = [];
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("PRIVATE_ACCOUNT_A");
    assert.equal(state.writes.length, 2);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:auth-draft:v2")), null);
  } finally { await h.close(); }
});

test("guest token is mandatory, consumed on claim, and cannot be replayed as another account before save", async () => {
  const h = await harness({ guest: true });
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("いまの一言").fill("GUEST_THEN_A");
    await dialog.getByRole("button", { name: "Googleでログインして保存へ" }).click();
    await sessionTransition(page, "owner", { remount: true });
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    await expect(dialog).not.toBeVisible();
    await sessionTransition(page, "owner", { remount: true, returnToken: true });
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("GUEST_THEN_A");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:auth-draft:v2")), null);
    await sessionTransition(page, "account-b", { remount: true, returnToken: true });
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("");
    assert.equal(state.writes.length, 0);
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("GUEST_THEN_A");
  } finally { await h.close(); }
});

test("stale client session cannot restore private draft when the server denies the owner", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("いまの一言").fill("SERVER_MUST_CONFIRM_OWNER");
    state.denyReads = true;
    await sessionTransition(page, "owner", { remount: true });
    await expect(page.getByRole("button", { name: "元のアカウントで再ログイン" })).toBeVisible();
    await expect(dialog).not.toBeVisible();
    assert.ok(!(await page.content()).includes("SERVER_MUST_CONFIRM_OWNER"));
    assert.equal(state.writes.length, 0);
    state.denyReads = false;
    await page.getByRole("button", { name: "読み込みを再試行" }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("SERVER_MUST_CONFIRM_OWNER");
  } finally { await h.close(); }
});

test("fresh editor after delete and reload gets the tombstone revision from owner GET", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:owner-drafts:v2:owner:2026:FALL")), null);
    await sessionTransition(page, "owner", { remount: true });
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[1].body.revision, 2);
    assert.equal(state.writes[1].owner, "owner");
  } finally { await h.close(); }
});

test("delete response, reload and conflict resolution use tombstone cursors for intentional recreation", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    await findWork(page);
    await dialog.getByLabel("いまの一言").fill("再作成");
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[1].body.revision, 2, "DELETE response supplies the cursor");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    state.conflict = true; state.records = []; state.deletedRevisions = [{ animeId: "anilist-1", revision: 4 }];
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
    await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
    state.conflict = false;
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("再作成");
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes[3].body.revision, 4, "explicit conflict acknowledgement survives reload");
  } finally { await h.close(); }
});

test("explicit share preview omits private/spoiler notes; URL creation and owner stop work", async () => {
  const h = await harness({ initialRecords: [record(candidates[0], { rating: "liked", note: "公開する一言", spoiler: "no_spoiler" }), record(candidates[1], { note: "PRIVATE_SPOILER", spoiler: "has_spoiler" })] });
  const { page, state } = h;
  try {
    await viewCard(page);
    await page.getByRole("button", { name: "今の2作品を共有" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await one.getByLabel("この作品を公開").check();
    await one.getByLabel("評価も公開").check();
    if (await two.getByLabel("評価も公開").isEnabled()) await two.getByLabel("評価も公開").check();
    await one.getByLabel("一言も公開").check();
    await two.getByLabel("この作品を公開").check();
    await expect(two.getByLabel("一言も公開")).toBeDisabled();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    const preview = page.getByRole("region", { name: "公開内容のプレビュー" });
    await expect(preview).toContainText("公開する一言");
    await expect(preview).not.toContainText("PRIVATE_SPOILER");
    assert.equal(state.writes.length, 0);
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("link", { name: "作成した共有を開く" })).toHaveAttribute("href", "/share/impressions/public-1");
    assert.equal(state.writes[0].body.kind, "season-impressions");
    assert.doesNotMatch(JSON.stringify(state.writes[0].body), /PRIVATE_SPOILER|公開する一言/);
    if (!new URL(page.url()).searchParams.has("share")) await viewCard(page);
    await page.getByRole("button", { name: "共有の管理・履歴", exact: true }).click();
    await page.getByRole("button", { name: "公開を停止", exact: true }).click();
    assert.equal(state.writes.length, 1, "revocation needs confirmation");
    await page.getByRole("button", { name: "公開停止を確定する" }).click();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
    assert.equal(state.writes[1].method, "DELETE");
  } finally { await h.close(); }
});

test("Visual/Simple parity, 200% text, keyboard-sized viewport and season switching", async () => {
  const h = await harness({ mode: "visual" });
  const { page, state } = h;
  try {
    await expect(page.locator("img")).toHaveCount(2);
    assert.ok(state.images > 0);
    await page.screenshot({ path: path.join(output, "mobile-visual.png"), fullPage: true });
    await page.getByRole("button", { name: "Simple", exact: true }).click();
    await expect(page.locator("img")).toHaveCount(0);
    const count = state.images;
    await page.addStyleTag({ content: ".impressions-page, .impressions-editor { font-size: 200%; }" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await page.setViewportSize({ width: 375, height: 380 });
    const save = page.getByRole("dialog").getByRole("button", { name: /^(保存する|確認だけ記録する)$/ });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    const bounds = await save.boundingBox();
    assert.ok(bounds.height >= 44 && bounds.width >= 44 && bounds.y >= 0 && bounds.y + bounds.height <= 380);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 900 });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("年", { exact: true }).selectOption("2025");
    await page.getByLabel("クール", { exact: true }).selectOption("SUMMER");
    await expect(page.locator("[data-season-heading]")).toContainText("2025年夏");
    assert.equal(state.images, count);
    assert.equal(state.writes.length, 0);
    assert.equal(await page.getByRole("navigation", { name: "Tierの表示切り替え" }).getByRole("link").count(), 2);
    await page.screenshot({ path: path.join(output, "desktop-simple.png"), fullPage: true });
  } finally { await h.close(); }
});

test("size hierarchy is deterministic across entry, search, editor, personal card and share flow", async () => {
  const longTitle = "とても長い日本語タイトルでも作品名を主役として折り返しながら読みやすさを保つ今期チェック検証作品";
  const item = anime("anilist-1", longTitle);
  const h = await harness({ mode: "visual", items: [item, candidates[1]], initialRecords: [record(item, {
    note: "カード本文は補足情報より大きく読みやすく表示する", rating: "liked", spoiler: "no_spoiler"
  })] });
  const { page } = h;
  try {
    const px = async (locator, property) => Number.parseFloat(await locator.evaluate((element, property) => getComputedStyle(element)[property], property));
    const bounded = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const assertControl = async (locator, expectedHeight = 44) => {
      const box = await locator.boundingBox();
      assert.ok(box.width >= 44 && box.height >= expectedHeight && box.height < 60, JSON.stringify(box));
    };

    assert.equal(await px(page.locator(".impressions-page"), "fontSize"), 16);
    const candidate = page.getByRole("button", { name: new RegExp(longTitle) });
    let box = await candidate.boundingBox();
    assert.ok(box.height >= 104 && box.height < 120, JSON.stringify(box));
    assert.equal(await px(candidate.locator("strong"), "fontSize"), 16);
    assert.equal(await px(candidate.locator(".impressions-card-text > :last-child"), "fontSize"), 12);
    for (const action of await page.locator(".impressions-entry-actions button").all()) {
      const actionBox = await action.boundingBox();
      assert.ok(actionBox.height >= 48 && actionBox.height < 60, JSON.stringify(actionBox));
      assert.ok(actionBox.width >= 300, JSON.stringify(actionBox));
    }
    await bounded();

    await page.getByRole("button", { name: "作品を探す", exact: true }).click();
    await assertControl(page.getByLabel("作品名で検索"));
    for (const button of await page.getByRole("group", { name: "記録の絞り込み" }).getByRole("button").all()) await assertControl(button);
    await page.getByRole("button", { name: new RegExp(longTitle) }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(await px(dialog.locator(".impressions-editor"), "fontSize"), 16);
    await assertControl(dialog.getByRole("button", { name: "保存する", exact: true }), 48);
    await assertControl(dialog.getByRole("button", { name: "今回は書かない", exact: true }));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "自分の今期カードを見る" }).click();
    box = await page.getByRole("button", { name: new RegExp(longTitle) }).boundingBox();
    assert.ok(box.height >= 104 && box.height < 160, JSON.stringify(box));
    const share = page.getByRole("button", { name: "今の1作品を共有" });
    await assertControl(share, 48);
    await share.click();
    await assertControl(page.getByRole("button", { name: "公開内容をプレビュー" }), 48);
    await page.getByLabel("一言も公開").check();
    await page.getByLabel("評価も公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    const publicCard = page.getByRole("region", { name: "共有カード" });
    assert.equal(await px(publicCard, "fontSize"), 16);
    assert.equal(await px(publicCard.locator("h3"), "fontSize"), 16);
    assert.ok(await px(publicCard.locator(".impressions-note"), "fontSize") >= 14);
    assert.equal(await px(publicCard.locator(".impressions-meta").last(), "fontSize"), 12);
    await assertControl(page.getByRole("button", { name: "この内容で公開URLを作成" }), 48);
    await bounded();

    await page.addStyleTag({ content: ".impressions-page { font-size: 200%; }" });
    await bounded();
    await page.setViewportSize({ width: 1280, height: 900 });
    await bounded();
    const desktopCard = await publicCard.locator(".impressions-card").boundingBox();
    assert.ok(desktopCard.height >= 108 && desktopCard.width < 600, JSON.stringify(desktopCard));

    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
      const nav = document.createElement("nav");
      nav.className = "mobile-bottom-nav";
      nav.dataset.sizeProbe = "five-items";
      for (const label of ["ホーム", "今期チェック", "さがす", "マイリスト", "マイページ"]) {
        const link = document.createElement("a");
        link.className = `mobile-bottom-nav-link${label === "今期チェック" ? " mobile-bottom-nav-tier" : ""}`;
        link.innerHTML = `<span class="mobile-nav-icon-wrap">□</span><span${label === "今期チェック" ? ' class="mobile-nav-tier-label"' : ""}>${label}</span>`;
        nav.append(link);
      }
      document.body.append(nav);
    });
    const labels = page.locator('[data-size-probe="five-items"] .mobile-bottom-nav-link > span:last-child');
    assert.equal(await labels.count(), 5);
    for (const label of await labels.all()) {
      assert.ok(await label.evaluate((element) => element.scrollWidth <= element.clientWidth), await label.textContent());
    }
    await bounded();
  } finally { await h.close(); }
});

test("season controls cancel cleanly and save/delete/share all use the canonical selection", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await page.getByRole("dialog").getByLabel("いまの一言").fill("秋の下書き");
    await page.keyboard.press("Escape");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2025");
    await expect(page.getByRole("combobox", { name: "年", exact: true })).toHaveValue("2026");
    await expect(page).toHaveURL(/year=2026&season=FALL$/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2025");
    await page.getByRole("combobox", { name: "クール", exact: true }).selectOption("SUMMER");
    await expect(page.locator("[data-season-heading]")).toHaveText("選択中の期（2025年夏）");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("");
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Escape");
    await viewCard(page);
    await page.getByRole("button", { name: "今の1作品を共有" }).click();
    await page.getByRole("group", { name: "日本語アニメ一", exact: true }).getByLabel("この作品を公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("link", { name: "作成した共有を開く" })).toBeVisible();
    await page.getByRole("button", { name: "自分の今期カードに戻る" }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    assert.deepEqual(state.writes.map(({ method, body }) => ({ method, year: body.year, season: body.season })), [
      { method: "PUT", year: 2025, season: "SUMMER" },
      { method: "POST", year: 2025, season: "SUMMER" },
      { method: "DELETE", year: 2025, season: "SUMMER" }
    ]);
  } finally { await h.close(); }
});

test("late owner records and save responses cannot cross a season change or a return to the same season", async () => {
  const h = await harness();
  const { page } = h;
  try {
    let heldRead;
    await page.route("**/api/season-impressions?year=2025&season=FALL", (route) => { heldRead = route; }, { times: 1 });
    await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2025");
    await expect.poll(() => !!heldRead).toBe(true);
    await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2024");
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2025");
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    const readFinished = page.waitForEvent("requestfinished", (request) => request === heldRead.request());
    await heldRead.fulfill({ json: { impressions: [record(anime("anilist-99", "OLD_PRIVATE_RECORD"), { year: 2025 })], deletedRevisions: [] } });
    await readFinished;
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(page.getByText("OLD_PRIVATE_RECORD")).toHaveCount(0);
    let heldWrite;
    await page.route("**/api/season-impressions/anilist-1", (route) => { heldWrite = route; }, { times: 1 });
    await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
    await expect.poll(() => !!heldWrite).toBe(true);
    assert.equal(heldWrite.request().postDataJSON().year, 2025);
    await page.evaluate(() => history.pushState(null, "", "?year=2024&season=SUMMER"));
    await expect(page.locator("[data-season-heading]")).toHaveText("選択中の期（2024年夏）");
    await expect(dialog).not.toBeVisible();
    const writeFinished = page.waitForEvent("requestfinished", (request) => request === heldWrite.request());
    await heldWrite.fulfill({ json: { impression: record(candidates[0], { year: 2025, note: "OLD_SAVE" }) } });
    await writeFinished;
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("");
    await expect(page.getByRole("button", { name: /日本語アニメ一.*未記録/ })).toBeVisible();
    await expect(page.getByText("OLD_PRIVATE_RECORD")).toHaveCount(0);
  } finally { await h.close(); }
});

test("note first, explicit save grows only after success; close/skip never save or open the next editor", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await expect(page.getByRole("heading", { name: "まず、見た作品から一言。" })).toBeVisible();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("いまの一言")).toBeFocused();
    await expect(dialog.locator("details")).not.toHaveAttribute("open");
    await dialog.getByLabel("いまの一言").fill("心に残った場面");
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("心に残った場面");
    await dialog.getByRole("button", { name: "今回は書かない" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toHaveCount(0);
    assert.equal(state.writes.length, 0);
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await dialog.getByLabel("いまの一言").fill("一言だけで保存");
    let held;
    await page.route("**/api/season-impressions/anilist-2", (route) => { held = route; }, { times: 1 });
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect.poll(() => !!held).toBe(true);
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    await expect(dialog.getByRole("button", { name: "処理中…" })).toBeDisabled();
    await expect(page.getByText("今期カードに、最初の1作品が加わりました。", { exact: true })).toHaveCount(0);
    assert.equal(held.request().postDataJSON().rating, null);
    assert.equal(held.request().postDataJSON().note, "一言だけで保存");
    await held.fulfill({ json: { impression: record(candidates[1], { note: "一言だけで保存" }) } });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("今期カードに、最初の1作品が加わりました。", { exact: true })).toBeVisible();
    await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /日本語アニメ二.*一言だけで保存.*記録済み/ })).toBeVisible();
    await page.getByRole("button", { name: "次の作品に一言", exact: true }).click();
    await expect(page.getByRole("list", { name: "一言を書く候補" }).getByRole("button")).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
  } finally { await h.close(); }
});

for (const mode of ["simple", "visual"]) {
  test(`${mode} editor: deterministic image DOM and network boundary with positive Visual control`, async () => {
    const h = await harness({ mode });
    const { page, state } = h;
    try {
      const requests = [];
      page.on("request", (request) => { if (request.resourceType() === "image") requests.push(request.url()); });
      await page.getByRole("button", { name: /日本語アニメ一/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("未記録・入力中");
      await expect(dialog.locator("img")).toHaveCount(mode === "visual" ? 1 : 0);
      if (mode === "visual") {
        await expect(dialog.locator("img")).toBeVisible();
        assert.equal(await dialog.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0), true);
        assert.ok(state.images > 0);
      }
      await dialog.getByText("評価を添える（任意）", { exact: true }).click();
      await dialog.getByLabel("好き", { exact: true }).check();
      await dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ }).click();
      await expect(dialog).toHaveCount(0);
      await page.keyboard.press("Escape");
      await viewCard(page);
      await page.getByRole("button", { name: "今の1作品を共有" }).click();
      await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
      await expect(page.getByRole("region", { name: "公開内容のプレビュー" }).locator("img")).toHaveCount(mode === "visual" ? 1 : 0);
      if (mode === "simple") {
        assert.equal(await page.locator("img, picture, [style*='background-image']").count(), 0);
        assert.deepEqual(requests, []);
        assert.equal(state.images, 0);
      }
    } finally { await h.close(); }
  });
}

test("missing or failed artwork leaves no empty or broken image in the editor", async () => {
  const h = await harness({ mode: "visual", items: [{ ...candidates[0], imageUrl: "" }, candidates[1]] });
  const { page } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.route("**/api/image-proxy**", (route) => route.fulfill({ status: 404, body: "" }));
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("日本語アニメ二");
  } finally { await h.close(); }
});

test("quick sharing takes four interactions through copy, excludes drafts, and preserves history without private URLs", async () => {
  const h = await harness({ initialRecords: [record(candidates[0], { note: "SAVED_PRIVATE", rating: "liked", spoiler: "no_spoiler" })] });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ二/ }).click();
    await page.getByRole("dialog").getByLabel("いまの一言").fill("UNSAVED_DRAFT");
    await page.keyboard.press("Escape");
    await viewCard(page);
    await expect(page.getByText("未保存の入力は共有に含まれません。")).toBeVisible();
    await viewCard(page);
    const entry = page.getByRole("button", { name: "今の1作品を共有" });
    assert.ok((await entry.boundingBox()).y > (await page.getByRole("button", { name: /日本語アニメ一/ }).boundingBox()).y, "sharing starts after the personal card");
    let interactions = 0;
    const tap = async (name) => { interactions++; await page.getByRole("button", { name, exact: true }).click(); };
    await viewCard(page);
    await tap("今の1作品を共有");
    await expect(page.getByRole("checkbox", { name: /この作品を公開/ })).toBeChecked();
    await expect(page.getByLabel("評価も公開").first()).not.toBeChecked();
    await expect(page.getByLabel("一言も公開")).not.toBeChecked();
    await tap("公開内容をプレビュー");
    const preview = page.getByRole("region", { name: "公開内容のプレビュー" });
    await expect(preview).not.toContainText(/SAVED_PRIVATE|UNSAVED_DRAFT|日本語アニメ二|今の印象/);
    for (const notice of ["URLを知っている人が見られます。", "公開後に記録を編集・削除しても、この共有の内容は変わりません。", "公開はあとから停止できます。コメント・リアクションはありません。"]) await expect(preview.getByText(notice, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("一言も公開")).not.toBeChecked();
    await page.goForward();
    await expect(preview).toBeVisible();
    assert.equal(state.writes.length, 0);
    await tap("この内容で公開URLを作成");
    await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toBeFocused();
    await tap("URLをコピー");
    assert.equal(interactions, 4);
    assert.equal(await page.evaluate(() => window.copiedUrl), "https://impressions.test/share/impressions/public-1");
    assert.equal(state.writes.length, 1);
    assert.deepEqual(state.writes[0].body.selections, [{ animeId: "anilist-1", revision: 1, includeRating: false, includeNote: false }]);
    assert.match(page.url(), /year=2026&season=FALL&share=result$/);
    assert.doesNotMatch(page.url(), /anilist|public-1|PRIVATE|DRAFT/);
    await page.goBack();
    await expect(page.getByRole("button", { name: "作成済みのURLを確認" })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toBeFocused();
    assert.equal(state.writes.length, 1);
  } finally { await h.close(); }
});

test("409 preserves unaffected selection and note permission, removes deletions, resets changed notes and requires fresh preview", async () => {
  const third = anime("anilist-3", "削除作品");
  const h = await harness({ initialRecords: [record(candidates[0], { rating: "liked", note: "UNCHANGED", spoiler: "no_spoiler" }), record(candidates[1], { rating: "neutral", note: "CHANGED", spoiler: "no_spoiler" }), record(third)] });
  const { page, state } = h;
  try {
    await viewCard(page);
    await page.getByRole("button", { name: "今の3作品を共有" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await one.getByLabel("一言も公開").check(); await two.getByLabel("一言も公開").check();
    await one.getByLabel("評価も公開").check();
    if (await two.getByLabel("評価も公開").isEnabled()) await two.getByLabel("評価も公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    state.publishStatus = 409;
    state.records = [state.records[0], { ...state.records[1], revision: 2, note: "NEW_PRIVATE" }];
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("button", { name: "この内容で公開URLを作成" })).toBeDisabled();
    await page.getByRole("button", { name: "最新の記録を確認して選択を見直す" }).click();
    await expect(one.getByLabel("一言も公開")).toBeChecked();
    await expect(two.getByLabel("一言も公開")).not.toBeChecked();
    await expect(two.getByLabel("この作品を公開")).toBeChecked();
    await expect(page.getByRole("group", { name: "削除作品", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "この内容で公開URLを作成" })).toHaveCount(0);
    assert.equal(state.writes.length, 1);
    state.publishStatus = 200;
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    await expect(page.getByRole("region", { name: "公開内容のプレビュー" })).not.toContainText("NEW_PRIVATE");
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toBeVisible();
    assert.deepEqual(state.writes[1].body.selections, [{ animeId: "anilist-1", revision: 1, includeRating: true, includeNote: true }, { animeId: "anilist-2", revision: 2, includeRating: true, includeNote: false }]);
  } finally { await h.close(); }
});

test("manager loading, error, empty and success are distinct; unknown POST is never retried automatically", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page, state } = h;
  try {
    let held;
    const historyRequested = new Promise((resolve) => page.route("**/api/shares?kind=season-impressions", (route) => { held = route; resolve(); }, { times: 1 }));
    if (!new URL(page.url()).searchParams.has("share")) await viewCard(page);
    await page.getByRole("button", { name: "共有の管理・履歴", exact: true }).click();
    await historyRequested;
    await expect(page.getByText("公開履歴を読み込んでいます…")).toBeVisible();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toHaveCount(0);
    await held.fulfill({ status: 503, json: { error: "履歴の取得に失敗しました。" } });
    await expect(page.getByRole("alert")).toContainText("履歴の取得に失敗");
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "公開履歴を再読み込み" }).click();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "自分の今期カードに戻る" }).click();
    await viewCard(page);
    await page.getByRole("button", { name: "今の1作品を共有" }).click();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    state.publishStatus = 503;
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("alert")).toContainText("公開結果を確認できませんでした");
    await expect(page.getByRole("button", { name: "この内容で公開URLを作成" })).toBeDisabled();
    assert.equal(state.writes.length, 1);
    state.shares = [{ year: 2026, season: "FALL", shareId: "already-created", createdAt: "2026-10-01T00:00:00Z" }];
    await page.getByRole("button", { name: "共有の管理・履歴で確認" }).click();
    await expect(page.getByRole("link", { name: /の共有$/ })).toHaveAttribute("href", "/share/impressions/already-created");
    await page.getByRole("button", { name: "URLをコピー", exact: true }).click();
    assert.equal(await page.evaluate(() => window.copiedUrl), "https://impressions.test/share/impressions/already-created");
    assert.equal(state.writes.length, 1);
  } finally { await h.close(); }
});

for (const status of [401, 429]) {
  test(`publish ${status} shows actionable copy without automatic writes or cross-account reuse`, async () => {
    const h = await harness({ initialRecords: [record(candidates[0], { note: "OWNER_ONLY", spoiler: "no_spoiler" })] });
    const { page, state } = h;
    try {
      await viewCard(page);
      await page.getByRole("button", { name: "今の1作品を共有" }).click();
      await page.getByLabel("一言も公開").check();
      await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
      state.publishStatus = status;
      await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
      await expect(page.getByRole("alert")).toContainText(status === 401 ? "元のアカウント" : "しばらく待って");
      assert.equal(state.writes.length, 1);
      if (status === 401) {
        await expect(page.getByText("OWNER_ONLY", { exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Googleでログインし直す" }).click();
        state.records = [];
        await sessionTransition(page, "account-b", { remount: true });
        await expect(page.getByText("OWNER_ONLY", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("checkbox", { name: /この作品を公開/ })).toHaveCount(0);
        assert.equal(state.writes.length, 1);
      } else await expect(page.getByRole("button", { name: "この内容で公開URLを作成" })).toBeEnabled();
    } finally { await h.close(); }
  });
}

test("liked quick selection and whole-row toggles publish the saved note, never an unsaved edit", async () => {
  const h = await harness({ initialRecords: [record(candidates[0], { rating: "liked", note: "SAVED_NOTE", spoiler: "no_spoiler" }), record(candidates[1], { rating: "neutral" })] });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await page.getByRole("dialog").getByLabel("いまの一言").fill("DRAFT_MUST_STAY_PRIVATE");
    await page.keyboard.press("Escape");
    await viewCard(page);
    await page.getByRole("button", { name: "今の2作品を共有" }).click();
    await page.getByRole("button", { name: "「好き」の作品を選ぶ" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await expect(one.getByLabel("この作品を公開")).toBeChecked();
    await expect(two.getByLabel("この作品を公開")).not.toBeChecked();
    await two.locator(".impressions-select-row span").click();
    await expect(two.getByLabel("この作品を公開")).toBeChecked();
    await one.getByLabel("一言も公開").check();
    await one.getByLabel("評価も公開").check();
    if (await two.getByLabel("評価も公開").isEnabled()) await two.getByLabel("評価も公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    const preview = page.getByRole("region", { name: "公開内容のプレビュー" });
    await expect(preview).toContainText("SAVED_NOTE");
    await expect(preview).toContainText("今の印象：好き");
    await expect(preview).not.toContainText("DRAFT_MUST_STAY_PRIVATE");
    assert.equal(state.writes.length, 0);
  } finally { await h.close(); }
});

test("375px Visual editor with 200% text, reduced motion and keyboard viewport keeps controls reachable and focus trapped", async () => {
  const h = await harness({ mode: "visual" });
  const { page, state } = h;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await page.addStyleTag({ content: ".impressions-sheet { font-size: 200%; } .impressions-sheet :is(button, select, textarea) { font-size: inherit; }" });
    await expect(dialog.locator("img")).toBeVisible();
    await expect(dialog.getByRole("heading")).toBeVisible();
    await dialog.getByText("評価を添える（任意）", { exact: true }).click();
    for (const label of await dialog.locator(".impressions-rating label").all()) {
      const box = await label.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
    }
    assert.equal(await dialog.evaluate((element) => getComputedStyle(element).animationName), "none");
    await page.setViewportSize({ width: 375, height: 380 });
    const note = dialog.getByLabel("いまの一言");
    await note.focus();
    await note.fill("キーボードで入力");
    await expect(note).toBeFocused();
    await expect(note).toBeInViewport();
    await page.screenshot({ path: path.join(output, "editor-visual-active-note-200.png") });
    const save = dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ });
    await expect(save).toBeInViewport();
    const box = await save.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.y >= 0 && box.y + box.height <= 380);
    assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await dialog.getByRole("button", { name: "閉じる" }).focus();
    await page.keyboard.press("Shift+Tab");
    assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement)));
    await page.screenshot({ path: path.join(output, "editor-visual-375-keyboard-200.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeFocused();
    assert.equal(state.writes.length, 0);
  } finally { await h.close(); }
});

for (const mode of ["visual", "simple"]) {
  test(`375px ${mode}: long Japanese title at 200% text and keyboard viewport keeps the entire editor reachable`, async () => {
    const title = "日本語アニメ一・異世界に転生した私が小さな図書館で出会った仲間たちと失われた物語を探す旅に出たら、いつの間にか王国の未来を託されていました〜それでも毎朝おいしい朝ごはんを食べながら、みんなで笑って暮らせる日常を取り戻したい〜";
    const h = await harness({ mode, items: [anime("anilist-1", title), candidates[1]] });
    const { page, state } = h;
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const trigger = page.getByRole("button", { name: new RegExp(title) });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await page.addStyleTag({ content: ".impressions-sheet { font-size: 200%; } .impressions-sheet :is(button, select, textarea) { font-size: inherit; }" });
      await page.setViewportSize({ width: 375, height: 380 });
      await expect(dialog).toHaveAccessibleName(title);
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.getByRole("heading")).toHaveText(title);
      assert.ok(await dialog.getByRole("heading").evaluate((element) =>
        element.getBoundingClientRect().height > element.closest(".bottom-sheet").clientHeight), "title must exceed the usable sheet height to reproduce the blocker");

      const assertBounded = async () => {
        assert.ok(await dialog.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight && box.height <= parseFloat(getComputedStyle(element).maxHeight)
            && element.scrollWidth <= element.clientWidth;
        }), "sheet must stay within the reduced viewport without horizontal overflow");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      };
      const assertReachable = async (control) => {
        await expect(control).toBeInViewport({ ratio: 1 });
        assert.ok(await control.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const sheet = element.closest(".bottom-sheet").getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return box.top >= sheet.top && box.bottom <= sheet.bottom && box.left >= sheet.left && box.right <= sheet.right
            && (element.contains(hit) || element.closest("label")?.contains(hit));
        }), "control must be inside the sheet and unobscured");
        await assertBounded();
      };

      // Read both ends of the full title through the same bounded scroll region.
      for (const end of [false, true]) {
        assert.ok(await dialog.evaluate((element, end) => {
          const heading = element.querySelector("h2");
          const text = heading.firstChild;
          const range = document.createRange();
          const offset = end ? text.length - 1 : 0;
          range.setStart(text, offset); range.setEnd(text, offset + 1);
          element.scrollTop += range.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
          const box = range.getBoundingClientRect();
          const sheet = element.getBoundingClientRect();
          return box.top >= sheet.top && box.bottom <= sheet.bottom && box.left >= sheet.left && box.right <= sheet.right;
        }, end), "both the first and last title characters must be scrollable into view");
        await assertBounded();
      }
      if (mode === "visual") {
        const artwork = dialog.locator("img");
        await artwork.scrollIntoViewIfNeeded();
        await expect(artwork).toHaveJSProperty("naturalWidth", 64);
        await assertReachable(artwork);
      } else {
        await expect(dialog.locator("img")).toHaveCount(0);
        assert.equal(state.images, 0);
      }

      const close = dialog.getByRole("button", { name: "閉じる", exact: true });
      await close.focus();
      await assertReachable(close);
      await page.keyboard.press("Tab");
      await expect(dialog.getByLabel("いまの一言")).toBeFocused();
      const disclosure = dialog.getByText("評価を添える（任意）", { exact: true });
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      const ratings = dialog.getByRole("radio");
      await expect(ratings).toHaveCount(4);
      // Tab enters the checked "評価なし" radio; arrows wrap through every choice.
      for (const index of [3, 0, 1, 2]) {
        const rating = ratings.nth(index);
        await expect(rating).toBeFocused();
        await page.keyboard.press("Space");
        await expect(rating).toBeChecked();
        await assertReachable(rating);
        await rating.locator("..").scrollIntoViewIfNeeded();
        await assertReachable(rating.locator(".."));
        const label = await rating.locator("..").boundingBox();
        assert.ok(label.width >= 44 && label.height >= 44);
        if (index !== 2) await page.keyboard.press("ArrowDown");
      }
      const note = dialog.getByLabel("いまの一言");
      await note.focus();
      await expect(note).toBeFocused();
      await note.fill("長いタイトルでもキーボードで入力して保存");
      await assertReachable(note);
      const save = dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/, exact: true });
      await save.focus();
      await expect(save).toBeFocused();
      await assertReachable(save);
      const saveBox = await save.boundingBox();
      assert.ok(saveBox.width >= 44 && saveBox.height >= 44);
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await assertReachable(close);
      await page.keyboard.press("Shift+Tab");
      await expect(save).toBeFocused();
      await assertReachable(save);
      assert.equal(state.writes.length, 0);
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      assert.equal(state.writes.length, 1);
      assert.equal(state.writes[0].body.anime.title, title);
      assert.equal(state.writes[0].body.rating, "not_for_me");
      assert.equal(state.writes[0].body.note, "長いタイトルでもキーボードで入力して保存");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "自分の今期カード", exact: true })).toBeFocused();
    } finally { await h.close(); }
  });
}

test("transport loss after one explicit POST locks publishing and navigates only to history", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page } = h;
  try {
    let posts = 0;
    await page.route("**/api/shares", (route) => { posts++; return route.abort("failed"); });
    await viewCard(page);
    await page.getByRole("button", { name: "今の1作品を共有" }).click();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("alert")).toContainText("公開結果を確認できませんでした");
    await page.goBack(); await page.goForward();
    await expect(page.getByRole("button", { name: "この内容で公開URLを作成" })).toBeDisabled();
    assert.equal(posts, 1);
    await page.getByRole("button", { name: "共有の管理・履歴で確認" }).click();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
    assert.equal(posts, 1);
  } finally { await h.close(); }
});

test("late publish response cannot leak a receipt into another owner or season; invalid steps recover safely", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page, state } = h;
  try {
    await viewCard(page);
    await page.getByRole("button", { name: "今の1作品を共有" }).click();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    let held;
    const posted = new Promise((resolve) => page.route("**/api/shares", (route) => { held = route; resolve(); }, { times: 1 }));
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await posted;
    await expect(page.getByRole("button", { name: "公開しています…" })).toBeDisabled();
    state.records = [];
    await sessionTransition(page, "account-b");
    await expect(page.getByRole("button", { name: "公開内容をプレビュー" })).toBeDisabled();
    const finished = page.waitForEvent("requestfinished", (request) => request === held.request());
    await held.fulfill({ json: { shareId: "private-old-owner-receipt" } });
    await finished;
    await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toHaveCount(0);
    assert.ok(!(await page.content()).includes("private-old-owner-receipt"));
    await page.evaluate(() => history.pushState(null, "", "?year=2025&season=SUMMER&share=preview"));
    await expect(page).toHaveURL(/year=2025&season=SUMMER&share=select$/);
    await expect(page.getByRole("region", { name: "公開内容のプレビュー" })).toHaveCount(0);
    await page.evaluate(() => history.pushState(null, "", "?year=2025&season=SUMMER&share=result"));
    await expect(page).toHaveURL(/year=2025&season=SUMMER&share=manage$/);
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
  } finally { await h.close(); }
});

test("94 titles: at most three stable entry candidates, ten per search page, all catalog searchable, no refill after save/skip", async () => {
  const items = Array.from({ length: 94 }, (_, index) => anime(`anilist-${index + 1}`, `検証作品${String(index + 1).padStart(2, "0")}`));
  const h = await harness({ items });
  const { page, state } = h;
  try {
    const list = page.getByRole("list", { name: "一言を書く候補" });
    await expect(list.getByRole("button")).toHaveCount(3);
    const initial = await list.getByRole("button").allTextContents();
    await page.getByRole("button", { name: "作品を探す", exact: true }).click();
    const results = page.getByRole("list", { name: "検索結果" });
    await expect(results.getByRole("button")).toHaveCount(10);
    assert.equal(await page.locator(".impressions-card").count(), 10, "entry list unmounts, not hidden offscreen");
    await page.getByRole("button", { name: "次の10作品" }).click();
    await expect(results.getByRole("button")).toHaveCount(10);
    for (const item of items) {
      await page.getByLabel("作品名で検索").fill(item.title);
      await expect(results.getByRole("button")).toHaveCount(1);
      await expect(results.getByRole("button")).toContainText(item.title);
    }
    await page.getByLabel("作品名で検索").fill("該当なし");
    await expect(results.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("条件に合う作品がありません。検索語や絞り込みを変えてください。")).toBeVisible();
    await page.getByRole("button", { name: "候補に戻る" }).click();
    assert.deepEqual(await list.getByRole("button").allTextContents(), initial);
    const dialog = page.getByRole("dialog");
    await list.getByRole("button").first().click();
    await dialog.getByLabel("いまの一言").fill("今日の一言");
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "次の作品に一言", exact: true }).click();
    assert.deepEqual(await list.getByRole("button").allTextContents(), initial.slice(1));
    for (let remaining = 2; remaining > 0; remaining--) {
      await list.getByRole("button").first().click();
      await dialog.getByRole("button", { name: "今回は書かない" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(list.getByRole("button")).toHaveCount(remaining - 1);
    }
    assert.equal(state.writes.length, 1);
    await page.getByRole("button", { name: "自分の今期カードを見る" }).click();
    await page.getByRole("button", { name: /検証作品01/ }).click();
    await dialog.getByLabel("いまの一言").fill("今の一言に書き直し");
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(page.getByText("今の一言に更新しました。", { exact: true })).toBeVisible();
    await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /検証作品01/ }).click();
    await dialog.getByRole("button", { name: "記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(page.getByText("0作品を記録", { exact: true })).toBeVisible();
    await expect(page.locator("img, picture")).toHaveCount(0);
    assert.equal(state.images, 0);
  } finally { await h.close(); }
});

test("140/141 code points, emoji, newline and IME; note changes reset no-spoiler while rating-only preserves it", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    const note = dialog.getByLabel("いまの一言");
    await expect(note).toBeFocused();
    await expect(dialog.getByLabel("ネタバレなし（共有時に選べます）")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "確認だけ記録する" })).toBeEnabled();
    const text140 = "😀".repeat(138) + "\nあ";
    await note.fill(text140 + "界");
    await expect(dialog.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
    await expect(note).toHaveValue(text140 + "界");
    await expect(dialog.getByText("141 / 140文字（任意）", { exact: true })).toBeVisible();
    await note.dispatchEvent("compositionstart", { data: "界" });
    await note.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
    await note.dispatchEvent("compositionend", { data: "界" });
    assert.equal(state.writes.length, 0);
    await note.fill(text140);
    const spoiler = dialog.getByLabel("ネタバレなし（共有時に選べます）");
    await expect(spoiler).not.toBeChecked();
    await spoiler.check();
    await dialog.getByText("評価を添える（任意）", { exact: true }).click();
    await dialog.getByLabel("好き", { exact: true }).check();
    await expect(spoiler).toBeChecked();
    await note.fill(text140.slice(0, -1) + "い");
    await expect(spoiler).not.toBeChecked();
    await dialog.getByLabel("評価なし", { exact: true }).check();
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(state.writes.length, 1);
    assert.equal(Array.from(state.writes[0].body.note).length, 140);
    assert.equal(state.writes[0].body.rating, null);
    assert.equal(state.writes[0].body.spoiler, "unspecified");
    await expect(page.locator(".impressions-note")).toHaveText(text140.slice(0, -1) + "い");
  } finally { await h.close(); }
});

test("offline and storage exceptions retain input, reconnect never writes, rejected save never grows", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("storage unavailable"); }; });
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("いまの一言").fill("端末に保持できなくても入力を残す");
    await expect(page.getByText("下書きを端末に保持できません。再ログインやページ移動の前に入力を控えてください。")).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline")); });
    await expect(dialog.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); window.dispatchEvent(new Event("online")); });
    await expect(dialog.getByRole("button", { name: "保存する", exact: true })).toBeEnabled();
    assert.equal(state.writes.length, 0);
    let held;
    await page.route("**/api/season-impressions/anilist-1", (route) => { held = route; }, { times: 1 });
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect.poll(() => !!held).toBe(true);
    await expect(page.getByText("今期カードに、最初の1作品が加わりました。", { exact: true })).toHaveCount(0);
    await held.fulfill({ status: 429, json: { error: "しばらく待ってから保存してください。" } });
    await expect(dialog.getByRole("alert")).toContainText("しばらく待って");
    await expect(dialog.getByLabel("いまの一言")).toHaveValue("端末に保持できなくても入力を残す");
    await expect(page.getByText("今期カードに、最初の1作品が加わりました。", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
  } finally { await h.close(); }
});

test("share starts on personal card with recent six selected, item info only, note and rating individually explicit", async () => {
  const items = Array.from({ length: 8 }, (_, index) => anime(`anilist-${index + 1}`, `共有作品${index + 1}`));
  const records = items.map((item, index) => record(item, { note: `本文${index + 1}`, rating: "liked", spoiler: "no_spoiler", updatedAt: `2026-10-0${index + 1}T00:00:00Z` }));
  const h = await harness({ items, initialRecords: records });
  const { page, state } = h;
  try {
    await expect(page.getByRole("button", { name: "今の8作品を共有" })).toHaveCount(0);
    await expect(page.getByText("すべての作品を記録済みです。今の一言を書き直すこともできます。")).toBeVisible();
    await viewCard(page);
    await page.getByRole("button", { name: "今の8作品を共有" }).click();
    await expect(page.getByRole("checkbox", { name: /この作品を公開/, checked: true })).toHaveCount(6);
    await expect(page.getByRole("checkbox", { name: "一言も公開", checked: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "評価も公開", checked: true })).toHaveCount(0);
    const latest = page.getByRole("group", { name: "共有作品8", exact: true });
    await latest.getByLabel("一言も公開").check();
    await latest.getByLabel("評価も公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    const preview = page.getByRole("region", { name: "公開内容のプレビュー" });
    await expect(preview).not.toContainText(/共有作品1|共有作品2|本文[1-7]|確認済み|評価なし/);
    const text = await preview.innerText();
    assert.ok(text.indexOf("2026年秋") < text.indexOf("共有作品8"));
    assert.ok(text.indexOf("共有作品8") < text.indexOf("本文8"));
    assert.ok(text.indexOf("本文8") < text.indexOf("今の印象：好き"));
    assert.equal(state.writes.length, 0);
  } finally { await h.close(); }
});

test("empty catalog, catalog failure recovery, private-record failure and loading stay distinct without automatic writes", async () => {
  const empty = await harness({ items: [] });
  try {
    await expect(empty.page.getByText("このクールの作品はまだ表示できません。別のクールを選ぶか再試行してください。")).toBeVisible();
    await expect(empty.page.getByRole("list", { name: "一言を書く候補" }).getByRole("button")).toHaveCount(0);
    assert.equal(empty.state.writes.length, 0);
  } finally { await empty.close(); }
  const catalog = await harness({ catalogStatus: 503, initialRecords: [record(candidates[0], { note: "保存した本文" })] });
  try {
    await expect(catalog.page.getByRole("alert")).toContainText("作品一覧を取得できませんでした");
    await catalog.page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(catalog.page.getByRole("dialog").getByLabel("いまの一言")).toHaveValue("保存した本文");
    await expect(catalog.page.getByRole("dialog").getByRole("button", { name: "保存する", exact: true })).toBeEnabled();
    await catalog.page.keyboard.press("Escape");
    catalog.state.catalogStatus = 200;
    await catalog.page.getByRole("button", { name: "読み込みを再試行" }).click();
    await expect(catalog.page.getByRole("alert")).toHaveCount(0);
    await catalog.page.getByRole("button", { name: "作品を探す" }).click();
    await expect(catalog.page.getByRole("list", { name: "検索結果" }).getByRole("button")).toHaveCount(2);
    assert.equal(catalog.state.writes.length, 0);
  } finally { await catalog.close(); }
  const privateFailure = await harness({ privateStatus: 503 });
  const { page, state } = privateFailure;
  try {
    await expect(page.getByRole("alert")).toContainText("保存済みの記録を取得できませんでした");
    await page.getByRole("button", { name: "作品を探す" }).click();
    await expect(page.getByRole("list", { name: "検索結果" }).getByRole("button").first()).toBeDisabled();
    await expect(page.getByRole("list", { name: "検索結果" })).not.toContainText("未記録");
    await viewCard(page);
    await expect(page.getByRole("button", { name: "今の0作品を共有" })).toBeDisabled();
    await expect(page.getByText("0作品を記録", { exact: true })).toHaveCount(0);
    let held;
    await page.route("**/api/season-impressions?**", (route) => { held = route; }, { times: 1 });
    await page.getByRole("button", { name: "読み込みを再試行" }).click();
    await expect.poll(() => !!held).toBe(true);
    await expect(page.getByText("作品と記録を読み込んでいます…")).toBeVisible();
    await expect(page.getByRole("button", { name: "今の0作品を共有" })).toBeDisabled();
    state.privateStatus = 200;
    await held.fulfill({ json: { impressions: [record()], deletedRevisions: [] } });
    await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
    assert.equal(state.writes.length, 0);
  } finally { await privateFailure.close(); }
});
