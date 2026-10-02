import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
let output, browser, bundle;
before(async () => {
  output = mkdtempSync(path.join(tmpdir(), "atb780-race-bundle-"));
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, target: "web", context: root,
      entry: path.join(root, "tests/season-load-races-entry.tsx"), output: { path: output, filename: "race.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      externals: { "next-auth/react": "window __raceAuth", "next/navigation": "window __raceNavigation", "next/link": "window __raceLink", "next/image": "window __raceImage" },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, "tests/impressions-tsx-loader.cjs") }] }
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  bundle = readFileSync(path.join(output, "race.js"), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
});
after(async () => {
  await browser?.close();
  if (output) rmSync(output, { recursive: true, force: true });
});

const payload = (season, year = 2025, label = season) => ({ year, season, source: "anilist", cached: false, freshness: "fresh", fetchedAt: "2026-01-01T00:00:00Z",
  items: [{ id: `anilist-${year}-${label}`, source: "anilist", title: `${year} ${label} 作品`, titles: { native: `${year} ${label} 作品` }, seasonYear: year, season, imageUrl: "", proxiedImageUrl: "", siteUrl: "https://example.invalid/anime" }] });
async function harness(t, kind, authenticated = false) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", (route) => new URL(route.request().url()).pathname === "/test"
    ? route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><body><div id="root"></div></body></html>' })
    : route.abort());
  t.after(async () => {
    await page.evaluate(() => window.race?.unmount());
    const state = await page.evaluate(() => window.race?.snapshot());
    await context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(state?.unexpected, []);
  });
  await page.goto("http://race.invalid/test?year=2025&season=WINTER");
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([kind, authenticated]) => window.race.mount(kind, authenticated), [kind, authenticated]);
  return {
    state: () => page.evaluate(() => window.race.snapshot()),
    select: (season, year) => page.evaluate(([season, year]) => window.race.select(season, year), [season, year]),
    history: (direction) => page.evaluate((direction) => window.race.history(direction), direction),
    rapid: (seasons) => page.evaluate((seasons) => window.race.rapid(seasons), seasons),
    headers: (index) => page.evaluate((index) => window.race.headers(index), index),
    body: (index, outcome, body) => page.evaluate(([index, outcome, body]) => window.race.body(index, outcome, body), [index, outcome, body]),
    settle: (index, outcome, body) => page.evaluate(([index, outcome, body]) => window.race.settle(index, outcome, body), [index, outcome, body])
  };
}
function requestIndex(state, season, path = "/api/anime/seasonal") {
  const index = state.requests.findIndex((request) => request.season === season && request.path === path && !request.settled);
  assert.notEqual(index, -1, `pending ${path} ${season}`);
  return index;
}
function assertCurrent(state, season, { loading = false, titles = [`2025 ${season} 作品`], alerts = [] } = {}) {
  assert.equal(state.season, season);
  assert.equal(state.loading, loading, "loading belongs to the active request");
  assert.deepEqual(state.titles, titles, "only active-context items are shown");
  assert.deepEqual(state.alerts, alerts, "errors belong to the active request");
}
function assertStorage(state) {
  for (const { key, board } of state.writes) {
    assert.equal(key, `anime-tier-board:v1:${board.seasonYear}:${board.season}`, "every persistence write matches board context");
  }
}

