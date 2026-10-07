import { expect, test, type Page } from "@playwright/test";
import { encode } from "@auth/core/jwt";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });

const DISPLAY_MODE_KEY = "numanie-display-mode";
const IMAGE_PREFIX = "https://fixture.invalid/explore-795/";
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

function item(index: number) {
  const title = index === 0
    ? "これは非常に長い日本語の作品タイトルで折り返してもカードからはみ出さないことを確認するための作品"
    : `Issue 795 card ${index}`;
  return {
    id: `issue-795-${index}`,
    source: "anilist",
    title,
    titles: { native: title, romaji: title },
    imageUrl: `${IMAGE_PREFIX}${index}.gif`,
    proxiedImageUrl: `${IMAGE_PREFIX}${index}.gif`,
    siteUrl: `https://example.invalid/anime/${index}`,
    popularity: 1000 - index,
    score: 80,
    genres: ["非常に長いジャンル名"]
  };
}

async function authenticate(page: Page) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for /explore browser proof");
  const token = await encode({
    token: { sub: "issue-795-owner", name: "Issue 795", email: "tnob38@gmail.com" },
    secret,
    salt: "authjs.session-token",
    maxAge: 3600
  });
  await page.context().addCookies([{
    name: "authjs.session-token",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax"
  }]);
}

async function fixture(page: Page, mode: "visual" | "simple", broken = false) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [DISPLAY_MODE_KEY, mode]);
  await page.route("**/api/anime/seasonal**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      year: 2025,
      season: "ALL",
      items: Array.from({ length: 12 }, (_, index) => item(index)),
      source: "fixture",
      freshness: "fresh",
      fetchedAt: "2026-01-15T03:00:00.000Z"
    })
  }));
  await page.route(`${IMAGE_PREFIX}**`, (route) => broken
    ? route.fulfill({ status: 404, body: "missing" })
    : route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }));
}

for (const width of [375, 390, 1280]) {
  test(`real explore cards fit ${width}px and expose image loading policy`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 700 : 800 });
    await authenticate(page);
    await fixture(page, "visual");
    await page.goto("/explore?year=2025", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".explore-card")).toHaveCount(12, { timeout: 15_000 });

    const images = page.locator(".explore-card-image img");
    await expect(images).toHaveCount(12);
    const policies = await images.evaluateAll((nodes) => nodes.map((image) => ({
      width: image.getAttribute("width"), height: image.getAttribute("height"),
      decoding: image.getAttribute("decoding"), loading: image.getAttribute("loading"),
      fetchPriority: image.getAttribute("fetchpriority")
    })));
    expect(policies).toEqual(Array.from({ length: 12 }, (_, index) => ({
      width: "96", height: "136", decoding: "async",
      loading: index < 4 ? "eager" : "lazy", fetchPriority: index < 4 ? "high" : "auto"
    })));

    if (width < 500) await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    const geometry = await page.evaluate(() => ({
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: Array.from(document.querySelectorAll<HTMLElement>(".explore-controls button, .explore-controls input"))
        .map((element) => ({ height: element.getBoundingClientRect().height, right: element.getBoundingClientRect().right }))
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
    for (const control of geometry.controls) {
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.right).toBeLessThanOrEqual(geometry.innerWidth + 1);
    }
  });
}

test("broken images become visible placeholders without changing geometry", async ({ page }) => {
  await authenticate(page);
  await fixture(page, "visual", true);
  await page.goto("/explore?year=2025");
  await expect(page.locator('.explore-card-image[data-image-state="error"]')).toHaveCount(12, { timeout: 15_000 });
  await expect(page.locator(".explore-card-image").first()).toHaveCSS("aspect-ratio", "12 / 17");
});

test("image requests use one bounded responsive variant and keep offscreen cards lazy", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(IMAGE_PREFIX)) requests.push(request.url());
  });
  await page.setViewportSize({ width: 375, height: 700 });
  await authenticate(page);
  await fixture(page, "visual");
  await page.goto("/explore?year=2025", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.explore-card-image[data-image-state="loaded"]').first()).toBeVisible({ timeout: 15_000 });
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => /[?&]w=(96|192)(?:&|$)/.test(url))).toBe(true);
  expect(new Set(requests).size).toBe(requests.length);
  expect(requests.some((url) => url.includes("/11.gif"))).toBe(false);
  await page.locator(".explore-card").last().scrollIntoViewIfNeeded();
  await expect(page.locator('.explore-card-image[data-image-state="loaded"]').last()).toBeVisible({ timeout: 15_000 });
});

test("simple mode creates no explore image DOM or requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(IMAGE_PREFIX)) requests.push(request.url());
  });
  await authenticate(page);
  await fixture(page, "simple");
  await page.goto("/explore?year=2025");
  await expect(page.locator(".explore-card")).toHaveCount(12, { timeout: 15_000 });
  await expect(page.locator(".explore-card-image, .explore-card img")).toHaveCount(0);
  expect(requests).toEqual([]);
});
