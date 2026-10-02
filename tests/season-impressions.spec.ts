import { test, expect, type Route } from "@playwright/test";
import { getCurrentAnimeSeason, seasonHeadingJa } from "../lib/season";

// App Router, hydration, session endpoint and write routes are real. Only the external
// anime catalog is a fixture. Authenticated flows require Hermes' preview/live auth.
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
  await dialog.getByLabel("一言（任意・140文字以内）").fill(input.note);
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
  await expect(page.getByRole("dialog").getByLabel("一言（任意・140文字以内）")).toHaveValue("");
  expect(await page.content()).not.toContain(input.note);
});

test("canonical query, explicit current labels, rollover and history agree with catalog requests", async ({ page }) => {
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