for (const kind of ["tier", "explore"]) {
  for (const outcome of ["success", "error", "reject", "malformed"]) {
    for (const currentPending of [true, false]) {
      test(`${kind}: late WINTER ${outcome} cannot alter SUMMER ${currentPending ? "pending" : "loaded"} state`, async (t) => {
        const h = await harness(t, kind);
        const winter = requestIndex(await h.state(), "WINTER");
        await h.select("SUMMER");
        const summer = requestIndex(await h.state(), "SUMMER");
        if (!currentPending) await h.settle(summer, "success", payload("SUMMER"));
        await h.settle(winter, outcome, { ...payload("WINTER"), warning: "古い警告", error: "旧シーズンのエラー" });
        const state = await h.state();
        assertCurrent(state, "SUMMER", { loading: currentPending, titles: currentPending ? [] : ["2025 SUMMER 作品"] });
        assert.equal(state.warning, kind === "explore" && !currentPending
          ? "最新の季節データです。データ元: anilist / 最終取得: 2026/1/1 09:00"
          : null);
        assertStorage(state);
        if (currentPending) {
          await h.settle(summer, "success", payload("SUMMER"));
          assertCurrent(await h.state(), "SUMMER");
        }
      });
    }
  }

  test(`${kind}: batched A to B to A starts a replacement load for the final visit`, async (t) => {
    const h = await harness(t, kind, kind === "tier");
    const winter = requestIndex(await h.state(), "WINTER");
    if (kind === "tier") await h.settle(winter, "success", payload("WINTER"));
    const oldWinter = kind === "tier" ? requestIndex(await h.state(), "WINTER", "/api/boards") : winter;
    await h.rapid(["SUMMER", "WINTER"]);
    await h.settle(oldWinter, "success", kind === "tier" ? { board: null } : payload("WINTER", 2025, "OLD"));
    assertCurrent(await h.state(), "WINTER", { loading: true, titles: [] });
    const newWinter = requestIndex(await h.state(), "WINTER", kind === "tier" ? "/api/boards" : "/api/anime/seasonal");
    await h.settle(newWinter, "success", kind === "tier" ? { board: null } : payload("WINTER"));
    assertCurrent(await h.state(), "WINTER");
  });

  test(`${kind}: back/forward invalidates the previous visit to the same season`, async (t) => {
    const h = await harness(t, kind, kind === "tier");
    const winter = requestIndex(await h.state(), "WINTER");
    if (kind === "tier") await h.settle(winter, "success", payload("WINTER"));
    const oldWinter = kind === "tier" ? requestIndex(await h.state(), "WINTER", "/api/boards") : winter;
    await h.select("SUMMER");
    await h.history("back");
    await h.settle(oldWinter, "success", kind === "tier" ? { board: null } : payload("WINTER", 2025, "OLD"));
    assertCurrent(await h.state(), "WINTER", { loading: true, titles: [] });
    const newWinter = requestIndex(await h.state(), "WINTER", kind === "tier" ? "/api/boards" : "/api/anime/seasonal");
    await h.settle(newWinter, "success", kind === "tier" ? { board: null } : payload("WINTER"));
    assertCurrent(await h.state(), "WINTER");
    await h.history("forward");
    const state = await h.state();
    assert.equal(state.season, "SUMMER");
    assert.equal(state.loading, true);
    assertStorage(state);
  });
}

test("tier: changing year cannot save the previous board under the next context", async (t) => {
  const h = await harness(t, "tier");
  await h.settle(requestIndex(await h.state(), "WINTER"), "success", payload("WINTER"));
  assertCurrent(await h.state(), "WINTER");
  await h.select("WINTER", 2024);
  const state = await h.state();
  assert.equal(state.year, "2024");
  assertStorage(state);
  assert.equal(state.storage["anime-tier-board:v1:2024:WINTER"], undefined);
  await h.settle(requestIndex(state, "WINTER"), "success", payload("WINTER", 2024));
  assertCurrent(await h.state(), "WINTER", { titles: ["2024 WINTER 作品"] });
  assertStorage(await h.state());
});

for (const outcome of ["success", "error", "reject", "malformed"]) {
  test(`home: cached A is immediately usable after pending B; late B ${outcome} is ignored`, async (t) => {
    const h = await harness(t, "home");
    await h.settle(requestIndex(await h.state(), "WINTER"), "success", payload("WINTER"));
    assertCurrent(await h.state(), "WINTER");
    await h.select("SUMMER");
    const summer = requestIndex(await h.state(), "SUMMER");
    assertCurrent(await h.state(), "SUMMER", { loading: true, titles: [] });
    await h.history("back");
    assertCurrent(await h.state(), "WINTER");
    assert.equal((await h.state()).requests.length, 2, "cache hit must not refetch A");
    await h.settle(summer, outcome, { ...payload("SUMMER"), error: "古いエラー" });
    assertCurrent(await h.state(), "WINTER");
    await h.history("forward");
    assertCurrent(await h.state(), "SUMMER", { loading: true, titles: [] });
    await h.settle(requestIndex(await h.state(), "SUMMER"), "success", payload("SUMMER"));
    assertCurrent(await h.state(), "SUMMER");
  });
}

