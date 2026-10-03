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
async function harness({ guest = false, mode = "simple", initialRecords = [], width = 375, items = candidates } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = { records: initialRecords, deletedRevisions: [], shares: [], writes: [], images: 0, failSave: false, expired: false, denyReads: false, conflict: false, failHistory: false, publishStatus: 200 };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/test") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/image-proxy") { state.images += 1; return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="gray"/></svg>' }); }
    if (url.pathname === "/api/anime/seasonal") return fulfill({ items, source: "anilist", cached: true, year: Number(url.searchParams.get("year")), season: url.searchParams.get("season") });
    if (url.pathname === "/api/season-impressions" && method === "GET") return state.denyReads
      ? fulfill({ error: "元のアカウントでログインし直してください。" }, 401)
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
  await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
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
    await dialog.getByLabel("一言（任意・140文字以内）").fill("保持する😀感想");
    await dialog.getByLabel("自分には合わない", { exact: true }).check();
    state.failSave = true;
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("alert")).toContainText("保存に失敗");
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("保持する😀感想");
    await expect(page.getByRole("button", { name: /日本語アニメ一.*未確認/ })).toHaveClass("impressions-card");
    state.failSave = false;
    await dialog.getByRole("button", { name: "再試行して保存" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    await expect(page.getByRole("button", { name: /日本語アニメ一.*確認済み/ })).toHaveClass(/impressions-card--checked/);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一.*確認済み/ }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("保持する😀感想");
    await expect(dialog.getByLabel("自分には合わない", { exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "確認記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: /日本語アニメ一.*未確認/ })).toBeVisible();
    assert.ok(state.writes.every((entry) => entry.url.startsWith("/api/season-impressions/")));
    assert.equal(state.images, 0);
  } finally { await h.close(); }
});

test("later is session-only and conflict recovery preserves input until explicit resave", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: "続きから確認する" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("一言（任意・140文字以内）").fill("あとで保存");
    await dialog.getByRole("button", { name: "あとで（保存しない）" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes.length, 0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("あとで保存");
    state.conflict = true;
    state.records = [record(candidates[0], { revision: 2, note: "別の編集" })];
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
    await expect(dialog.getByText(/最新の記録：.*別の編集/)).toBeVisible();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("あとで保存");
    await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
    assert.equal(state.writes.length, 1);
    state.conflict = false;
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes[1].body.revision, 2);
    assert.equal(state.writes[1].body.note, "あとで保存");
  } finally { await h.close(); }
});

