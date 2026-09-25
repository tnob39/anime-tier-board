import { test, expect, type Page, type Route, type Request } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";
import type { AnimeSeason } from "../lib/types";

/**
 * ATB-692 guest→auth share handoff — original auto-resume + conflict contract.
 * Fixture-only: no live Google OAuth, Turso writes, or real share create.
 */

test.describe.configure({ timeout: 90_000 });

const PENDING_SHARE_INTENT_KEY = "anime-tier-board:pending-share-intent:v1";
const SHARE_HANDOFF_RECOVERY_KEY = "anime-tier-board:share-handoff-recovery:v2";
const SHARE_HANDOFF_OWNER_TAB_ID_KEY = "anime-tier-board:share-handoff-owner-tab-id:v1";
const BOARD_STORAGE_PREFIX = "anime-tier-board:v1";
const current = getCurrentAnimeSeason();
const SEASON_YEAR = current.year;
const SEASON = current.season as AnimeSeason;
const STORAGE_KEY = `${BOARD_STORAGE_PREFIX}:${SEASON_YEAR}:${SEASON}`;
const OTHER_SEASON: AnimeSeason = SEASON === "WINTER" ? "SPRING" : "WINTER";

const SSR_FIXTURE_ITEM_ID = "anilist-e2e-home-add-621";
const REMOTE_ONLY_ITEM_ID = "anilist-auth-handoff-remote-001";
const REMOTE_UPDATED_AT = "2026-07-28T12:00:00.000Z";
const LOCAL_UPDATED_AT = "2026-07-28T00:00:00.000Z";

const AUTH_RETURN_STATUS_EVALUATING = "Tier表を引き継いでいます…";
const AUTH_RETURN_STATUS_EXPIRED =
  "共有の再開期限が切れました。もう一度「共有」を押してください。";
const HANDOFF_LOAD_ERROR_MESSAGE =
  "Tier表を引き継げませんでした。通信環境を確認して再度お試しください。";
const SHARE_CREATE_ERROR_MESSAGE = "シェアの作成に失敗しました。";
const SHARE_LOGIN_PROMPT_MESSAGE =
  "Tier表を共有するにはログインしてください。作成したTier表はそのまま引き継がれます。";
const HANDOFF_SHARING_STATUS_MESSAGE = "共有処理中…";
const HANDOFF_RECOVERY_UNKNOWN_MESSAGE =
  "共有の結果を確認できません。自動では再送しません。この端末のTier表は保持されています。";
const HANDOFF_REMOTE_CONTEXT_ERROR_MESSAGE =
  "引き継ぎ先のシーズンが一致しません。この端末のTier表は保持されています。";
const HANDOFF_RECOVERY_EXPIRED_MESSAGE =
  "共有の再開期限が切れました。この端末のTier表は保持されています。";
const HANDOFF_RECOVERY_UNREADABLE_MESSAGE =
  "引き継ぎ状態を確認できません。この端末のTier表は保護されています。";
const PENDING_SHARE_INTENT_STORAGE_ERROR_MESSAGE =
  "共有の準備を保存できませんでした。空き容量やブラウザ設定を確認して、もう一度お試しください。";
const HANDOFF_RECOVERY_OTHER_TAB_MESSAGE =
  "別のタブで共有処理中です。このタブでは自動では再送しません。";
const MOCK_GOOGLE_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?mock=atb-692";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

type RequestLog = {
  method: string;
  path: string;
  body: unknown;
};

type RequestCounters = {
  boardGet: number;
  boardPut: number;
  sharePost: number;
  statusesGet: number;
  externalAttempts: number;
  order: RequestLog[];
};

type BoardJson = {
  version: number;
  season: string;
  seasonYear: number;
  tiers: Array<{
    id: string;
    label: string;
    color: string;
    itemIds: string[];
    locked?: boolean;
  }>;
  updatedAt: string;
};

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isImageProxyOrSentinel(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("e2e-sentinel.invalid") ||
      parsed.pathname.includes("/api/image-proxy")
    );
  } catch {
    return url.includes("e2e-sentinel.invalid") || url.includes("/api/image-proxy");
  }
}

function emptyTiers(sItemIds: string[], unrankedIds: string[] = []): BoardJson["tiers"] {
  return [
    { id: "tier-s", label: "S", color: "#f87171", itemIds: sItemIds },
    { id: "tier-a", label: "A", color: "#fbbf24", itemIds: [] },
    { id: "tier-b", label: "B", color: "#34d399", itemIds: [] },
    { id: "tier-c", label: "C", color: "#60a5fa", itemIds: [] },
    { id: "tier-d", label: "D", color: "#a78bfa", itemIds: [] },
    {
      id: "tier-unranked",
      label: "未分類",
      color: "#9ca3af",
      itemIds: unrankedIds,
      locked: true
    }
  ];
}

function localBoard(): BoardJson {
  return {
    version: 1,
    season: SEASON,
    seasonYear: SEASON_YEAR,
    tiers: emptyTiers([SSR_FIXTURE_ITEM_ID], []),
    updatedAt: LOCAL_UPDATED_AT
  };
}

function remoteDivergentBoard(): BoardJson {
  return {
    version: 1,
    season: SEASON,
    seasonYear: SEASON_YEAR,
    tiers: emptyTiers([REMOTE_ONLY_ITEM_ID], [SSR_FIXTURE_ITEM_ID]),
    updatedAt: REMOTE_UPDATED_AT
  };
}

function remoteSameBoard(): BoardJson {
  return {
    ...localBoard(),
    updatedAt: REMOTE_UPDATED_AT
  };
}

function validIntent(createdAt = new Date().toISOString()) {
  return {
    version: 1,
    action: "share" as const,
    year: SEASON_YEAR,
    season: SEASON,
    createdAt
  };
}

function createCounters(): RequestCounters {
  return {
    boardGet: 0,
    boardPut: 0,
    sharePost: 0,
    statusesGet: 0,
    externalAttempts: 0,
    order: []
  };
}

