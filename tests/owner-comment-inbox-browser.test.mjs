import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "artifacts", "owner-comment-inbox");
const bundleOutput = path.join(root, "test-results", "owner-comment-inbox");
let browser;
let bundle;
const at = "2026-10-03T01:00:00.000Z";
const item = (shareId = "tier-a", kind = "tier", extra = {}) => ({
  shareId, kind, sharedAt: at, commentCount: 2, latestCommentAt: at, preview: "日本語のコメント", ...extra
});
before(async () => {
  mkdirSync(output, { recursive: true });
  mkdirSync(bundleOutput, { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, target: "web", context: root,
      entry: path.join(root, "tests/owner-comment-inbox-browser-entry.tsx"),
      output: { path: bundleOutput, filename: "inbox.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      externals: { "next-auth/react": "window __inboxAuth", "next/navigation": "window __inboxNavigation", "next/link": "window __inboxLink" },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, "tests/owner-comment-inbox-loader.cjs") }] }
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors()
      ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  bundle = readFileSync(path.join(bundleOutput, "inbox.js"), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
});
after(async () => { await browser?.close(); });

async function harness({ items = [], theme = "dark", width = 375, session = "authenticated", onRead } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = { items, status: 200, reads: [], nextCursor: null, destinations: [] };
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/dashboard") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/dashboard/comments") {
      assert.equal(req.method(), "GET");
      state.reads.push({ owner: req.headers()["x-comment-inbox-owner"], cursor: url.searchParams.get("cursor") });
      if (onRead) return onRead(route, state);
      return route.fulfill({ status: state.status, json: state.status === 200
        ? { items: state.items, nextCursor: state.nextCursor } : { error: "internal detail must not be rendered" } });
    }
    if (/^\/(share|dashboard\/share|watchlist\/share)\//.test(url.pathname)) {
      state.destinations.push(url.pathname);
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><body>共有先</body></html>' });
    }
    errors.push(`Unexpected request ${req.method()} ${url.pathname}`);
    return route.abort();
  });
  // All requests are intercepted in-process; this harness cannot touch production.
  await page.goto("https://inbox.test/dashboard");
  await page.evaluate(({ theme, session }) => {
    document.documentElement.dataset.theme = theme;

    window.fixture = { session: { status: session, data: session === "authenticated" ? { user: { id: "owner-a" } } : null } };
  }, { theme, session });
  await page.addStyleTag({ content: readFileSync(path.join(root, "app/globals.css"), "utf8") });
  await page.addScriptTag({ content: bundle });
  const inbox = page.getByRole("region", { name: "共有へのコメント" });
  await expect(inbox).toBeVisible();
  return { page, state, inbox, close: async () => { await context.close(); assert.deepEqual(errors, []); } };
}

test("ordinary signed-in users see distinct loading, empty, failure and keyboard retry states", async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let first = true;
  const h = await harness({ onRead: async (route, state) => {
    if (first) { first = false; await waiting; }
    return route.fulfill({ status: state.status, json: state.status === 200 ? { items: state.items, nextCursor: null } : { error: "private diagnostic" } });
  } });
  try {
    await expect(h.inbox.getByRole("status")).toHaveText("コメントを読み込んでいます…");
    await expect(h.inbox.getByText("共有へのコメントはまだありません。")).toHaveCount(0);
    release();
    await expect(h.inbox.getByRole("status")).toHaveText("共有へのコメントはまだありません。");
    h.state.status = 503;
    await h.inbox.getByRole("button", { name: "更新する" }).click();
    await expect(h.inbox.getByRole("alert")).toHaveText("コメントを取得できませんでした。再試行してください。");
    await expect(h.inbox.getByText("共有へのコメントはまだありません。")).toHaveCount(0);
    assert.ok(!(await h.inbox.textContent()).includes("private diagnostic"));
    h.state.status = 200; h.state.items = [item()];
    await h.inbox.getByRole("button", { name: "再試行" }).focus();
    await h.page.keyboard.press("Enter");
    await expect(h.inbox.getByRole("link", { name: /共有を開く/ })).toHaveCount(1);
    await expect(h.inbox.getByRole("alert")).toHaveCount(0);
  } finally { release(); await h.close(); }
});