test("guest login returns to same season/anime/draft and never saves automatically", async () => {
  const h = await harness({ guest: true });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("一言（任意・140文字以内）").fill("ログイン後に残る😀");
    await dialog.getByLabel("好き", { exact: true }).check();
    await dialog.getByLabel("ネタバレ区分", { exact: true }).selectOption("no_spoiler");
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
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("ログイン後に残る😀");
    await expect(dialog.getByLabel("好き", { exact: true })).toBeChecked();
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
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
    await dialog.getByLabel("一言（任意・140文字以内）").fill("Aの非公開メモ😀");
    await dialog.getByRole("button", { name: "あとで（保存しない）" }).click();
    await dialog.getByLabel("一言（任意・140文字以内）").fill("あ".repeat(141));
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
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("あ".repeat(141));
    await expect(dialog.getByRole("button", { name: "保存して次へ" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("Aの非公開メモ😀");
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
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
    await dialog.getByLabel("一言（任意・140文字以内）").fill("PRIVATE_ACCOUNT_A");
    state.expired = true;
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
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
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("");
    await dialog.getByLabel("一言（任意・140文字以内）").fill("ACCOUNT_B_INPUT");
    state.expired = false;
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes[1].owner, "account-b");
    assert.equal(state.writes[1].body.note, "ACCOUNT_B_INPUT");
    assert.ok(state.writes.filter((write) => write.owner === "account-b").every((write) => !JSON.stringify(write.body).includes("PRIVATE_ACCOUNT_A")));
    state.records = [];
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("PRIVATE_ACCOUNT_A");
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
    await dialog.getByLabel("一言（任意・140文字以内）").fill("GUEST_THEN_A");
    await dialog.getByRole("button", { name: "Googleでログインして保存へ" }).click();
    await sessionTransition(page, "owner", { remount: true });
    await expect(page.getByRole("button", { name: /日本語アニメ一/ })).toBeEnabled();
    await expect(dialog).not.toBeVisible();
    await sessionTransition(page, "owner", { remount: true, returnToken: true });
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("GUEST_THEN_A");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:auth-draft:v2")), null);
    await sessionTransition(page, "account-b", { remount: true, returnToken: true });
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("");
    assert.equal(state.writes.length, 0);
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("GUEST_THEN_A");
  } finally { await h.close(); }
});

test("stale client session cannot restore private draft when the server denies the owner", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("一言（任意・140文字以内）").fill("SERVER_MUST_CONFIRM_OWNER");
    state.denyReads = true;
    await sessionTransition(page, "owner", { remount: true });
    await expect(page.getByRole("button", { name: "元のアカウントで再ログイン" })).toBeVisible();
    await expect(dialog).not.toBeVisible();
    assert.ok(!(await page.content()).includes("SERVER_MUST_CONFIRM_OWNER"));
    assert.equal(state.writes.length, 0);
    state.denyReads = false;
    await page.getByRole("button", { name: "読み込みを再試行" }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("SERVER_MUST_CONFIRM_OWNER");
  } finally { await h.close(); }
});

test("fresh editor after delete and reload gets the tombstone revision from owner GET", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page, state } = h;
  try {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "確認記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    assert.equal(await page.evaluate(() => sessionStorage.getItem("numanie:impressions:owner-drafts:v2:owner:2026:FALL")), null);
    await sessionTransition(page, "owner", { remount: true });
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
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
    await dialog.getByRole("button", { name: "確認記録を削除", exact: true }).click();
    await dialog.getByRole("button", { name: "削除を確定する" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByLabel("一言（任意・140文字以内）").fill("再作成");
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes[1].body.revision, 2, "DELETE response supplies the cursor");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    state.conflict = true; state.records = []; state.deletedRevisions = [{ animeId: "anilist-1", revision: 4 }];
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
    await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
    state.conflict = false;
    await sessionTransition(page, "owner", { remount: true });
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("再作成");
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes[3].body.revision, 4, "explicit conflict acknowledgement survives reload");
  } finally { await h.close(); }
});

test("explicit share preview omits private/spoiler notes; URL creation and owner stop work", async () => {
  const h = await harness({ initialRecords: [record(candidates[0], { rating: "liked", note: "公開する一言", spoiler: "no_spoiler" }), record(candidates[1], { note: "PRIVATE_SPOILER", spoiler: "has_spoiler" })] });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: "今の2作品を共有" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await one.getByLabel("この作品を公開").check();
    await page.getByLabel("作品と評価", { exact: true }).check();
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
    const save = page.getByRole("dialog").getByRole("button", { name: "保存して次へ" });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    const bounds = await save.boundingBox();
    assert.ok(bounds.height >= 44 && bounds.width >= 44 && bounds.y >= 0 && bounds.y + bounds.height <= 380);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 900 });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("年", { exact: true }).selectOption("2025");
    await page.getByLabel("クール", { exact: true }).selectOption("SUMMER");
    await expect(page.getByRole("status").first()).toContainText("2025年夏");
    assert.equal(state.images, count);
    assert.equal(state.writes.length, 0);
    assert.equal(await page.getByRole("navigation", { name: "Tierの表示切り替え" }).getByRole("link").count(), 2);
    await page.screenshot({ path: path.join(output, "desktop-simple.png"), fullPage: true });
  } finally { await h.close(); }
});

