import { test, expect, type Page, type Route } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";
import type { AnimeSeason } from "../lib/types";

/**
 * ATB-582-P0-A-SHARE-INTENT (#702)
 * Guest share → metadata-only sessionStorage intent before Google sign-in.
 * No auth-return, remote board, conflict UI, or auto-share.
 */

test.describe.configure({ timeout: 60_000 });

const PENDING_SHARE_INTENT_KEY = "anime-tier-board:pending-share-intent:v1";
const BOARD_STORAGE_PREFIX = "anime-tier-board:v1";

const current = getCurrentAnimeSeason();
const SEASON_YEAR = current.year;
const SEASON = current.season as AnimeSeason;

const FIXTURE_ITEMS = [
  {
    id: "anilist-share-intent-001",
    source: "anilist",
    title: "共有intent試験アニメ",
    titles: {
      native: "共有intent試験アニメ",
      userPreferred: "共有intent試験アニメ",
      romaji: "Share Intent Fixture"
    },
    imageUrl: "https://e2e-sentinel.invalid/atb-702/a.jpg",
    proxiedImageUrl:
      "/api/image-proxy?url=" +
      encodeURIComponent("https://e2e-sentinel.invalid/atb-702/a.jpg"),
    siteUrl: "https://anilist.co/anime/share-intent-001"
  }
] as const;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const MOCK_GOOGLE_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?mock=atb-702";

function isImageProxyOrSentinel(url: string): boolean {
  // Host / path only — do not match query markers like mock=atb-702 on OAuth URLs.
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("e2e-sentinel.invalid")) {
      return true;
    }
    if (parsed.pathname.includes("/api/image-proxy")) {
      return true;
    }
    if (parsed.pathname.includes("atb-702") || parsed.hostname.includes("atb-702")) {
      return true;
    }
    return false;
  } catch {
    return url.includes("e2e-sentinel.invalid") || url.includes("/api/image-proxy");
  }
}

/** True only for fixture image-proxy / sentinel resource console noise. */
function isImageProxyFixtureResourceNoise(text: string, locationUrl: string): boolean {
  const combined = `${text} ${locationUrl}`;
  const mentionsFixtureAsset =
    /\/api\/image-proxy/i.test(combined) ||
    /e2e-sentinel\.invalid/i.test(combined);
  if (!mentionsFixtureAsset) {
    return false;
  }
  return /Failed to load resource|net::ERR_|NS_ERROR_|\b404\b|\b50[0-9]\b/i.test(text);
}

function isAuthJsPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/auth")) {
    return false;
  }
  // Leave native auth API alone.
  if (pathname.startsWith("/api/auth/native")) {
    return false;
  }
  return true;
}

async function installDeterministicFixtures(page: Page) {
  await page.route("**/*", async (route: Route) => {
    const req = route.request();
    let pathname = "";
    let hostname = "";
    let url = req.url();
    try {
      const parsed = new URL(url);
      pathname = parsed.pathname;
      hostname = parsed.hostname;
      url = parsed.href;
    } catch {
      await route.continue();
      return;
    }

    if (pathname.includes("/api/anime/seasonal")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: FIXTURE_ITEMS, warning: null })
      });
      return;
    }

    // Block live image-proxy / sentinel hosts (deterministic; no upstream fetch).
    if (isImageProxyOrSentinel(url) || pathname.includes("/api/image-proxy")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG
      });
      return;
    }

    // Auth.js client (next-auth/react) requires JSON for session/csrf/providers/signin.
    // HTML here → ClientFetchError → getProviders() null → navigate /api/auth/error,
    // and signInRequests stays 0 (no /signin or accounts.google.com hop).
    if (isAuthJsPath(pathname)) {
      const method = req.method().toUpperCase();
      const headers = req.headers();
      const accept = headers["accept"] ?? "";
      const wantsJson =
        method === "POST" ||
        accept.includes("application/json") ||
        headers["x-auth-return-redirect"] === "1" ||
        headers["content-type"]?.includes("application/json") === true ||
        headers["content-type"]?.includes("application/x-www-form-urlencoded") === true;

      if (pathname.includes("/session")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "null"
        });
        return;
      }

      if (pathname.includes("/csrf")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ csrfToken: "atb-702-mock-csrf" })
        });
        return;
      }

      if (pathname.includes("/providers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            google: {
              id: "google",
              name: "Google",
              type: "oauth",
              signinUrl: "http://localhost:3000/api/auth/signin/google",
              callbackUrl: "http://localhost:3000/api/auth/callback/google"
            }
          })
        });
        return;
      }

      if (
        pathname.includes("/signin") ||
        pathname.includes("/callback") ||
        pathname.includes("/signout") ||
        pathname.includes("/error")
      ) {
        if (wantsJson || method !== "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ url: MOCK_GOOGLE_AUTH_URL })
          });
        } else {
          // Document navigation fallback still proves the Google OAuth hop.
          await route.fulfill({
            status: 302,
            headers: { Location: MOCK_GOOGLE_AUTH_URL },
            body: ""
          });
        }
        return;
      }

      // Unknown Auth.js subpath: never return HTML to the client fetch layer.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}"
      });
      return;
    }

    if (hostname === "accounts.google.com" || url.includes("accounts.google.com")) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>mocked-google-oauth</body></html>"
      });
      return;
    }

    // Share must not run in this slice's guest flow.
    if (pathname === "/api/shares") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" })
      });
      return;
    }

    await route.continue();
  });
}