test("plain-text XSS previews are bounded, dates/counts render and every share link navigates correctly", async () => {
  const preview = '<img src=x onerror="window.xss=1"><script>window.xss=1</script>\n' + "😀長文".repeat(100);
  for (const [kind, prefix] of [["tier", "/share/"], ["dashboard", "/dashboard/share/"], ["watchlist", "/watchlist/share/"]]) {
    const h = await harness({ items: [item(`id-${kind}`, kind, { preview })] });
    try {
      await expect(h.inbox.getByText("コメント 2件", { exact: true })).toBeVisible();
      await expect(h.inbox.locator("time")).toHaveCount(2);
      assert.deepEqual(await h.inbox.locator("time").evaluateAll((elements) => elements.map((e) => e.dateTime)), [at, at]);
      const snippet = h.inbox.locator(".owner-comment-inbox_preview");
      const text = await snippet.textContent();
      assert.equal(Array.from(text).length, 120); assert.ok(text.endsWith("…"));
      assert.ok(text.startsWith("<img"));
      await expect(h.inbox.locator("img,script")).toHaveCount(0);
      assert.equal(await h.page.evaluate(() => window.xss), undefined);
      const link = h.inbox.getByRole("link", { name: /共有を開く/ });
      await expect(link).toHaveAttribute("href", `${prefix}id-${kind}`);
      await link.focus(); await h.page.keyboard.press("Enter");
      await expect(h.page).toHaveURL(`https://inbox.test${prefix}id-${kind}`);
      assert.deepEqual(h.state.destinations, [`${prefix}id-${kind}`]);
    } finally { await h.close(); }
  }
});

test("focus, visibility and history restoration immediately refetch moderated results without stale previews", async () => {
  const h = await harness({ items: [item()] });
  try {
    await expect(h.inbox.getByText("コメント 2件")).toBeVisible();
    for (const event of ["focus", "visibilitychange", "pageshow"]) {
      h.state.items = [item("tier-a", "tier", { commentCount: 1, preview: `after-${event}` })];
      const count = h.state.reads.length;
      await h.page.evaluate((event) => (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)), event);
      await expect(h.inbox.getByText(`after-${event}`, { exact: true })).toBeVisible();
      assert.ok(h.state.reads.length > count);
      await expect(h.inbox.getByText("コメント 2件")).toHaveCount(0);
    }
    h.state.items = [];
    await h.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(h.inbox.getByText("共有へのコメントはまだありません。")).toBeVisible();
    await expect(h.inbox.getByRole("listitem")).toHaveCount(0);
  } finally { await h.close(); }
});

test("bounded pages append without duplicates and refresh resets the cursor", async () => {
  const h = await harness({ onRead: (route, state) => {
    const cursor = state.reads.at(-1).cursor;
    return route.fulfill({ json: cursor
      ? { items: [item("tier-a"), item("tier-b")], nextCursor: null }
      : { items: [item("tier-a")], nextCursor: `${at}|tier-a` } });
  } });
  try {
    await h.inbox.getByRole("button", { name: "もっと見る" }).click();
    await expect(h.inbox.getByRole("listitem")).toHaveCount(2);
    assert.equal(h.state.reads.at(-1).cursor, `${at}|tier-a`);
    await expect(h.inbox.getByRole("button", { name: "もっと見る" })).toHaveCount(0);
    await h.inbox.getByRole("button", { name: "更新する" }).click();
    await expect(h.inbox.getByRole("listitem")).toHaveCount(1);
    assert.equal(h.state.reads.at(-1).cursor, null);
  } finally { await h.close(); }
});