test("season controls cancel cleanly and save/delete/share all use the canonical selection", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await page.getByRole("dialog").getByLabel("一言（任意・140文字以内）").fill("秋の下書き");
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
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("");
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "今の1作品を共有" }).click();
    await page.getByRole("group", { name: "日本語アニメ一", exact: true }).getByLabel("この作品を公開").check();
    await page.getByRole("button", { name: "公開内容をプレビュー" }).click();
    await page.getByRole("button", { name: "この内容で公開URLを作成" }).click();
    await expect(page.getByRole("link", { name: "作成した共有を開く" })).toBeVisible();
    await page.getByRole("button", { name: "今期チェックに戻る" }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await dialog.getByRole("button", { name: "確認記録を削除", exact: true }).click();
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
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await expect.poll(() => !!heldWrite).toBe(true);
    assert.equal(heldWrite.request().postDataJSON().year, 2025);
    await page.evaluate(() => history.pushState(null, "", "?year=2024&season=SUMMER"));
    await expect(page.locator("[data-season-heading]")).toHaveText("選択中の期（2024年夏）");
    await expect(dialog).not.toBeVisible();
    const writeFinished = page.waitForEvent("requestfinished", (request) => request === heldWrite.request());
    await heldWrite.fulfill({ json: { impression: record(candidates[0], { year: 2025, note: "OLD_SAVE" }) } });
    await writeFinished;
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("一言（任意・140文字以内）")).toHaveValue("");
    await expect(page.getByRole("button", { name: /日本語アニメ一.*未確認/ })).toBeVisible();
    await expect(page.getByText("OLD_PRIVATE_RECORD")).toHaveCount(0);
  } finally { await h.close(); }
});