function resetCounters(counters: RequestCounters) {
  counters.boardGet = 0;
  counters.boardPut = 0;
  counters.sharePost = 0;
  counters.statusesGet = 0;
  counters.externalAttempts = 0;
  counters.order = [];
}

async function attachErrorWatch(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const locationUrl = msg.location()?.url ?? "";
    const combined = `${text} ${locationUrl}`;
    if (/\/api\/image-proxy|e2e-sentinel\.invalid/i.test(combined)) return;
    if (
      /\/api\/shares/i.test(combined) &&
      /500|Failed to load resource|Failed to fetch|ERR_CONNECTION_RESET|net::ERR_/i.test(text)
    ) {
      return;
    }
    if (/\/api\/boards/i.test(combined) && /500|Failed to load resource/i.test(text)) return;
    if (/ClientFetchError|errors\.authjs\.dev|\[authjs\]/i.test(text)) return;
    if (/\/api\/shares/i.test(combined) && /JSON|Unexpected token|not-json/i.test(text)) {
      return;
    }
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, `pageerror: ${pageErrors.join(" | ")}`).toEqual([]);
      expect(consoleErrors, `console.error: ${consoleErrors.join(" | ")}`).toEqual([]);
    }
  };
}

async function readIntentRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), PENDING_SHARE_INTENT_KEY);
}

async function readBoardRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
}

async function waitForTierHeading(page: Page) {
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 20_000
  });
}

function hashShareHandoffBoardRaw(raw: string): string {
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function recoveryMarkerFixture(
  board: BoardJson,
  overrides: Record<string, unknown> = {}
) {
  const guestRaw =
    typeof overrides.guestRaw === "string" ? overrides.guestRaw : JSON.stringify(board);
  const chosenBoardRaw =
    typeof overrides.chosenBoardRaw === "string" ? overrides.chosenBoardRaw : guestRaw;
  const createdAt =
    typeof overrides.createdAt === "string" ? overrides.createdAt : new Date().toISOString();
  return {
    version: 2,
    year: SEASON_YEAR,
    season: SEASON,
    storageKey: STORAGE_KEY,
    attemptId: "e2e-atb-692-attempt",
    createdAt,
    putStatus: "completed",
    postState: "post_started_unknown",
    ownerTabId: "e2e-stale-owner",
    leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
    guestRaw,
    chosenBoardRaw,
    chosenBoardHash:
      typeof overrides.chosenBoardHash === "string"
        ? overrides.chosenBoardHash
        : hashShareHandoffBoardRaw(chosenBoardRaw)
  };
}

async function seedIntentAndBoard(
  page: Page,
  intent: unknown,
  board: BoardJson | null,
  recovery: unknown = null
) {
  await page.evaluate(
    ({
      intentKey,
      recoveryKey,
      storageKey,
      intent: nextIntent,
      board: nextBoard,
      recovery: nextRecovery
    }) => {
      try {
        if (nextIntent == null) sessionStorage.removeItem(intentKey);
        else sessionStorage.setItem(intentKey, JSON.stringify(nextIntent));
      } catch {
        // ignore
      }
      try {
        if (nextRecovery == null) localStorage.removeItem(recoveryKey);
        else localStorage.setItem(recoveryKey, JSON.stringify(nextRecovery));
      } catch {
        // ignore
      }
      try {
        if (nextBoard == null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(nextBoard));
      } catch {
        // ignore
      }
    },
    {
      intentKey: PENDING_SHARE_INTENT_KEY,
      recoveryKey: SHARE_HANDOFF_RECOVERY_KEY,
      storageKey: STORAGE_KEY,
      intent,
      board,
      recovery
    }
  );
}

async function readRecoveryRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SHARE_HANDOFF_RECOVERY_KEY);
}

async function readOwnerTabId(page: Page): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), SHARE_HANDOFF_OWNER_TAB_ID_KEY);
}