test("signed-out/loading sessions never fetch private data, and expired sessions clear an existing inbox", async () => {
  for (const session of ["unauthenticated", "loading"]) {
    const h = await harness({ session });
    try {
      await expect(h.inbox.getByRole("status")).toHaveText(session === "loading"
        ? "コメントを読み込んでいます…" : "ログインして共有へのコメントを確認してください。");
      assert.equal(h.state.reads.length, 0);
    } finally { await h.close(); }
  }
  const h = await harness({ items: [item()] });
  try {
    await expect(h.inbox.getByRole("listitem")).toHaveCount(1);
    h.state.status = 401;
    await h.inbox.getByRole("button", { name: "更新する" }).click();
    await expect(h.inbox.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", "/?login=required&returnTo=%2Fdashboard");
    await expect(h.inbox.getByRole("listitem")).toHaveCount(0);
  } finally { await h.close(); }
});

test("account changes discard displayed rows and pending responses belonging to the previous account", async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let markCompleted;
  const completed = new Promise((resolve) => { markCompleted = resolve; });
  let hold = false;
  const h = await harness({ onRead: async (route, state) => {
    const owner = state.reads.at(-1).owner;
    if (hold && owner === "owner-a") await waiting;
    await route.fulfill({ json: { items: owner === "owner-a" ? [item("a-private", "tier", { preview: "owner-a-preview" })] : [], nextCursor: null } });
    if (hold && owner === "owner-a") markCompleted();
  } });
  try {
    await expect(h.inbox.getByText("owner-a-preview")).toBeVisible();
    hold = true;
    await h.inbox.getByRole("button", { name: "更新する" }).click();
    await expect(h.inbox.getByRole("status")).toHaveText("コメントを読み込んでいます…");
    await h.page.evaluate(() => { window.fixture.session.data.user.id = "owner-b"; window.renderInbox(); });
    await expect(h.inbox.getByText("共有へのコメントはまだありません。")).toBeVisible();
    release();
    await completed;
    await expect(h.inbox.getByText("owner-a-preview")).toHaveCount(0);
    assert.equal(h.state.reads.at(-1).owner, "owner-b");
    await h.page.evaluate(() => { window.fixture.session = { status: "unauthenticated", data: null }; window.renderInbox(); });
    await expect(h.inbox.getByRole("link", { name: "ログインする" })).toBeVisible();
  } finally { release(); await h.close(); }
});

for (const theme of ["light", "dark"]) {
  for (const scale of [100, 200]) {
    test(`375px ${theme} ${scale}% text: keyboard, 44px targets, wrapping and bottom nav clearance`, async () => {
      const h = await harness({ theme, items: [item("one", "tier", { preview: "とても長い日本語のコメント😀".repeat(20) }), item("two", "dashboard", { preview: "x".repeat(120) })] });
      try {
        await expect(h.inbox.getByRole("listitem")).toHaveCount(2);
        await h.page.addStyleTag({ content: `html { font-size: ${scale}%; }` });
        assert.ok(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await h.inbox.evaluate((element) => element.scrollWidth <= element.clientWidth));
        const update = h.inbox.getByRole("button", { name: "更新する" });
        await update.focus();
        await h.page.keyboard.press("Tab");
        const links = h.inbox.getByRole("link", { name: /共有を開く/ });
        await expect(links.first()).toBeFocused();
        await h.page.keyboard.press("Tab");
        await expect(links.last()).toBeFocused();
        for (const control of [update, links.first(), links.last()]) {
          const box = await control.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.x >= 0 && box.x + box.width <= 375);
        }
        await h.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const lastBox = await links.last().boundingBox();
        const navBox = await h.page.getByRole("navigation", { name: "主要ページ" }).boundingBox();
        assert.ok(lastBox.y + lastBox.height <= navBox.y, "last inbox action must clear the real bottom nav");
        assert.ok(await links.last().evaluate((element) => getComputedStyle(element).outlineStyle !== "none"));
        await h.page.screenshot({ path: path.join(output, `inbox-375-${theme}-${scale}.png`), fullPage: true });
      } finally { await h.close(); }
    });
  }
}

test("desktop retains the same inbox content and actions", async () => {
  const h = await harness({ width: 1280, items: [item()] });
  try {
    await expect(h.inbox.getByRole("listitem")).toHaveCount(1);
    await expect(h.inbox.getByRole("link", { name: /共有を開く/ })).toBeVisible();
    assert.ok(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await h.page.screenshot({ path: path.join(output, "inbox-desktop.png"), fullPage: true });
  } finally { await h.close(); }
});
