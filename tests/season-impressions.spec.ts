import { test, expect, type Route } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { getCurrentAnimeSeason, seasonHeadingJa } from "../lib/season";

// App Router, hydration, JWT sessions, write/read routes and local DB are real.
// Catalog/artwork are offline fixtures; no real OAuth credentials are used.
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });
const anime = { id: "anilist-779", source: "anilist", title: "今期チェック検証作品", imageUrl: "" };
const input = { year: 2026, season: "FALL", anime, revision: 0, rating: null, note: "非公開の入力", spoiler: "unspecified" };

test.beforeEach(async ({ context, baseURL }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) return route.abort();
    if (url.pathname === "/api/anime/seasonal") {
      return route.fulfill({ json: { year: Number(url.searchParams.get("year")), season: url.searchParams.get("season"), items: [anime], cached: true, source: "anilist" } });
    }
    // In particular, /api/auth/* and /api/season-impressions/* are never fulfilled here.
    return route.continue();
  });
  await context.addInitScript(() => localStorage.setItem("numanie-display-mode", "simple"));
});

test("real App Router renders guest input and navigates seasons without an automatic write", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (["PUT", "POST", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/tier/impressions?year=2026&season=FALL");
  await expect(page.getByRole("heading", { name: "今期チェック", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /今期チェック検証作品/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("いまの一言").fill(input.note);
  await expect(dialog.getByRole("button", { name: "Googleでログインして保存へ" })).toBeEnabled();
  expect(page.url()).not.toContain(encodeURIComponent(input.note));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByLabel("年", { exact: true }).selectOption("2025");
  await page.getByLabel("クール", { exact: true }).selectOption("SUMMER");
  await expect(page).toHaveURL(/year=2025&season=SUMMER/);
  await expect(page.getByRole("button", { name: /今期チェック検証作品/ })).toBeEnabled();
  expect(writes).toEqual([]);
});

test("real Next API boundary rejects guest CRUD, private cursors, share creation and revocation", async ({ request, baseURL }) => {
  const session = await request.get("/api/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
  const calls = [
    ["GET", "/api/season-impressions?year=2026&season=FALL&userId=owner"],
    ["PUT", "/api/season-impressions/anilist-779"],
    ["DELETE", "/api/season-impressions/anilist-779"],
    ["GET", "/api/shares?kind=season-impressions"],
    ["POST", "/api/shares"],
    ["DELETE", "/api/shares/unauthorized-share"]
  ];
  for (const [method, url] of calls) {
    const response = await request.fetch(url, { method, headers: { Origin: baseURL!, "X-Impression-Owner": "owner" },
      ...(method === "GET" ? {} : { data: input }) });
    expect(response.status(), `${method} ${url}`).toBe(401);
    const body = await response.json();
    expect(body.error).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/deletedRevisions|非公開の入力/);
  }
});

test("guest hydration never exposes legacy or account-owned drafts even with a return token", async ({ page }) => {
  const token = "12345678-1234-1234-1234-123456789012";
  await page.addInitScript(({ token, input }) => {
    sessionStorage.setItem("numanie:impressions:auth-draft:v1", JSON.stringify({ version: 1, token, createdAt: Date.now(), input }));
    sessionStorage.setItem("numanie:impressions:auth-draft:v2", JSON.stringify({ version: 2, ownerId: "owner", token, createdAt: Date.now(), input }));
  }, { token, input });
  await page.goto(`/tier/impressions?year=2026&season=FALL&resume=${token}`);
  await expect(page.getByRole("button", { name: "元のアカウントで再ログイン" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /今期チェック検証作品/ }).click();
  await expect(page.getByRole("dialog").getByLabel("いまの一言")).toHaveValue("");
  expect(await page.content()).not.toContain(input.note);
});

test("canonical query, explicit current labels, rollover and history agree with catalog requests", async ({ page, isMobile }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/anime/seasonal") requested.push(url.search);
  });
  const current = getCurrentAnimeSeason();
  await page.goto("/tier/impressions?year=2e3&season=FALL&keep=1#context");
  await expect(page).toHaveURL(/\/tier\/impressions\?keep=1#context$/);
  const heading = page.locator("[data-season-heading]");
  await expect(heading).toHaveText(`今期（${seasonHeadingJa(current)}）`);
  await expect(page.getByRole("button", { name: /今期チェック検証作品/ })).toBeEnabled();
  expect(requested).toContain(`?year=${current.year}&season=${current.season}`);
  await page.evaluate((ref) => history.pushState(null, "", `?year=${ref.year}&season=${ref.season}&keep=1#context`), current);
  await expect(heading).toHaveText(`選択中の期（${seasonHeadingJa(current)}）`);
  await page.goBack();
  await expect(heading).toHaveText(`今期（${seasonHeadingJa(current)}）`);
  await page.goForward();
  await expect(heading).toHaveText(`選択中の期（${seasonHeadingJa(current)}）`);
  await page.goto("/tier/impressions?year=2024&season=fall&keep=1#context");
  await expect(page).toHaveURL(/year=2024&season=FALL&keep=1#context$/);
  await page.getByRole("button", { name: /次の期/ }).click();
  await expect(page).toHaveURL(/year=2025&season=WINTER&keep=1#context$/);
  await expect(heading).toHaveText("選択中の期（2025年冬）");
  await expect(page.getByRole("button", { name: /今期チェック検証作品/ })).toBeEnabled();
  expect(requested).toContain("?year=2025&season=WINTER");
  await page.goBack();
  await expect(heading).toHaveText("選択中の期（2024年秋）");
  await page.goForward();
  await expect(heading).toHaveText("選択中の期（2025年冬）");
  const area = page.getByRole("navigation", { name: "Tierの表示切り替え" });
  await expect(page.locator(".tier-area-nav")).toHaveCount(1);
  await expect(area.getByRole("link", { name: "Tier表", exact: true })).toHaveAttribute("href", "/tier?year=2025&season=WINTER");
  for (const tab of await area.getByRole("link").all()) {
    const box = await tab.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(await tab.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
  }
  if (isMobile) {
    const bottomNav = page.getByRole("navigation", { name: "主要ページ" });
    const impressionTab = bottomNav.getByRole("link", { name: "Tier 今期チェック" });
    const box = await impressionTab.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(52);
    expect(Number.parseFloat(await impressionTab.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThan(10);
    await expect(impressionTab.locator(".mobile-nav-tier-label")).toHaveText("今期チェック");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("late catalog responses cannot replace the selected season in the real router", async ({ page }) => {
  let held: Route | undefined;
  await page.route("**/api/anime/seasonal**", (route) => {
    const url = new URL(route.request().url());
    const year = Number(url.searchParams.get("year"));
    if (year === 2023) { held = route; return; }
    return route.fulfill({ json: { year, season: "FALL", items: [{ ...anime, title: `${year}年の作品` }], source: "anilist" } });
  });
  await page.goto("/tier/impressions?year=2023&season=FALL");
  await expect.poll(() => !!held).toBe(true);
  await page.getByRole("combobox", { name: "年", exact: true }).selectOption("2024");
  await expect(page.getByRole("button", { name: /2024年の作品/ })).toBeEnabled();
  const finished = page.waitForEvent("requestfinished", (request) => request === held!.request());
  await held!.fulfill({ json: { year: 2023, season: "FALL", items: [{ ...anime, title: "2023年の古い応答" }], source: "anilist" } });
  await finished;
  await page.getByRole("button", { name: /2024年の作品/ }).click();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("2024年の作品");
  await expect(page.getByText("2023年の古い応答")).toHaveCount(0);
  await expect(page.locator("[data-season-heading]")).toHaveText("選択中の期（2024年秋）");
});

test("owner lost PUT response requires reconciliation and explicit continuation after closing the editor", async ({ context, page, baseURL }) => {
  const userId = `impressions-local-${randomUUID()}`;
  const cookieName = "authjs.session-token";
  const token = await encode({ secret: "local-guest-router-tests-no-authentication-issued", salt: cookieName,
    token: { sub: userId, name: "Local fixture" } });
  await context.addCookies([{ name: cookieName, value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
  const writes: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === `/api/season-impressions/${anime.id}`) writes.push(request.postDataJSON().revision);
  });
  await page.route(`**/api/season-impressions/${anime.id}`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  }, { times: 1 });
  await page.goto("/tier/impressions?year=2026&season=FALL");
  await page.getByRole("button", { name: /今期チェック検証作品/ }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "保存する", exact: true });
  await dialog.getByLabel("いまの一言").fill("応答が失われても入力を保持");
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("保存結果を確認できませんでした");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: /今期チェック検証作品/ }).click();
  await expect(save).toBeDisabled();
  await expect(dialog.getByLabel("いまの一言")).toHaveValue("応答が失われても入力を保持");
  expect(writes).toEqual([0]);
  await dialog.getByRole("button", { name: "入力を保持して最新の記録を確認" }).click();
  await expect(dialog.getByText(/最新の記録：.*応答が失われても入力を保持/)).toBeVisible();
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "現在の入力で編集を続ける" }).click();
  expect(writes).toEqual([0]);
  await dialog.getByLabel("いまの一言").fill("最新の記録を確認して編集");
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([0, 1]);
  await expect(page.getByText("1作品を記録", { exact: true })).toBeVisible();
  const response = await context.request.get("/api/season-impressions?year=2026&season=FALL", { headers: { "X-Impression-Owner": userId } });
  expect(response.status()).toBe(200);
  const records = (await response.json()).impressions;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ note: "最新の記録を確認して編集", revision: 2 });
});

for (const mode of ["simple", "visual"]) {
  test(`owner ${mode}: real save, four-action publish, public immutable snapshot, confirmed revoke and safe 404`, async ({ context, page, baseURL, isMobile }) => {
    const userId = `impressions-local-${randomUUID()}`;
    const cookieName = "authjs.session-token";
    const token = await encode({ secret: "local-guest-router-tests-no-authentication-issued", salt: cookieName,
      token: { sub: userId, name: "Local fixture" } });
    await context.addCookies([{ name: cookieName, value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    const headers = { Origin: baseURL!, "X-Impression-Owner": userId };
    expect((await (await context.request.get("/api/auth/session")).json()).user.id).toBe(userId);
    const artwork = { ...anime, imageUrl: "https://s4.anilist.co/local-artwork.jpg", title: isMobile
      ? "今期チェック検証作品・異世界に転生した私が小さな図書館で出会った仲間たちと失われた物語を探す旅に出たら、いつの間にか王国の未来を託されていました〜それでも毎朝おいしい朝ごはんを食べながら、みんなで笑って暮らせる日常を取り戻したい〜"
      : anime.title };
    const next = { ...artwork, id: "anilist-780", title: "次の未記録作品" };
    await context.route("**/api/anime/seasonal**", (route) => route.fulfill({ json: {
      year: 2026, season: "FALL", items: [artwork, next], source: "anilist", cached: true
    } }));
    let imageRequests = 0;
    await context.route("**/api/image-proxy**", (route) => {
      imageRequests++;
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="gray"/></svg>' });
    });
    await page.addInitScript((mode) => {
      localStorage.setItem("numanie-display-mode", mode);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedUrl: string }).copiedUrl = text; } } });
    }, mode);
    const writes: string[] = [];
    page.on("request", (request) => { if (["PUT", "POST", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    await page.goto("/tier/impressions?year=2026&season=FALL");
    await page.getByRole("button", { name: "自分の今期カードを見る" }).click();
    await expect(page.getByRole("button", { name: "今の0作品を共有" })).toBeDisabled();
    await page.getByRole("button", { name: "次の作品に一言" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /今期チェック検証作品/ }).click();
    const dialog = page.getByRole("dialog");
    if (isMobile) {
      await page.addStyleTag({ content: ".impressions-sheet { font-size: 200%; } .impressions-sheet :is(button, select, textarea) { font-size: inherit; }" });
      await page.setViewportSize({ width: 375, height: 380 });
      expect(await dialog.getByRole("heading").evaluate((element) =>
        element.getBoundingClientRect().height > element.closest(".bottom-sheet")!.clientHeight)).toBe(true);
    }
    await expect(dialog).toHaveAccessibleName(artwork.title);
    await expect(dialog.locator("img")).toHaveCount(mode === "visual" ? 1 : 0);
    if (mode === "visual") {
      await expect(dialog.locator("img")).toBeVisible();
      await expect(dialog.locator("img")).toHaveJSProperty("complete", true);
      expect(await dialog.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    await dialog.getByText("評価を添える（任意）", { exact: true }).click();
    await dialog.getByLabel("好き", { exact: true }).check();
    await expect(dialog.getByLabel("好き", { exact: true })).toBeFocused();
    await expect(dialog.getByLabel("好き", { exact: true })).toBeInViewport({ ratio: 1 });
    await dialog.getByLabel("いまの一言").fill("公開しない保存済み感想");
    await expect(dialog.getByLabel("いまの一言")).toBeFocused();
    await expect(dialog.getByLabel("いまの一言")).toBeInViewport({ ratio: 1 });
    expect(writes).toEqual([]);
    const save = dialog.getByRole("button", { name: /^(保存する|確認だけ記録する)$/ });
    await save.focus();
    await expect(save).toBeFocused();
    await expect(save).toBeInViewport({ ratio: 1 });
    expect(await save.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const sheet = element.closest(".bottom-sheet")!;
      const bounds = sheet.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight && sheet.scrollWidth <= sheet.clientWidth
        && box.top >= bounds.top && box.bottom <= bounds.bottom && box.width >= 44 && box.height >= 44
        && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await save.click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "次の作品に一言", exact: true }).click();
    await page.getByRole("button", { name: /次の未記録作品/ }).click();
    await dialog.getByLabel("いまの一言").fill("未保存の秘密");
    await page.keyboard.press("Escape");
    if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
    const savedResponse = await context.request.get("/api/season-impressions?year=2026&season=FALL", { headers });
    const saved = (await savedResponse.json()).impressions;
    expect(saved).toHaveLength(1); expect(saved[0].rating).toBe("liked");
    await page.getByRole("button", { name: "自分の今期カードを見る" }).click();
    await expect(page.getByText("未保存の入力は共有に含まれません。")).toBeVisible();
    let interactions = 0;
    const tap = async (name: string) => { interactions++; await page.getByRole("button", { name, exact: true }).click(); };
    await tap("今の1作品を共有");
    await tap("公開内容をプレビュー");
    const preview = page.getByRole("region", { name: "公開内容のプレビュー" });
    await expect(preview).not.toContainText(/公開しない保存済み感想|未保存の秘密|次の未記録作品/);
    await page.goBack(); await expect(page.getByLabel("評価も公開").first()).not.toBeChecked();
    await page.goForward(); await expect(preview).toBeVisible();
    const previewContents = await preview.locator(".impressions-list").innerText();
    await tap("この内容で公開URLを作成");
    await expect(page.getByRole("button", { name: "URLをコピー", exact: true })).toBeFocused();
    await tap("URLをコピー");
    expect(interactions).toBe(4);
    expect(writes).toEqual(["PUT /api/season-impressions/anilist-779", "POST /api/shares"]);
    const publicPath = await page.getByRole("link", { name: "作成した共有を開く" }).getAttribute("href");
    expect(await page.evaluate(() => (window as unknown as { copiedUrl: string }).copiedUrl)).toBe(`${baseURL}${publicPath}`);
    expect(page.url()).toBe(`${baseURL}/tier/impressions?year=2026&season=FALL&share=result`);
    const shareId = publicPath!.split("/").at(-1)!;
    const snapshot = await (await context.request.get(`/api/shares/${shareId}`)).json();
    expect(JSON.stringify(snapshot)).not.toMatch(/公開しない保存済み感想|未保存の秘密|revision|spoiler/);
    const modified = await context.request.put("/api/season-impressions/anilist-779", { headers, data: { ...input, anime: artwork, revision: 1, note: "変更後の秘密" } });
    expect(modified.status()).toBe(200);
    const deleted = await context.request.delete("/api/season-impressions/anilist-779", { headers, data: { year: 2026, season: "FALL", revision: 2 } });
    expect(deleted.status()).toBe(200);
    expect(await (await context.request.get(`/api/shares/${shareId}`)).json()).toEqual(snapshot);
    const publicResponse = page.waitForResponse((response) => new URL(response.url()).pathname === publicPath && response.request().method() === "GET");
    await page.getByRole("link", { name: "作成した共有を開く" }).click();
    await publicResponse;
    await expect(page.getByRole("heading", { name: "2026年秋 今期チェック", exact: true })).toBeVisible();
    expect(await page.locator(".impressions-list").innerText()).toBe(previewContents);
    await expect(page.locator("textarea")).toHaveCount(0);
    if (mode === "simple") { await expect(page.locator("img, picture")).toHaveCount(0); expect(imageRequests).toBe(0); }
    else expect(imageRequests).toBeGreaterThan(0);
    await page.goto("/tier/impressions?year=2026&season=FALL&share=manage");
    await expect(page.getByRole("heading", { name: "共有の管理・履歴", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "公開を停止", exact: true }).click();
    expect(writes.filter((entry) => entry.startsWith("DELETE"))).toEqual([]);
    await page.getByRole("button", { name: "公開停止を確定する" }).click();
    await expect(page.getByText("公開中の共有はありません。", { exact: true })).toBeVisible();
    expect((await context.request.get(`/api/shares/${shareId}`)).status()).toBe(404);
    const revoked = await context.request.get(publicPath!);
    // Next may stream a not-found boundary with HTTP 200; the route must render safe 404 content.
    expect(await revoked.text()).not.toContain("公開しない保存済み感想");
    await page.goto(publicPath!);
    await expect(page.getByRole("heading", { name: "ページが見つかりませんでした" })).toBeVisible();
    await expect(page.getByText(artwork.title, { exact: true })).toHaveCount(0);
  });
}