async function installAuthReturnFixtures(
  page: Page,
  options: {
    counters: RequestCounters;
    remoteBoardRef: { current: BoardJson | null };
    shareStatus?: number;
    boardGetStatus?: number;
    boardPutStatus?: number;
    putConflictOnce?: { remaining: number };
    putFailuresRemaining?: { remaining: number };
    abortPut?: boolean;
    commitPutThenAbort?: boolean;
    shareFailuresRemaining?: { remaining: number };
    delayPutMs?: number;
    delayPostMs?: number;
    malformedRemote?: boolean;
    abortShare?: boolean;
    wrongRemoteContext?: boolean;
    shareBody?: unknown;
    shareMalformedJson?: boolean;
  }
) {
  const boardGetStatus = options.boardGetStatus ?? 200;
  const counters = options.counters;
  const remoteBoardRef = options.remoteBoardRef;

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
      counters.externalAttempts += 1;
      await route.abort();
      return;
    }

    const method = req.method().toUpperCase();

    if (isImageProxyOrSentinel(url) || pathname.includes("/api/image-proxy")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG
      });
      return;
    }

    if (pathname.startsWith("/api/auth")) {
      if (!isLocalHostname(hostname)) {
        counters.externalAttempts += 1;
        await route.abort();
        return;
      }
      await route.continue();
      return;
    }

    if (!isLocalHostname(hostname)) {
      counters.externalAttempts += 1;
      await route.abort();
      return;
    }

    if (pathname.includes("/api/anime/seasonal")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          year: SEASON_YEAR,
          season: SEASON,
          items: [],
          source: "anilist",
          cached: true
        })
      });
      return;
    }

    if (pathname === "/api/boards") {
      if (method === "GET") {
        counters.boardGet += 1;
        counters.order.push({ method: "GET", path: "/api/boards", body: null });
        if (boardGetStatus >= 400) {
          await route.fulfill({
            status: boardGetStatus,
            contentType: "application/json",
            body: JSON.stringify({ error: "load failed" })
          });
          return;
        }
        if (options.malformedRemote) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              board: { version: 1, season: SEASON, seasonYear: SEASON_YEAR, tiers: "nope" }
            })
          });
          return;
        }
        if (options.wrongRemoteContext) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              board: {
                ...localBoard(),
                season: OTHER_SEASON,
                seasonYear: SEASON_YEAR
              }
            })
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ board: remoteBoardRef.current })
        });
        return;
      }
      if (method === "PUT") {
        counters.boardPut += 1;
        let body: unknown = null;
        try {
          body = req.postDataJSON();
        } catch {
          body = req.postData();
        }
        counters.order.push({ method: "PUT", path: "/api/boards", body });
        if (options.delayPutMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayPutMs));
        }
        if (options.abortPut) {
          if (options.commitPutThenAbort && body && typeof body === "object") {
            const candidate = body as { board?: BoardJson };
            if (candidate.board) {
              remoteBoardRef.current = candidate.board;
            }
          }
          await route.abort("connectionreset");
          return;
        }
        let putStatus = options.boardPutStatus ?? 200;
        if (options.putConflictOnce && options.putConflictOnce.remaining > 0) {
          options.putConflictOnce.remaining -= 1;
          putStatus = 409;
        }
        if (options.putFailuresRemaining && options.putFailuresRemaining.remaining > 0) {
          options.putFailuresRemaining.remaining -= 1;
          putStatus = 500;
        }
        if (putStatus === 409) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: "conflict" })
          });
          return;
        }
        if (putStatus >= 400) {
          await route.fulfill({
            status: putStatus,
            contentType: "application/json",
            body: JSON.stringify({ error: "save failed" })
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }
    }

    if (pathname === "/api/shares" && method === "POST") {
      counters.sharePost += 1;
      let body: unknown = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      counters.order.push({ method: "POST", path: "/api/shares", body });
      if (options.abortShare) {
        await route.abort("connectionreset");
        return;
      }
      if (options.delayPostMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayPostMs));
      }
      let nextShareStatus = options.shareStatus ?? 200;
      if (options.shareFailuresRemaining && options.shareFailuresRemaining.remaining > 0) {
        options.shareFailuresRemaining.remaining -= 1;
        nextShareStatus = 500;
      }
      if (options.shareMalformedJson) {
        await route.fulfill({
          status: nextShareStatus,
          contentType: "application/json",
          body: "{not-json"
        });
        return;
      }
      const bodyPayload =
        options.shareBody !== undefined
          ? options.shareBody
          : nextShareStatus >= 400
            ? { error: "boom" }
            : { shareId: "e2e-atb-692-share" };
      await route.fulfill({
        status: nextShareStatus,
        contentType: "application/json",
        body: typeof bodyPayload === "string" ? bodyPayload : JSON.stringify(bodyPayload)
      });
      return;
    }

    if (pathname === "/api/statuses" && method === "GET") {
      counters.statusesGet += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statuses: [] })
      });
      return;
    }

    await route.continue();
  });
}