test("one rating tap then explicit save advances only after server success; close/defer never save", async () => {
  const h = await harness();
  const { page, state } = h;
  try {
    await expect(page.getByRole("button", { name: "今の0作品を共有" })).toBeDisabled();
    await expect(page.getByText("まず1作品を「保存して次へ」で保存すると共有できます。")).toBeVisible();
    await page.getByRole("button", { name: "続きから確認する" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("好き", { exact: true })).toBeFocused();
    await dialog.getByText("好き", { exact: true }).click();
    assert.equal(state.writes.length, 0);
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await page.getByRole("button", { name: /日本語アニメ一/ }).click();
    await expect(dialog.getByLabel("好き", { exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "あとで（保存しない）" }).click();
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    assert.equal(state.writes.length, 0);
    await dialog.getByText("ふつう", { exact: true }).click();
    let held;
    const requested = new Promise((resolve) => page.route("**/api/season-impressions/anilist-2", (route) => { held = route; resolve(); }, { times: 1 }));
    await dialog.getByRole("button", { name: "保存して次へ" }).click();
    await requested;
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
    await expect(dialog.getByRole("button", { name: "処理中…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /日本語アニメ二.*未確認/ })).toBeVisible();
    assert.equal(held.request().postDataJSON().rating, "neutral");
    assert.equal(held.request().postDataJSON().note, null);
    await held.fulfill({ json: { impression: record(candidates[1], { rating: "neutral" }) } });
    await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ一");
    await expect(dialog.getByLabel("好き", { exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: /日本語アニメ二.*確認済み/ })).toBeVisible();
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
      await expect(dialog).toContainText("未確認・入力中");
      await expect(dialog.locator("img")).toHaveCount(mode === "visual" ? 1 : 0);
      if (mode === "visual") {
        await expect(dialog.locator("img")).toBeVisible();
        assert.equal(await dialog.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0), true);
        assert.ok(state.images > 0);
      }
      await dialog.getByLabel("好き", { exact: true }).check();
      await dialog.getByRole("button", { name: "保存して次へ" }).click();
      await expect(dialog.getByRole("heading")).toHaveText("日本語アニメ二");
      await page.keyboard.press("Escape");
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
    await page.getByRole("dialog").getByLabel("一言（任意・140文字以内）").fill("UNSAVED_DRAFT");
    await page.keyboard.press("Escape");
    await expect(page.getByText("未保存の入力は共有に含まれません。")).toBeVisible();
    const entry = page.getByRole("button", { name: "今の1作品を共有" });
    assert.ok((await entry.boundingBox()).y < (await page.getByRole("button", { name: /日本語アニメ一/ }).boundingBox()).y);
    let interactions = 0;
    const tap = async (name) => { interactions++; await page.getByRole("button", { name, exact: true }).click(); };
    await tap("今の1作品を共有");
    await expect(page.getByRole("checkbox", { name: /この作品を公開/ })).toBeChecked();
    await expect(page.getByLabel("作品のみ", { exact: true })).toBeChecked();
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
  const h = await harness({ initialRecords: [record(candidates[0], { note: "UNCHANGED", spoiler: "no_spoiler" }), record(candidates[1], { note: "CHANGED", spoiler: "no_spoiler" }), record(third)] });
  const { page, state } = h;
  try {
    await page.getByRole("button", { name: "今の3作品を共有" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await one.getByLabel("一言も公開").check(); await two.getByLabel("一言も公開").check();
    await page.getByLabel("作品と評価", { exact: true }).check();
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
    await page.getByRole("button", { name: "共有の管理・履歴", exact: true }).click();
    await historyRequested;
    await expect(page.getByText("公開履歴を読み込んでいます…")).toBeVisible();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toHaveCount(0);
    await held.fulfill({ status: 503, json: { error: "履歴の取得に失敗しました。" } });
    await expect(page.getByRole("alert")).toContainText("履歴の取得に失敗");
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "公開履歴を再読み込み" }).click();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "今期チェックに戻る" }).click();
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
    await page.getByRole("dialog").getByLabel("一言（任意・140文字以内）").fill("DRAFT_MUST_STAY_PRIVATE");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "今の2作品を共有" }).click();
    await page.getByRole("button", { name: "「好き」の作品を選ぶ" }).click();
    const one = page.getByRole("group", { name: "日本語アニメ一", exact: true });
    const two = page.getByRole("group", { name: "日本語アニメ二", exact: true });
    await expect(one.getByLabel("この作品を公開")).toBeChecked();
    await expect(two.getByLabel("この作品を公開")).not.toBeChecked();
    await two.locator(".impressions-select-row span").click();
    await expect(two.getByLabel("この作品を公開")).toBeChecked();
    await one.getByLabel("一言も公開").check();
    await page.getByLabel("作品と評価", { exact: true }).check();
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
    for (const label of await dialog.locator(".impressions-rating label").all()) {
      const box = await label.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
    }
    assert.equal(await dialog.evaluate((element) => getComputedStyle(element).animationName), "none");
    await page.setViewportSize({ width: 375, height: 380 });
    const note = dialog.getByLabel("一言（任意・140文字以内）");
    await note.focus();
    await note.fill("キーボードで入力");
    await expect(note).toBeFocused();
    await expect(note).toBeInViewport();
    await page.screenshot({ path: path.join(output, "editor-visual-active-note-200.png") });
    const save = dialog.getByRole("button", { name: "保存して次へ" });
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
      await page.keyboard.press("Tab");
      const note = dialog.getByLabel("一言（任意・140文字以内）");
      await expect(note).toBeFocused();
      await note.fill("長いタイトルでもキーボードで入力して保存");
      await assertReachable(note);
      const save = dialog.getByRole("button", { name: "保存して次へ", exact: true });
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
      await expect(dialog.getByRole("heading")).toHaveText(candidates[1].title);
      assert.equal(state.writes.length, 1);
      assert.equal(state.writes[0].body.anime.title, title);
      assert.equal(state.writes[0].body.rating, "not_for_me");
      assert.equal(state.writes[0].body.note, "長いタイトルでもキーボードで入力して保存");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    } finally { await h.close(); }
  });
}

test("transport loss after one explicit POST locks publishing and navigates only to history", async () => {
  const h = await harness({ initialRecords: [record()] });
  const { page } = h;
  try {
    let posts = 0;
    await page.route("**/api/shares", (route) => { posts++; return route.abort("failed"); });
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