async function clearSeasonalSessionCache(page: Page) {
  await page.addInitScript(() => {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const k = sessionStorage.key(i);
        if (k && k.toLowerCase().includes("seasonal")) {
          sessionStorage.removeItem(k);
        }
      }
      sessionStorage.removeItem("anime-tier-board:pending-share-intent:v1");
    } catch {
      // ignore
    }
  });
}

async function attachErrorWatch(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(String(err));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      const locationUrl = msg.location()?.url ?? "";
      // Suppress only explicit image-proxy / sentinel fixture resource noise.
      if (isImageProxyFixtureResourceNoise(text, locationUrl)) {
        return;
      }
      consoleErrors.push(text);
    }
  });
  return {
    assertClean() {
      expect(pageErrors, `pageerror: ${pageErrors.join(" | ")}`).toEqual([]);
      expect(consoleErrors, `console.error: ${consoleErrors.join(" | ")}`).toEqual([]);
    }
  };
}

async function gotoTier(page: Page) {
  await page.goto(`/tier?atb702=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("button", { name: "共有" })).toBeEnabled({
    timeout: 20_000
  });
}

function shareLoginDialog(page: Page) {
  return page.getByRole("dialog").filter({
    hasText: "Tier表を共有するにはログインしてください"
  });
}

function statusLoginDialog(page: Page) {
  return page.getByRole("dialog").filter({
    hasText: "視聴ステータスを保存するにはログインしてください"
  });
}

async function readIntentRaw(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => sessionStorage.getItem(key),
    PENDING_SHARE_INTENT_KEY
  );
}

/** Snapshot board-related localStorage entries (prefix anime-tier-board:v1). */
async function snapshotBoardLocalStorage(
  page: Page
): Promise<Record<string, string | null>> {
  return page.evaluate((prefix) => {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && (k === prefix || k.startsWith(`${prefix}:`))) {
        out[k] = localStorage.getItem(k);
      }
    }
    return out;
  }, BOARD_STORAGE_PREFIX);
}

function armSignInRequest(page: Page) {
  return page.waitForRequest(
    (req) => {
      const u = req.url();
      return (
        u.includes("/api/auth/signin") ||
        u.includes("/api/auth/callback") ||
        u.includes("accounts.google.com")
      );
    },
    { timeout: 15_000 }
  );
}

/**
 * Unauthenticated — do not use global authenticated storageState.
 * Block SW so Auth.js session/csrf/providers/signin JSON mocks are not
 * bypassed by public/sw.js (otherwise ClientFetchError → zero sign-in hops).
 */
test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block"
});

test.describe("ATB-702 guest share pending intent", () => {
  test("cancel keeps board/URL/intent; Google login writes metadata-only intent once", async ({
    page
  }) => {
    const errors = await attachErrorWatch(page);
    await clearSeasonalSessionCache(page);
    await installDeterministicFixtures(page);

    await gotoTier(page);

    const beforeUrl = page.url();
    expect(await readIntentRaw(page)).toBeNull();

    // Open login prompt via existing share flow (guest).
    await page.getByRole("button", { name: "共有" }).click();
    const dialog = shareLoginDialog(page);
    await expect(dialog.getByText("ログインが必要です")).toBeVisible();
    await expect(
      dialog.getByText("Tier表を共有するにはログインしてください。作成したTier表はそのまま残ります。")
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();

    // Cancel must not mutate board localStorage, intent (still null), or URL.
    const boardBeforeCancel = await snapshotBoardLocalStorage(page);
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(shareLoginDialog(page)).toHaveCount(0);
    expect(page.url()).toBe(beforeUrl);
    expect(await readIntentRaw(page)).toBeNull();
    expect(await snapshotBoardLocalStorage(page)).toEqual(boardBeforeCancel);
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();
    await expect(page.getByRole("button", { name: "共有" })).toBeEnabled();

    // Resume share → Google login writes metadata-only intent, then existing sign-in.
    await page.getByRole("button", { name: "共有" }).click();
    await expect(shareLoginDialog(page)).toBeVisible();

    const signInRequests: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (
        u.includes("/api/auth/signin") ||
        u.includes("/api/auth/callback") ||
        u.includes("accounts.google.com")
      ) {
        signInRequests.push(u);
      }
    });

    // Arm observers before the gesture: intent is written sync, then Auth.js
    // redirects to Google (destroys the page context). Capture both without races.
    const intentWritten = page.waitForFunction(
      (key) => {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      PENDING_SHARE_INTENT_KEY,
      { timeout: 10_000 }
    );
    const signInStarted = armSignInRequest(page);

    await shareLoginDialog(page).getByRole("button", { name: "Googleでログイン" }).click();

    const intentRaw = (await (await intentWritten).jsonValue()) as string | null;
    expect(intentRaw).toBeTruthy();
    const intent = JSON.parse(intentRaw!) as Record<string, unknown>;

    expect(intent.version).toBe(1);
    expect(intent.action).toBe("share");
    expect(intent.year).toBe(SEASON_YEAR);
    expect(intent.season).toBe(SEASON);
    expect(typeof intent.createdAt).toBe("string");
    expect(Number.isFinite(Date.parse(String(intent.createdAt)))).toBe(true);

    // Metadata only — no board / anime payload / shareId / token.
    expect(intent).not.toHaveProperty("board");
    expect(intent).not.toHaveProperty("tiers");
    expect(intent).not.toHaveProperty("items");
    expect(intent).not.toHaveProperty("anime");
    expect(intent).not.toHaveProperty("shareId");
    expect(intent).not.toHaveProperty("token");
    expect(intent).not.toHaveProperty("user");
    expect(intent).not.toHaveProperty("url");
    expect(Object.keys(intent).sort()).toEqual(
      ["action", "createdAt", "season", "version", "year"].sort()
    );

    // Existing Google sign-in is started (at least one auth action).
    await signInStarted;
    await expect
      .poll(() => signInRequests.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    // Single user gesture → not a duplicate fan-out of sign-in posts.
    expect(signInRequests.length).toBeLessThanOrEqual(3);

    errors.assertClean();
  });

  test("status Google login does not write share intent", async ({ page }) => {
    const errors = await attachErrorWatch(page);
    await clearSeasonalSessionCache(page);
    await installDeterministicFixtures(page);

    await gotoTier(page);
    expect(await readIntentRaw(page)).toBeNull();

    // Guest status action opens status login prompt (not share).
    // Pool drawer starts closed; open it so non-compact cards expose ＋見たい.
    const poolTrigger = page.getByRole("button", { name: /未分類\s+\d+件/ });
    await expect(poolTrigger).toBeVisible({ timeout: 20_000 });
    if ((await poolTrigger.getAttribute("aria-expanded")) !== "true") {
      await poolTrigger.click();
    }
    await expect(poolTrigger).toHaveAttribute("aria-expanded", "true");

    const plannedButton = page.getByRole("button", { name: "＋見たい" }).first();
    await expect(plannedButton).toBeVisible({ timeout: 20_000 });
    await plannedButton.click();

    const dialog = statusLoginDialog(page);
    await expect(dialog.getByText("ログインが必要です")).toBeVisible();
    await expect(
      dialog.getByText(
        "視聴ステータスを保存するにはログインしてください。Tier表の編集はログインなしで続けられます。"
      )
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    expect(await readIntentRaw(page)).toBeNull();

    // Intent write (if any) is sync before Auth.js network. Arm presence probe first.
    const intentSeenPromise = page
      .waitForFunction(
        (key) => {
          try {
            return sessionStorage.getItem(key) != null;
          } catch {
            return false;
          }
        },
        PENDING_SHARE_INTENT_KEY,
        { timeout: 5_000 }
      )
      .then(
        () => true,
        () => false
      );

    const signInStarted = armSignInRequest(page);

    await dialog.getByRole("button", { name: "Googleでログイン" }).click();
    await signInStarted;

    // Sync write would already have completed before the sign-in request.
    let sawIntent = false;
    try {
      sawIntent =
        (await page.evaluate(
          (key) => sessionStorage.getItem(key) != null,
          PENDING_SHARE_INTENT_KEY
        )) === true;
    } catch {
      // Navigated away — fall back to the pre-armed probe (true only if write happened).
      sawIntent = await intentSeenPromise;
    }
    expect(sawIntent, "status Google login must not write pending share intent").toBe(
      false
    );

    errors.assertClean();
  });
});