async function bootstrapHandoff(
  page: Page,
  counters: RequestCounters,
  remoteBoardRef: { current: BoardJson | null },
  options?: {
    shareStatus?: number;
    boardGetStatus?: number;
    boardPutStatus?: number;
    putConflictOnce?: { remaining: number };
    putFailuresRemaining?: { remaining: number };
    abortPut?: boolean;
    commitPutThenAbort?: boolean;
    shareFailuresRemaining?: { remaining: number };
    delayPutMs?: number;
    delayPostMs?: number;
    malformedRemote?: boolean;
    abortShare?: boolean;
    wrongRemoteContext?: boolean;
    shareBody?: unknown;
    shareMalformedJson?: boolean;
    intent?: unknown;
    local?: BoardJson | null;
    remoteAfterLoad?: BoardJson | null;
    recovery?: unknown;
  }
) {
  await installAuthReturnFixtures(page, {
    counters,
    remoteBoardRef,
    shareStatus: options?.shareStatus,
    boardGetStatus: options?.boardGetStatus,
    boardPutStatus: options?.boardPutStatus,
    putConflictOnce: options?.putConflictOnce,
    putFailuresRemaining: options?.putFailuresRemaining,
    abortPut: options?.abortPut,
    commitPutThenAbort: options?.commitPutThenAbort,
    shareFailuresRemaining: options?.shareFailuresRemaining,
    delayPutMs: options?.delayPutMs,
    delayPostMs: options?.delayPostMs,
    malformedRemote: options?.malformedRemote,
    abortShare: options?.abortShare,
    wrongRemoteContext: options?.wrongRemoteContext,
    shareBody: options?.shareBody,
    shareMalformedJson: options?.shareMalformedJson
  });
  await page.goto(`/tier?atb692=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await waitForTierHeading(page);
  await page.waitForTimeout(900);
  await seedIntentAndBoard(
    page,
    options && "intent" in options ? options.intent ?? null : validIntent(),
    options?.local === undefined ? localBoard() : options.local,
    options?.recovery ?? null
  );
  if (options && "remoteAfterLoad" in options) {
    remoteBoardRef.current = options.remoteAfterLoad ?? null;
  }
  resetCounters(counters);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTierHeading(page);
}

function isAuthJsPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth") && !pathname.startsWith("/api/auth/native");
}

async function installGuestAuthFixtures(page: Page) {
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

    if (isImageProxyOrSentinel(url) || pathname.includes("/api/image-proxy")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG
      });
      return;
    }

    if (isAuthJsPath(pathname)) {
      const method = req.method().toUpperCase();
      const headers = req.headers();
      const accept = headers["accept"] ?? "";
      const wantsJson =
        method === "POST" ||
        accept.includes("application/json") ||
        headers["x-auth-return-redirect"] === "1";
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
          body: JSON.stringify({ csrfToken: "atb-692-mock-csrf" })
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
      if (pathname.includes("/signin") || pathname.includes("/callback")) {
        if (wantsJson || method !== "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ url: MOCK_GOOGLE_AUTH_URL })
          });
        } else {
          await route.fulfill({
            status: 302,
            headers: { Location: MOCK_GOOGLE_AUTH_URL },
            body: ""
          });
        }
        return;
      }
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

test.describe("ATB-692 guest share prompt", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block"
  });

  test("cancel keeps board/URL/intent; Google login writes metadata-only intent", async ({
    page
  }) => {
    const errors = await attachErrorWatch(page);
    await page.addInitScript(() => {
      try {
        sessionStorage.removeItem("anime-tier-board:pending-share-intent:v1");
      } catch {
        // ignore
      }
    });
    await installGuestAuthFixtures(page);
    await page.goto(`/tier?atb692-guest=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await expect(page.getByRole("button", { name: "共有" })).toBeEnabled({ timeout: 20_000 });

    const beforeUrl = page.url();
    expect(await readIntentRaw(page)).toBeNull();
    await page.getByRole("button", { name: "共有" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: SHARE_LOGIN_PROMPT_MESSAGE });
    await expect(dialog.getByText("ログインが必要です")).toBeVisible();
    await expect(dialog.getByText(SHARE_LOGIN_PROMPT_MESSAGE)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();

    const boardBefore = await readBoardRaw(page);
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toBe(beforeUrl);
    expect(await readIntentRaw(page)).toBeNull();
    expect(await readBoardRaw(page)).toBe(boardBefore);

    await page.getByRole("button", { name: "共有" }).click();
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
    const signInStarted = page.waitForRequest(
      (req) =>
        req.url().includes("/api/auth/signin") ||
        req.url().includes("accounts.google.com"),
      { timeout: 15_000 }
    );
    await page
      .getByRole("dialog")
      .filter({ hasText: SHARE_LOGIN_PROMPT_MESSAGE })
      .getByRole("button", { name: "Googleでログイン" })
      .click();
    const intentRaw = (await (await intentWritten).jsonValue()) as string | null;
    expect(intentRaw).toBeTruthy();
    const intent = JSON.parse(intentRaw!) as Record<string, unknown>;
    expect(intent.action).toBe("share");
    expect(intent.year).toBe(SEASON_YEAR);
    expect(intent.season).toBe(SEASON);
    expect(intent).not.toHaveProperty("board");
    expect(intent).not.toHaveProperty("token");
    expect(intent).not.toHaveProperty("url");
    expect(Object.keys(intent).sort()).toEqual(
      ["action", "createdAt", "season", "version", "year"].sort()
    );
    await signInStarted;
    errors.assertClean();
  });

  test("sessionStorage set failure shows recoverable error and does not start login", async ({
    page
  }) => {
    let signInRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/signin")) signInRequests += 1;
    });
    await page.addInitScript((intentKey) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key, value) {
        if (key === intentKey) throw new Error("intent quota");
        return original.call(this, key, value);
      };
    }, PENDING_SHARE_INTENT_KEY);
    await installGuestAuthFixtures(page);
    await page.goto(`/tier?atb692-intent-set-failure=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierHeading(page);
    await page.getByRole("button", { name: "共有" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Googleでログイン" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: PENDING_SHARE_INTENT_STORAGE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 10_000 });
    expect(signInRequests).toBe(0);
  });

  test("sessionStorage readback failure shows recoverable error and does not start login", async ({
    page
  }) => {
    let signInRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/signin")) signInRequests += 1;
    });
    await page.addInitScript((intentKey) => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function patched(key) {
        if (key === intentKey) return null;
        return original.call(this, key);
      };
    }, PENDING_SHARE_INTENT_KEY);
    await installGuestAuthFixtures(page);
    await page.goto(`/tier?atb692-intent-readback-failure=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierHeading(page);
    await page.getByRole("button", { name: "共有" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Googleでログイン" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: PENDING_SHARE_INTENT_STORAGE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 10_000 });
    expect(signInRequests).toBe(0);
  });

  test.describe("authenticated handoff safety", () => {
    test.use({
      storageState: "tests/.auth/user.json",
      serviceWorkers: "block"
    });

  test("owner identity persistence failure fails closed", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(
      ({ ownerKey }) => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function patched(key, value) {
          if (key === ownerKey) throw new Error("identity quota");
          return original.call(this, key, value);
        };
      },
      { ownerKey: SHARE_HANDOFF_OWNER_TAB_ID_KEY }
    );
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
  });

  test("pending intent read failure enters protected recovery without remote traffic", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript((intentKey) => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function patched(key) {
        if (key === intentKey) throw new Error("intent read failure");
        return original.call(this, key);
      };
    }, PENDING_SHARE_INTENT_KEY);
    await installAuthReturnFixtures(page, { counters, remoteBoardRef });
    await page.goto(`/tier?atb692-intent-read-failure=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierHeading(page);
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.boardGet).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
  });

  test("guest board read failure enters protected recovery without replacing it remotely", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    await page.addInitScript((storageKey) => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function patched(key) {
        if (key === storageKey) throw new Error("board read failure");
        return original.call(this, key);
      };
    }, STORAGE_KEY);
    await installAuthReturnFixtures(page, { counters, remoteBoardRef });
    await page.goto(`/tier?atb692-board-read-failure=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierHeading(page);
    await page.waitForTimeout(900);
    await seedIntentAndBoard(page, validIntent(), localBoard());
    resetCounters(counters);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.boardGet).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
  });

  test("missing Web Locks support fails closed without POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "locks", {
          configurable: true,
          value: undefined
        });
      } catch {
        // The production guard still treats an unavailable manager as unsafe.
      }
    });
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_OTHER_TAB_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
  });

  test("stable owner identity survives reload", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect.poll(() => counters.sharePost, { timeout: 20_000 }).toBe(1);
    const firstId = await readOwnerTabId(page);
    expect(firstId).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    expect(await readOwnerTabId(page)).toBe(firstId);
    expect(counters.sharePost).toBe(1);
  });

  test("simultaneous tabs serialize ownership and issue one POST", async ({
    page,
    context
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const page2 = await context.newPage();
    const errors = await attachErrorWatch(page);
    const errors2 = await attachErrorWatch(page2);
    await installAuthReturnFixtures(page, { counters, remoteBoardRef, delayPostMs: 1500 });
    await installAuthReturnFixtures(page2, { counters, remoteBoardRef, delayPostMs: 1500 });
    await Promise.all([
      page.goto(`/tier?atb692-race-a=${Date.now()}`, { waitUntil: "domcontentloaded" }),
      page2.goto(`/tier?atb692-race-b=${Date.now()}`, { waitUntil: "domcontentloaded" })
    ]);
    await Promise.all([waitForTierHeading(page), waitForTierHeading(page2)]);
    await page.waitForTimeout(900);
    await page2.waitForTimeout(900);
    await seedIntentAndBoard(page, validIntent(), localBoard(), null);
    await page2.evaluate(({ key, year, season }) => {
      sessionStorage.setItem(key, JSON.stringify({
        version: 1,
        action: "share",
        year,
        season,
        createdAt: new Date().toISOString()
      }));
    }, { key: PENDING_SHARE_INTENT_KEY, year: SEASON_YEAR, season: SEASON });
    await Promise.all([
      page.reload({ waitUntil: "domcontentloaded" }),
      page2.reload({ waitUntil: "domcontentloaded" })
    ]);
    await Promise.all([waitForTierHeading(page), waitForTierHeading(page2)]);
    await expect.poll(() => counters.sharePost, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(1800);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
    errors2.assertClean();
    await page2.close();
  });

  test("copied owner identity with distinct attempts issues exactly one PUT and one POST", async ({
    page,
    context
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const page2 = await context.newPage();
    const errors = await attachErrorWatch(page);
    const errors2 = await attachErrorWatch(page2);
    await installAuthReturnFixtures(page, {
      counters,
      remoteBoardRef,
      delayPutMs: 1200,
      delayPostMs: 400
    });
    await installAuthReturnFixtures(page2, {
      counters,
      remoteBoardRef,
      delayPutMs: 1200,
      delayPostMs: 400
    });
    await Promise.all([
      page.goto(`/tier?atb692-copied-owner-a=${Date.now()}`, { waitUntil: "domcontentloaded" }),
      page2.goto(`/tier?atb692-copied-owner-b=${Date.now()}`, {
        waitUntil: "domcontentloaded"
      })
    ]);
    await Promise.all([waitForTierHeading(page), waitForTierHeading(page2)]);
    await page.waitForTimeout(900);
    await page2.waitForTimeout(900);

    const ownerTabId = await readOwnerTabId(page);
    expect(ownerTabId).toBeTruthy();
    await page2.evaluate(
      ({ ownerKey, owner }) => sessionStorage.setItem(ownerKey, owner),
      { ownerKey: SHARE_HANDOFF_OWNER_TAB_ID_KEY, owner: ownerTabId }
    );
    await Promise.all([
      seedIntentAndBoard(page, validIntent(), localBoard()),
      seedIntentAndBoard(page2, validIntent(), localBoard())
    ]);
    resetCounters(counters);
    await Promise.all([
      page.reload({ waitUntil: "domcontentloaded" }),
      page2.reload({ waitUntil: "domcontentloaded" })
    ]);
    await Promise.all([waitForTierHeading(page), waitForTierHeading(page2)]);

    await expect.poll(() => counters.boardPut, { timeout: 20_000 }).toBe(1);
    await expect.poll(() => counters.sharePost, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(1800);
    expect(counters.boardPut).toBe(1);
    expect(counters.sharePost).toBe(1);
    expect(counters.order.filter((entry) => entry.method === "PUT")).toHaveLength(1);
    expect(counters.order.filter((entry) => entry.method === "POST")).toHaveLength(1);
    errors.assertClean();
    errors2.assertClean();
    await page2.close();
  });

  test("intent removal failure persists recovery and forbids POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(
      ({ intentKey }) => {
        const original = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function patched(key) {
          if (key === intentKey) throw new Error("remove quota");
          return original.call(this, key);
        };
      },
      { intentKey: PENDING_SHARE_INTENT_KEY }
    );
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /再試行/ })).toHaveCount(0);
    expect(counters.sharePost).toBe(0);
    expect(await readRecoveryRaw(page)).toBeTruthy();
  });

  test("definite POST failure persistence failure does not expose retry", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(
      ({ recoveryKey }) => {
        const original = Storage.prototype.setItem;
        let writes = 0;
        Storage.prototype.setItem = function patched(key, value) {
          if (key === recoveryKey && ++writes > 1) throw new Error("set quota");
          return original.call(this, key, value);
        };
      },
      { recoveryKey: SHARE_HANDOFF_RECOVERY_KEY }
    );
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareStatus: 500,
      remoteAfterLoad: null
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /再試行/ })).toHaveCount(0);
    expect(counters.sharePost).toBe(1);
    expect(await readBoardRaw(page)).toBe(JSON.stringify(localBoard()));
  });

  test("cleanup transition set failure preserves guest board and recovery", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(
      ({ recoveryKey }) => {
        const original = Storage.prototype.setItem;
        let writes = 0;
        Storage.prototype.setItem = function patched(key, value) {
          if (key === recoveryKey && ++writes > 1) throw new Error("cleanup quota");
          return original.call(this, key, value);
        };
      },
      { recoveryKey: SHARE_HANDOFF_RECOVERY_KEY }
    );
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(1);
    expect(await readBoardRaw(page)).toBe(JSON.stringify(localBoard()));
    expect(await readRecoveryRaw(page)).toBeTruthy();
  });

  test("cleanup remove failure is recoverable without another POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    await page.addInitScript(
      ({ recoveryKey }) => {
        const original = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function patched(key) {
          if (key === recoveryKey) throw new Error("remove quota");
          return original.call(this, key);
        };
      },
      { recoveryKey: SHARE_HANDOFF_RECOVERY_KEY }
    );
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await page.waitForTimeout(900);
    expect(counters.sharePost).toBe(1);
  });

  test("noncanonical intent timestamp and extra board fields fail closed", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const malformedIntent = {
      ...validIntent(),
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
    };
    const extraBoard = { ...localBoard(), unexpected: true } as unknown as BoardJson;
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: malformedIntent,
      local: extraBoard,
      remoteAfterLoad: remoteDivergentBoard()
    });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
  });

  test("extra nested tier fields fail closed", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const malformed = JSON.parse(JSON.stringify(localBoard())) as BoardJson & {
      tiers: Array<BoardJson["tiers"][number] & { unexpected?: boolean }>;
    };
    malformed.tiers[0].unexpected = true;
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      local: malformed,
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
  });
  });
});