for (const kind of ["tier", "explore"]) {
  for (const outcome of ["success", "reject"]) {
    test(`${kind}: old response body ${outcome} after navigation cannot end active loading`, async (t) => {
      const h = await harness(t, kind);
      const winter = requestIndex(await h.state(), "WINTER");
      await h.headers(winter);
      await h.select("SUMMER");
      await h.body(winter, outcome, payload("WINTER"));
      assertCurrent(await h.state(), "SUMMER", { loading: true, titles: [] });
      await h.settle(requestIndex(await h.state(), "SUMMER"), "success", payload("SUMMER"));
      assertCurrent(await h.state(), "SUMMER");
    });
  }

  test(`${kind}: active failure remains intact after an old season succeeds`, async (t) => {
    const h = await harness(t, kind);
    const winter = requestIndex(await h.state(), "WINTER");
    await h.select("SUMMER");
    await h.settle(requestIndex(await h.state(), "SUMMER"), "error", { error: "夏の取得失敗" });
    const failed = await h.state();
    assert.equal(failed.loading, false);
    assert.equal(failed.alerts.length, 1, "active errors must still be displayed");
    assert.deepEqual(failed.titles, []);
    await h.settle(winter, "success", payload("WINTER"));
    assertCurrent(await h.state(), "SUMMER", { titles: [], alerts: failed.alerts });
    assertStorage(await h.state());
  });
}

for (const outcome of ["success", "error", "reject", "malformed"]) {
  test(`tier: late remote WINTER board ${outcome} cannot replace or persist over SUMMER`, async (t) => {
    const h = await harness(t, "tier", true);
    await h.settle(requestIndex(await h.state(), "WINTER"), "success", payload("WINTER"));
    const winterBoard = requestIndex(await h.state(), "WINTER", "/api/boards");
    await h.select("SUMMER");
    await h.settle(requestIndex(await h.state(), "SUMMER"), "success", payload("SUMMER"));
    await h.settle(requestIndex(await h.state(), "SUMMER", "/api/boards"), "success", { board: null });
    assertCurrent(await h.state(), "SUMMER");
    const before = await h.state();
    await h.settle(winterBoard, outcome, { board: null });
    const after = await h.state();
    assertCurrent(after, "SUMMER");
    assert.deepEqual(after.storage, before.storage);
    assert.deepEqual(after.writes, before.writes);
    assertStorage(after);
  });
}

test("explore: changing to another year/all-season context invalidates a seasonal request", async (t) => {
  const h = await harness(t, "explore");
  const winter = requestIndex(await h.state(), "WINTER");
  await h.select("ALL", 2024);
  const all = requestIndex(await h.state(), "all");
  await h.settle(winter, "success", payload("WINTER"));
  assertCurrent(await h.state(), "ALL", { loading: true, titles: [] });
  await h.settle(all, "success", payload("all", 2024));
  assert.equal((await h.state()).year, "2024");
  assertCurrent(await h.state(), "ALL", { titles: ["2024 all 作品"] });
});

test("home: failure in B does not discard cached A or leave its error on A", async (t) => {
  const h = await harness(t, "home");
  await h.settle(requestIndex(await h.state(), "WINTER"), "success", payload("WINTER"));
  await h.select("SUMMER");
  await h.settle(requestIndex(await h.state(), "SUMMER"), "error", { error: "夏の取得失敗" });
  assertCurrent(await h.state(), "SUMMER", { titles: [], alerts: ["夏の取得失敗"] });
  await h.history("back");
  assertCurrent(await h.state(), "WINTER");
  assert.equal((await h.state()).requests.length, 2, "failed B must preserve cached A");
});
