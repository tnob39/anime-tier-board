import { test, expect } from "@playwright/test";

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
  await page.getByLabel("年", { exact: true }).fill("2025");
  await page.getByLabel("クール", { exact: true }).selectOption("SUMMER");
  await page.getByRole("button", { name: "クールを表示" }).click();
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