test.describe("ATB-692 authenticated auto-resume", () => {
  test.use({ serviceWorkers: "block" });

  test("evaluating locks mutations before GET; remote-none PUTs local then one POST", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);

    await page.addInitScript(() => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const w = window as Window & {
        __ATB704_AUTH_RETURN_DECISION_GATE__?: Promise<void> | null;
        __ATB704_AUTH_RETURN_RELEASE__?: () => void;
      };
      w.__ATB704_AUTH_RETURN_DECISION_GATE__ = gate;
      w.__ATB704_AUTH_RETURN_RELEASE__ = () => release();
    });

    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });

    const evaluating = page.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EVALUATING });
    await expect(evaluating).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "共有" })).toBeDisabled();
    expect(counters.boardGet).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    const postPromise = page.waitForRequest(
      (req: Request) => {
        try {
          return new URL(req.url()).pathname === "/api/shares" && req.method() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 20_000 }
    );

    await page.evaluate(() => {
      const w = window as Window & { __ATB704_AUTH_RETURN_RELEASE__?: () => void };
      w.__ATB704_AUTH_RETURN_RELEASE__?.();
    });

    const postReq = await postPromise;
    expect(await readIntentRaw(page)).toBeNull();
    await expect.poll(() => counters.sharePost, { timeout: 10_000 }).toBe(1);
    expect(counters.boardPut).toBe(1);
    expect(
      counters.order.slice(0, 3).map((entry) => `${entry.method} ${entry.path}`)
    ).toEqual(["GET /api/boards", "PUT /api/boards", "POST /api/shares"]);
    const putBody = counters.order[1]?.body as {
      board?: BoardJson;
      expectedUpdatedAt?: string | null;
    };
    expect(putBody.board?.tiers.find((tier) => tier.id === "tier-s")?.itemIds).toEqual([
      SSR_FIXTURE_ITEM_ID
    ]);
    expect(putBody.expectedUpdatedAt ?? null).toBeNull();
    const shareBody = postReq.postDataJSON() as {
      board?: { tiers?: Array<{ id: string; itemIds: string[] }> };
    };
    expect(shareBody.board?.tiers?.find((tier) => tier.id === "tier-s")?.itemIds).toEqual([
      SSR_FIXTURE_ITEM_ID
    ]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("same remote board resumes with one POST and no PUT", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteSameBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef);

    await expect.poll(() => counters.sharePost, { timeout: 20_000 }).toBe(1);
    expect(counters.boardPut).toBe(0);
    expect(await readIntentRaw(page)).toBeNull();
    expect(
      counters.order.slice(0, 2).map((entry) => `${entry.method} ${entry.path}`)
    ).toEqual(["GET /api/boards", "POST /api/shares"]);
    errors.assertClean();
  });

  test("divergent boards show conflict with no PUT/POST until choice; Escape cancels", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const localBefore = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, { local: localBefore });

    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("button", { name: "この端末のTier表を使う" })).toBeFocused();
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
    expect(await readIntentRaw(page)).toBeTruthy();
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").tiers.find((t: { id: string }) => t.id === "tier-s").itemIds).toEqual(
      [SSR_FIXTURE_ITEM_ID]
    );

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "アカウントのTier表を使う" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("remote choice adopts remote with no PUT then one POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef);

    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const postPromise = page.waitForRequest(
      (req: Request) => {
        try {
          return new URL(req.url()).pathname === "/api/shares" && req.method() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: "アカウントのTier表を使う" }).click();
    const postReq = await postPromise;
    expect(await readIntentRaw(page)).toBeNull();
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(1);
    const body = postReq.postDataJSON() as {
      board?: { tiers?: Array<{ id: string; itemIds: string[] }> };
    };
    const unranked = body.board?.tiers?.find((tier) => tier.id === "tier-unranked");
    expect(unranked?.itemIds.includes(SSR_FIXTURE_ITEM_ID)).toBe(true);
    errors.assertClean();
  });

  test("local choice requires confirm, PUTs expectedUpdatedAt, then one POST", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef);

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await expect(
      page.getByRole("dialog", { name: "アカウントに保存済みのTier表を置き換えます。よろしいですか？" })
    ).toBeVisible();
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    const postPromise = page.waitForRequest(
      (req: Request) => {
        try {
          return new URL(req.url()).pathname === "/api/shares" && req.method() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await postPromise;
    expect(counters.boardPut).toBe(1);
    expect(counters.sharePost).toBe(1);
    const putBody = counters.order.find((entry) => entry.method === "PUT")?.body as {
      expectedUpdatedAt?: string;
      board?: BoardJson;
    };
    expect(putBody.expectedUpdatedAt).toBe(REMOTE_UPDATED_AT);
    expect(putBody.board?.tiers.find((tier) => tier.id === "tier-s")?.itemIds).toEqual([
      SSR_FIXTURE_ITEM_ID
    ]);
    expect(await readIntentRaw(page)).toBeNull();
    errors.assertClean();
  });

  test("409 on local PUT refetches and returns to conflict without share", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      putConflictOnce: { remaining: 1 }
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 15_000
    });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(1);
    expect(counters.boardGet).toBeGreaterThanOrEqual(2);
    expect(await readIntentRaw(page)).toBeTruthy();
    errors.assertClean();
  });

  test("GET 500 preserves local board, shows alert, retry/cancel, zero share", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, { boardGetStatus: 500 });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);

    await page.getByRole("button", { name: "共有をやめる" }).click();
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("share 500 keeps chosen board and does not auto-retry", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareStatus: 500,
      remoteAfterLoad: null
    });

    await expect(
      page.getByRole("alert").filter({ hasText: SHARE_CREATE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => counters.sharePost, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(1);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").tiers.find((t: { id: string }) => t.id === "tier-s").itemIds).toEqual(
      [SSR_FIXTURE_ITEM_ID]
    );
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();
    await expect(page.getByRole("button", { name: "共有をやめる" })).toBeVisible();
    errors.assertClean();
  });

  test("expired/invalid/mismatched intent does not auto PUT/POST/conflict", async ({
    page
  }) => {
    const cases: Array<{ name: string; intent: unknown }> = [
      {
        name: "expired",
        intent: validIntent(new Date(Date.now() - 11 * 60 * 1000).toISOString())
      },
      { name: "broken", intent: { version: 1, action: "share" } },
      { name: "unknown-action", intent: { ...validIntent(), action: "reset" } },
      { name: "mismatch", intent: { ...validIntent(), season: OTHER_SEASON } },
      {
        name: "future",
        intent: validIntent(new Date(Date.now() + 60_000).toISOString())
      },
      {
        name: "wrong-year",
        intent: { ...validIntent(), year: SEASON_YEAR - 1 }
      },
      {
        name: "extra-key",
        intent: { ...validIntent(), board: { evil: true } }
      }
    ];

    for (const c of cases) {
      const counters = createCounters();
      const remoteBoardRef = { current: remoteDivergentBoard() };
      const errors = await attachErrorWatch(page);
      await page.unroute("**/*").catch(() => undefined);
      await bootstrapHandoff(page, counters, remoteBoardRef, { intent: c.intent });
      await page.waitForTimeout(900);
      await expect(
        page.getByRole("dialog", { name: "保存済みのTier表があります" }),
        c.name
      ).toHaveCount(0);
      expect(counters.boardPut, c.name).toBe(0);
      expect(counters.sharePost, c.name).toBe(0);
      if (c.name === "expired") {
        await expect(
          page.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EXPIRED })
        ).toBeVisible();
      }
      expect(await readIntentRaw(page), c.name).toBeNull();
      errors.assertClean();
    }
  });

  test("PUT 500 retry then succeeds without duplicate POST; cancel keeps guest copy", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const putFailuresRemaining = { remaining: 1 };
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      putFailuresRemaining,
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 15_000 });
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);

    await page.getByRole("button", { name: "再試行" }).click();
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    expect(counters.boardPut).toBe(2);
    errors.assertClean();
  });

  test("PUT 500 cancel preserves guest copy and never POSTs", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      boardPutStatus: 500,
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "共有をやめる" }).click();
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("POST failure retry is POST-only; cancel restores guest snapshot", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    const shareFailuresRemaining = { remaining: 1 };
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareFailuresRemaining,
      remoteAfterLoad: null
    });

    await expect(
      page.getByRole("alert").filter({ hasText: SHARE_CREATE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => counters.sharePost).toBe(1);
    const putsAfterFail = counters.boardPut;
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);

    await page.getByRole("button", { name: "再試行" }).click();
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(2);
    expect(counters.boardPut).toBe(putsAfterFail);
    errors.assertClean();
  });

  test("Escape during pending PUT does not POST later", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      delayPutMs: 4000,
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await expect.poll(() => counters.boardPut, { timeout: 10_000 }).toBe(1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(4500);
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("abort-ignoring pending PUT cancel prevents POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await page.addInitScript(() => {
      (window as Window & { __ATB692_IGNORE_HANDOFF_ABORT__?: boolean }).__ATB692_IGNORE_HANDOFF_ABORT__ =
        true;
    });
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      delayPutMs: 4000,
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await page.getByRole("button", { name: "置き換えて共有" }).click();
    await expect.poll(() => counters.boardPut, { timeout: 10_000 }).toBe(1);
    await page.locator(".move-sheet-backdrop").click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(4500);
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("pending POST locks cancel and completes exactly once", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      delayPostMs: 4000,
      remoteAfterLoad: null
    });

    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    const sharing = page.getByRole("status").filter({ hasText: HANDOFF_SHARING_STATUS_MESSAGE });
    await expect(sharing).toBeVisible();
    await expect(page.getByRole("button", { name: "共有をやめる" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.locator(".move-sheet-backdrop").click({ position: { x: 4, y: 4 } }).catch(() => undefined);
    await page.waitForTimeout(4500);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("structural local corruption fails closed with recoverable UI", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const corrupt = {
      version: 1,
      season: SEASON,
      seasonYear: SEASON_YEAR,
      tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: [1] }],
      updatedAt: LOCAL_UPDATED_AT
    };
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      local: corrupt as unknown as BoardJson,
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("malformed remote fails closed without share", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      malformedRemote: true,
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_LOAD_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("conflict dialog traps Tab and Shift+Tab", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      remoteAfterLoad: remoteDivergentBoard()
    });
    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const localBtn = page.getByRole("button", { name: "この端末のTier表を使う" });
    const remoteBtn = page.getByRole("button", { name: "アカウントのTier表を使う" });
    const cancelBtn = page.getByRole("button", { name: "共有をやめる" });
    await expect(localBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(remoteBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(localBtn).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancelBtn).toBeFocused();
    errors.assertClean();
  });

  test("reload after successful share does not POST again", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, { remoteAfterLoad: null });
    await expect.poll(() => counters.sharePost, { timeout: 20_000 }).toBe(1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await page.waitForTimeout(900);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("reload with consumed intent and unknown recovery marker never auto-POSTs", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, { postState: "post_started_unknown" }),
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "共有をやめる" })).toBeVisible();
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    expect(await readRecoveryRaw(page)).toBeTruthy();
    errors.assertClean();
  });

  test("definite POST failure recovery allows explicit retry then cancel restores guest", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, { postState: "post_failed_definite" }),
      remoteAfterLoad: null
    });

    await expect(
      page.getByRole("alert").filter({ hasText: SHARE_CREATE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();
    expect(counters.sharePost).toBe(0);

    await page.getByRole("button", { name: "再試行" }).click();
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    errors.assertClean();
  });

  test("recovery cancel restores byte-equivalent guest then clears marker", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    const guestRaw = JSON.stringify(local);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, { guestRaw, postState: "post_started_unknown" }),
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "共有をやめる" }).click();
    expect(await readBoardRaw(page)).toBe(guestRaw);
    expect(await readRecoveryRaw(page)).toBeNull();
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("network-unknown POST does not offer retry", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      abortShare: true,
      remoteAfterLoad: null
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    await expect.poll(() => counters.sharePost, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(1);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("PUT connection reset after server commit preserves unknown state across reload", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      abortPut: true,
      commitPutThenAbort: true,
      remoteAfterLoad: null
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /再試行/ })).toHaveCount(0);
    expect(counters.boardPut).toBe(1);
    expect(counters.sharePost).toBe(0);
    expect(remoteBoardRef.current?.tiers.find((tier) => tier.id === "tier-s")?.itemIds).toEqual([
      SSR_FIXTURE_ITEM_ID
    ]);
    const marker = JSON.parse((await readRecoveryRaw(page)) ?? "null") as {
      putStatus?: string;
      postState?: string;
    } | null;
    expect(marker?.putStatus).toBe("unknown");
    expect(marker?.postState).toBe("not_started");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierHeading(page);
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_OTHER_TAB_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    expect(counters.boardPut).toBe(1);
    expect(counters.sharePost).toBe(0);
    await expect(page.getByRole("button", { name: /再試行/ })).toHaveCount(0);
    errors.assertClean();
  });

  test("wrong remote season/year is recoverable and writes nothing", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      wrongRemoteContext: true,
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_REMOTE_CONTEXT_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("double activation of replace and adopt does not duplicate writes", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    const adopt = page.getByRole("button", { name: "アカウントのTier表を使う" });
    await adopt.dblclick();
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("double activation of confirm-replace issues one PUT and one POST", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toBeVisible({
      timeout: 20_000
    });
    await page.getByRole("button", { name: "この端末のTier表を使う" }).click();
    const confirm = page.getByRole("button", { name: "置き換えて共有" });
    await confirm.dblclick();
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    expect(counters.boardPut).toBe(1);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("unresolved recovery marker suppresses autosave writes", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, { postState: "post_started_unknown" }),
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    const puts = counters.boardPut;
    await page.waitForTimeout(1200);
    expect(counters.boardPut).toBe(puts);
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("expired recovery marker keeps guest data and does not auto-POST", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, {
        postState: "post_started_unknown",
        createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        leaseExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }),
      remoteAfterLoad: remoteDivergentBoard()
    });

    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_EXPIRED_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
    expect(JSON.parse((await readBoardRaw(page)) ?? "{}").updatedAt).toBe(LOCAL_UPDATED_AT);
    errors.assertClean();
  });

  test("2xx missing shareId is outcome-unknown and does not retry", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareBody: { ok: true },
      remoteAfterLoad: null
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    await expect.poll(() => counters.sharePost, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("2xx malformed JSON is outcome-unknown and does not retry", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareMalformedJson: true,
      remoteAfterLoad: null
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("2xx empty shareId is outcome-unknown", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      shareBody: { shareId: "   " },
      remoteAfterLoad: null
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNKNOWN_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("malformed single recovery record fails closed without POST", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: { version: 2, broken: true },
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);
    errors.assertClean();
  });

  test("wrong-context guestRaw in marker is rejected", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    const wrongGuest = { ...local, season: OTHER_SEASON };
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, {
        guestRaw: JSON.stringify(wrongGuest),
        chosenBoardRaw: JSON.stringify(local)
      }),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("lowercase season token is not normalized into acceptance", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, { season: String(SEASON).toLowerCase() }),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("mismatched recovery context fails closed", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, {
        storageKey: `${BOARD_STORAGE_PREFIX}:${SEASON_YEAR}:${OTHER_SEASON}`
      }),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("storage exception on recovery record fails closed", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    await page.addInitScript(
      ({ recoveryKey }) => {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function patched(key) {
          if (key === recoveryKey) {
            throw new Error("quota");
          }
          return original.call(this, key);
        };
      },
      { recoveryKey: SHARE_HANDOFF_RECOVERY_KEY }
    );
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_UNREADABLE_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("other-tab owner lease blocks POST", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, {
        ownerTabId: "e2e-live-owner",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString()
      }),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect(
      page.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_OTHER_TAB_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });

  test("second page cannot POST while owner lease is valid", async ({ page, context }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: null as BoardJson | null };
    const errors = await attachErrorWatch(page);
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      delayPostMs: 6000,
      remoteAfterLoad: null
    });
    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    await expect(
      page.getByRole("status").filter({ hasText: HANDOFF_SHARING_STATUS_MESSAGE })
    ).toBeVisible();

    const page2 = await context.newPage();
    const counters2 = createCounters();
    const errors2 = await attachErrorWatch(page2);
    await installAuthReturnFixtures(page2, {
      counters: counters2,
      remoteBoardRef
    });
    await page2.goto(`/tier?atb692-tab2=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(
      page2.getByRole("alert").filter({ hasText: HANDOFF_RECOVERY_OTHER_TAB_MESSAGE })
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(6500);
    expect(counters.sharePost).toBe(1);
    expect(counters2.sharePost).toBe(0);
    errors.assertClean();
    errors2.assertClean();
    await page2.close();
  });

  test("cleanup-pending crash finishes local commit and never re-POSTs", async ({ page }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteDivergentBoard() };
    const errors = await attachErrorWatch(page);
    const local = localBoard();
    const chosen = { ...local, updatedAt: "2026-07-28T15:00:00.000Z" };
    await bootstrapHandoff(page, counters, remoteBoardRef, {
      intent: null,
      local,
      recovery: recoveryMarkerFixture(local, {
        postState: "post_completed_cleanup_pending",
        chosenBoardRaw: JSON.stringify(chosen)
      }),
      remoteAfterLoad: remoteDivergentBoard()
    });
    await expect.poll(async () => await readRecoveryRaw(page), { timeout: 15_000 }).toBeNull();
    expect(await readBoardRaw(page)).toBe(JSON.stringify(chosen));
    expect(counters.sharePost).toBe(0);
    await expect(page.getByRole("button", { name: "再試行" })).toHaveCount(0);
    errors.assertClean();
  });
});
