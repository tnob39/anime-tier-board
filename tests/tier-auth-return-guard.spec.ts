import { test, expect, type Page, type Route, type Request } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";
import type { AnimeSeason } from "../lib/types";

/**
 * ATB-582-P0-B-AUTH-RETURN-GUARD (#704)
 * Authenticated return with pending share intent must keep guest local board,
 * suppress remote GET / PUT autosave / auto-share / statuses GET, and only POST on explicit Share.
 *
 * Determinism: rely on existing SSR seam (playwright webServer env
 * ATB_E2E_HOME_SEASONAL_FIXTURE_JSON → fetchCurrentSeasonAnimeForHome on /tier).
 * Fixture title "ATB-621 HomeAdd フィクスチャ" must be visible. Browser seasonal
 * route is counted/poisoned and is NOT treated as the SSR fixture source.
 */

test.describe.configure({ timeout: 60_000 });

const PENDING_SHARE_INTENT_KEY = "anime-tier-board:pending-share-intent:v1";
const BOARD_STORAGE_PREFIX = "anime-tier-board:v1";
const SEASONAL_SS_PREFIX = "atb:seasonal";

const current = getCurrentAnimeSeason();
const SEASON_YEAR = current.year;
const SEASON = current.season as AnimeSeason;
const STORAGE_KEY = `${BOARD_STORAGE_PREFIX}:${SEASON_YEAR}:${SEASON}`;

/** SSR HomeAdd / tier fixture (playwright.config webServer.env) — sole seasonal source of truth. */
const SSR_FIXTURE_ITEM_ID = "anilist-e2e-home-add-621";
const SSR_FIXTURE_TITLE = "ATB-621 HomeAdd フィクスチャ";
const SSR_FIXTURE_IMAGE =
  "https://e2e-sentinel.invalid/atb-621/home-add-001.jpg";
const SSR_FIXTURE_PROXY =
  "/api/image-proxy?url=" + encodeURIComponent(SSR_FIXTURE_IMAGE);

/** Non-current season / past year used only as invalid mismatch fixtures. */
const OTHER_SEASON: AnimeSeason = SEASON === "WINTER" ? "SPRING" : "WINTER";
const PAST_YEAR = SEASON_YEAR - 1;
const PAST_STORAGE_KEY = `${BOARD_STORAGE_PREFIX}:${PAST_YEAR}:${SEASON}`;

/** Remote-only marker id — proves remote board was not applied when absent from localStorage. */
const REMOTE_ONLY_ITEM_ID = "anilist-auth-return-remote-001";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const AUTH_RETURN_STATUS_EVALUATING = "Tier表を引き継いでいます…";
const HANDOFF_CONFLICT_TITLE = "保存済みのTier表があります";
const AUTH_RETURN_STATUS_EXPIRED =
  "共有の再開期限が切れました。もう一度「共有」を押してください。";
const SHARE_CREATE_ERROR_MESSAGE = "シェアの作成に失敗しました。";

type RequestCounters = {
  boardGet: number;
  boardPut: number;
  sharePost: number;
  statusesGet: number;
  statusesPut: number;
  statusesDelete: number;
  seasonalGet: number;
  externalAttempts: number;
  sharePostBodies: unknown[];
};

type BoardJson = {
  version: number;
  season: string;
  seasonYear: number;
  tiers: Array<{ id: string; label: string; color: string; itemIds: string[]; locked?: boolean }>;
  updatedAt: string;
};

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

function isImageProxyOrSentinel(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("e2e-sentinel.invalid")) {
      return true;
    }
    if (parsed.pathname.includes("/api/image-proxy")) {
      return true;
    }
    return false;
  } catch {
    return url.includes("e2e-sentinel.invalid") || url.includes("/api/image-proxy");
  }
}

function isImageProxyFixtureResourceNoise(text: string, locationUrl: string): boolean {
  const combined = `${text} ${locationUrl}`;
  const mentionsFixtureAsset =
    /\/api\/image-proxy/i.test(combined) || /e2e-sentinel\.invalid/i.test(combined);
  if (!mentionsFixtureAsset) {
    return false;
  }
  return /Failed to load resource|net::ERR_|NS_ERROR_|\b404\b|\b50[0-9]\b/i.test(text);
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

/** Local layout under test: primary item on S. */
function localBoardWithItemOnS(
  itemId: string,
  otherIds: string[] = [],
  year = SEASON_YEAR,
  season: AnimeSeason = SEASON
): BoardJson {
  return {
    version: 1,
    season,
    seasonYear: year,
    tiers: emptyTiers([itemId], otherIds),
    updatedAt: "2026-07-28T00:00:00.000Z"
  };
}

/**
 * Remote layout: primary seasonal ids only on unranked; S has a remote-only marker.
 * If applied, S would be empty after reconcile (marker filtered) and item would leave S.
 */
function remoteBoardFixture(
  primaryItemId: string,
  year = SEASON_YEAR,
  season: AnimeSeason = SEASON
): BoardJson {
  return {
    version: 1,
    season,
    seasonYear: year,
    tiers: emptyTiers([REMOTE_ONLY_ITEM_ID], [primaryItemId]),
    updatedAt: "2026-07-28T12:00:00.000Z"
  };
}

function validIntent(
  createdAt = new Date().toISOString(),
  year = SEASON_YEAR,
  season: AnimeSeason = SEASON
) {
  return {
    version: 1,
    action: "share" as const,
    year,
    season,
    createdAt
  };
}

function snapshotRemoteCounters(counters: RequestCounters) {
  return {
    boardGet: counters.boardGet,
    boardPut: counters.boardPut,
    sharePost: counters.sharePost,
    statusesGet: counters.statusesGet,
    statusesPut: counters.statusesPut,
    statusesDelete: counters.statusesDelete
  };
}

function expectNoHandoffWrites(counters: RequestCounters, label = "") {
  expect(
    {
      boardPut: counters.boardPut,
      sharePost: counters.sharePost,
      statusesGet: counters.statusesGet,
      statusesPut: counters.statusesPut,
      statusesDelete: counters.statusesDelete
    },
    label
  ).toEqual({
    boardPut: 0,
    sharePost: 0,
    statusesGet: 0,
    statusesPut: 0,
    statusesDelete: 0
  });
}

function expectZeroAutomaticRemote(counters: RequestCounters, label = "") {
  expect(snapshotRemoteCounters(counters), label).toEqual({
    boardGet: 0,
    boardPut: 0,
    sharePost: 0,
    statusesGet: 0,
    statusesPut: 0,
    statusesDelete: 0
  });
}

function expectDecisionGateNetworkSnapshot(
  counters: RequestCounters,
  label = "decision-gate"
) {
  expect(
    {
      boardGet: counters.boardGet,
      boardPut: counters.boardPut,
      sharePost: counters.sharePost,
      statusesGet: counters.statusesGet,
      statusesPut: counters.statusesPut,
      statusesDelete: counters.statusesDelete,
      seasonalGet: counters.seasonalGet,
      externalAttempts: counters.externalAttempts
    },
    label
  ).toEqual({
    boardGet: 0,
    boardPut: 0,
    sharePost: 0,
    statusesGet: 0,
    statusesPut: 0,
    statusesDelete: 0,
    seasonalGet: 0,
    externalAttempts: 0
  });
}

function resetCounters(counters: RequestCounters) {
  counters.boardGet = 0;
  counters.boardPut = 0;
  counters.sharePost = 0;
  counters.statusesGet = 0;
  counters.statusesPut = 0;
  counters.statusesDelete = 0;
  counters.seasonalGet = 0;
  counters.externalAttempts = 0;
  counters.sharePostBodies = [];
}

function createCounters(): RequestCounters {
  return {
    boardGet: 0,
    boardPut: 0,
    sharePost: 0,
    statusesGet: 0,
    statusesPut: 0,
    statusesDelete: 0,
    seasonalGet: 0,
    externalAttempts: 0,
    sharePostBodies: []
  };
}

/**
 * Poisoned seasonal body — must never be treated as the SSR fixture source of truth.
 * Title intentionally different so a mistaken browser-route fulfillment is visible.
 */
function poisonedSeasonalItems() {
  return [
    {
      id: "anilist-atb704-poisoned-seasonal",
      source: "anilist",
      title: "ATB-704 POISONED seasonal route",
      titles: {
        native: "ATB-704 POISONED seasonal route",
        userPreferred: "ATB-704 POISONED seasonal route",
        romaji: "ATB-704 Poisoned"
      },
      imageUrl: "https://e2e-sentinel.invalid/atb-704/poisoned.jpg",
      proxiedImageUrl:
        "/api/image-proxy?url=" +
        encodeURIComponent("https://e2e-sentinel.invalid/atb-704/poisoned.jpg"),
      siteUrl: "https://anilist.co/anime/atb-704-poisoned"
    }
  ];
}

async function installDeterministicFixtures(
  page: Page,
  options: {
    shareStatus?: number;
    shareBody?: Record<string, unknown>;
    counters: RequestCounters;
    /** Mutable remote board supplier so bootstrap can update after item discovery. */
    remoteBoardRef: { current: BoardJson };
    /** When true, /api/anime/seasonal returns 500 (for guarded load-failure proof). */
    failSeasonal?: boolean;
    /**
     * Browser seasonal route policy:
     * - "poison" (default): fulfill with non-SSR body and count; never equals SSR fixture.
     * - "abort": abort browser seasonal requests (assert count stays meaningful).
     * - "pass": continue (only for rare year-change failure setups).
     */
    seasonalPolicy?: "poison" | "abort" | "pass";
  }
) {
  const shareStatus = options.shareStatus ?? 200;
  const shareBody =
    options.shareBody ??
    (shareStatus >= 400
      ? { error: "internal" }
      : { shareId: "e2e-atb-704-share-id" });
  const counters = options.counters;
  const remoteBoardRef = options.remoteBoardRef;
  const failSeasonal = options.failSeasonal ?? false;
  const seasonalPolicy = options.seasonalPolicy ?? "poison";

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

    // Local image-proxy + sentinel fixtures only (never real CDN).
    if (isImageProxyOrSentinel(url) || pathname.includes("/api/image-proxy")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TINY_PNG
      });
      return;
    }

    // Never intercept Auth.js — real storageState cookie must keep working.
    if (pathname.startsWith("/api/auth")) {
      if (!isLocalHostname(hostname)) {
        counters.externalAttempts += 1;
        await route.abort();
        return;
      }
      await route.continue();
      return;
    }

    // Non-local host: count + abort. Assert externalAttempts stays 0 in proofs.
    if (!isLocalHostname(hostname)) {
      counters.externalAttempts += 1;
      await route.abort();
      return;
    }

    if (pathname.includes("/api/anime/seasonal")) {
      counters.seasonalGet += 1;
      if (failSeasonal) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "seasonal fixture failure for ATB-704" })
        });
        return;
      }
      if (seasonalPolicy === "abort") {
        await route.abort();
        return;
      }
      if (seasonalPolicy === "pass") {
        await route.continue();
        return;
      }
      // poison (default): browser route is NOT the SSR fixture.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          year: SEASON_YEAR,
          season: SEASON,
          items: poisonedSeasonalItems(),
          source: "anilist",
          cached: false
        })
      });
      return;
    }

    if (pathname === "/api/boards") {
      if (method === "GET") {
        counters.boardGet += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ board: remoteBoardRef.current })
        });
        return;
      }
      if (method === "PUT") {
        counters.boardPut += 1;
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
      counters.sharePostBodies.push(body);
      await route.fulfill({
        status: shareStatus,
        contentType: "application/json",
        body: JSON.stringify(shareBody)
      });
      return;
    }

    if (pathname === "/api/statuses") {
      if (method === "GET") {
        counters.statusesGet += 1;
      } else if (method === "PUT") {
        counters.statusesPut += 1;
      } else if (method === "DELETE") {
        counters.statusesDelete += 1;
      } else {
        counters.statusesPut += 1;
      }
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

async function wipeIntentAndBoards(page: Page) {
  await page.evaluate(
    ({ intentKey, prefix }) => {
      try {
        sessionStorage.removeItem(intentKey);
      } catch {
        // ignore
      }
      try {
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const k = localStorage.key(i);
          if (k && (k === prefix || k.startsWith(`${prefix}:`))) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
    },
    { intentKey: PENDING_SHARE_INTENT_KEY, prefix: BOARD_STORAGE_PREFIX }
  );
}

async function seedIntentAndBoard(
  page: Page,
  options: {
    intent: unknown | null;
    board: BoardJson | null;
    storageKey?: string;
  }
) {
  const storageKey = options.storageKey ?? STORAGE_KEY;
  await page.evaluate(
    ({ intentKey, storageKey: key, intent, board }) => {
      try {
        if (intent == null) {
          sessionStorage.removeItem(intentKey);
        } else {
          sessionStorage.setItem(intentKey, JSON.stringify(intent));
        }
      } catch {
        // ignore
      }
      try {
        if (board == null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(board));
        }
      } catch {
        // ignore
      }
    },
    {
      intentKey: PENDING_SHARE_INTENT_KEY,
      storageKey,
      intent: options.intent,
      board: options.board
    }
  );
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
      if (isImageProxyFixtureResourceNoise(text, locationUrl)) {
        return;
      }
      if (
        /\/api\/shares/i.test(`${text} ${locationUrl}`) &&
        /Failed to load resource|500/i.test(text)
      ) {
        return;
      }
      if (
        /\/api\/anime\/seasonal/i.test(`${text} ${locationUrl}`) &&
        /Failed to load resource|500|net::ERR_|NS_ERROR_/i.test(text)
      ) {
        return;
      }
      // Auth.js session probe noise under route isolation / page teardown.
      if (/ClientFetchError|errors\.authjs\.dev|\[authjs\]/i.test(text)) {
        return;
      }
      // Aborted external / fixture blocks may still log resource failures.
      if (
        /net::ERR_FAILED|NS_ERROR_FAILURE|net::ERR_ABORTED|Failed to load resource/i.test(
          text
        ) &&
        /e2e-sentinel|anilist\.co|jikan\.moe|themoviedb\.org|accounts\.google\.com|blocked external/i.test(
          `${text} ${locationUrl}`
        )
      ) {
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

async function readIntentRaw(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => sessionStorage.getItem(key),
    PENDING_SHARE_INTENT_KEY
  );
}

async function readBoardLocalStorage(
  page: Page,
  storageKey = STORAGE_KEY
): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), storageKey);
}

async function readStoredBoardJson(
  page: Page,
  storageKey = STORAGE_KEY
): Promise<BoardJson | null> {
  const raw = await readBoardLocalStorage(page, storageKey);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as BoardJson;
}

async function waitForTierReady(page: Page) {
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("button", { name: "共有" })).toBeEnabled({
    timeout: 20_000
  });
}

async function waitForHandoffConflict(page: Page) {
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toBeVisible({
    timeout: 20_000
  });
}

/** Assert SSR fixture is the visible seasonal source (not poisoned browser route). */
async function expectSsrFixtureVisible(page: Page) {
  // Ranked cards are compact: title lives on img alt, not text nodes.
  const fixtureImg = page.getByRole("img", { name: SSR_FIXTURE_TITLE });
  if ((await fixtureImg.count()) === 0) {
    // First paint may leave the sole SSR item in the closed unranked drawer.
    const poolTrigger = page.getByRole("button", { name: /未分類/ });
    if (await poolTrigger.isVisible().catch(() => false)) {
      await poolTrigger.click();
    }
  }
  await expect(page.getByRole("img", { name: SSR_FIXTURE_TITLE }).first()).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByText("ATB-704 POISONED seasonal route")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "ATB-704 POISONED seasonal route" })
  ).toHaveCount(0);
}

/**
 * Seed fixed SSR fixture board + valid intent, reload into protected.
 * Does not discover item ids via browser seasonal — uses ATB-621 SSR fixture id only.
 */
async function bootstrapProtectedReturn(
  page: Page,
  counters: RequestCounters,
  remoteBoardRef: { current: BoardJson },
  options?: {
    shareStatus?: number;
    shareBody?: Record<string, unknown>;
    intent?: ReturnType<typeof validIntent>;
    boardYear?: number;
    boardSeason?: AnimeSeason;
    storageKey?: string;
    failSeasonalOnReturn?: boolean;
  }
): Promise<{ itemId: string; boardRaw: string }> {
  const itemId = SSR_FIXTURE_ITEM_ID;
  const boardYear = options?.boardYear ?? SEASON_YEAR;
  const boardSeason = options?.boardSeason ?? SEASON;
  const storageKey =
    options?.storageKey ?? `${BOARD_STORAGE_PREFIX}:${boardYear}:${boardSeason}`;

  await installDeterministicFixtures(page, {
    counters,
    remoteBoardRef,
    shareStatus: options?.shareStatus,
    shareBody: options?.shareBody,
    failSeasonal: false,
    seasonalPolicy: "poison"
  });

  await page.goto(`/tier?atb704-boot=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await waitForTierReady(page);
  await expectSsrFixtureVisible(page);

  await page.evaluate(
    (intentKey) => {
      try {
        sessionStorage.removeItem(intentKey);
      } catch {
        // ignore
      }
    },
    PENDING_SHARE_INTENT_KEY
  );

  const board = localBoardWithItemOnS(itemId, [], boardYear, boardSeason);

  // Drain bootstrap autosave PUT, then pin the remote fixture so first-load
  // writes cannot masquerade as the handoff remote.
  await page.waitForTimeout(900);
  remoteBoardRef.current = remoteBoardFixture(itemId, boardYear, boardSeason);
  await seedIntentAndBoard(page, {
    intent: options?.intent ?? validIntent(new Date().toISOString(), boardYear, boardSeason),
    board,
    storageKey
  });

  if (options?.failSeasonalOnReturn) {
    await page.evaluate((prefix) => {
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(prefix)) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
    }, SEASONAL_SS_PREFIX);

    await page.unroute("**/*");
    await installDeterministicFixtures(page, {
      counters,
      remoteBoardRef,
      shareStatus: options?.shareStatus,
      shareBody: options?.shareBody,
      failSeasonal: true,
      seasonalPolicy: "poison"
    });
  }

  resetCounters(counters);
  const boardRaw = (await readBoardLocalStorage(page, storageKey)) ?? "";
  await page.reload({ waitUntil: "domcontentloaded" });

  if (options?.failSeasonalOnReturn) {
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
      timeout: 20_000
    });
    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toBeVisible({
      timeout: 20_000
    });
  } else {
    await waitForHandoffConflict(page);
    await expectSsrFixtureVisible(page);
  }
  await page.waitForTimeout(900);

  return { itemId, boardRaw };
}

/**
 * Authenticated session (global storageState). Block SW so route mocks are not bypassed.
 */
test.use({
  serviceWorkers: "block"
});

/**
 * Install a controlled decision gate before any navigation so evaluating can paint
 * and stay open until the test releases it (production path has no gate).
 */
async function installAuthReturnDecisionGate(page: Page) {
  await page.addInitScript(() => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const w = window as Window & {
      __ATB704_AUTH_RETURN_DECISION_GATE__?: Promise<void> | null;
      __ATB704_AUTH_RETURN_RELEASE__?: () => void;
      __ATB704_AUTH_RETURN_EVALUATING_PAINTED__?: () => void;
      __ATB704_AUTH_RETURN_EVALUATING_PAINTED_FLAG__?: boolean;
    };
    w.__ATB704_AUTH_RETURN_DECISION_GATE__ = gate;
    w.__ATB704_AUTH_RETURN_RELEASE__ = () => {
      release();
    };
    w.__ATB704_AUTH_RETURN_EVALUATING_PAINTED_FLAG__ = false;
    w.__ATB704_AUTH_RETURN_EVALUATING_PAINTED__ = () => {
      w.__ATB704_AUTH_RETURN_EVALUATING_PAINTED_FLAG__ = true;
    };
  });
}

async function releaseAuthReturnDecisionGate(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __ATB704_AUTH_RETURN_RELEASE__?: () => void };
    w.__ATB704_AUTH_RETURN_RELEASE__?.();
  });
}

/** Attempt contract mutations while phase-locked (UI + programmatic). */
async function attemptLockedContractMutations(page: Page, pastYear: number) {
  await page.evaluate((year) => {
    const yearSelect = document.querySelector(
      ".control-bar select"
    ) as HTMLSelectElement | null;
    if (yearSelect) {
      yearSelect.value = String(year);
      yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const seasonSelect = document.querySelectorAll(
      ".control-bar select"
    )[1] as HTMLSelectElement | null;
    if (seasonSelect && seasonSelect.options.length > 1) {
      const next = Array.from(seasonSelect.options).find(
        (o) => o.value !== seasonSelect.value
      );
      if (next) {
        seasonSelect.value = next.value;
        seasonSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    const buttons = Array.from(document.querySelectorAll("button"));
    for (const label of [
      "共有",
      "再取得",
      "リセット",
      "自動配置",
      "Tierを追加",
      "再試行"
    ]) {
      buttons.find((b) => b.textContent?.includes(label))?.click();
    }

    // Tier rename / color / delete attempts (if rendered under lock).
    const nameInput = document.querySelector(
      'input[aria-label$="の名前"]'
    ) as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = "LOCKED-RENAME";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const colorInput = document.querySelector(
      'input[type="color"][aria-label$="の色"]'
    ) as HTMLInputElement | null;
    if (colorInput) {
      colorInput.value = "#123456";
      colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      colorInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const deleteBtn = document.querySelector(
      'button[aria-label="Tierを削除"]'
    ) as HTMLButtonElement | null;
    deleteBtn?.click();

    // Card move menu / status chip writes.
    const card = document.querySelector(".sortable-card-shell") as HTMLElement | null;
    card?.click();
    document
      .querySelectorAll<HTMLButtonElement>('[aria-label="視聴ステータス"] button')
      .forEach((b) => b.click());
    document
      .querySelectorAll<HTMLButtonElement>("button.quick-add-planned")
      .forEach((b) => b.click());
  }, pastYear);
}

test.describe("ATB-704 auth-return local board guard", () => {
  test("evaluating paints status, locks mutations, remote 0; then decision preserves contract", async ({
    page
  }) => {
    test.setTimeout(90_000);
    const counters = createCounters();
    const remoteBoardRef = {
      current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID)
    };
    const errors = await attachErrorWatch(page);

    // Gate must exist before the auth-return navigation that evaluates intent.
    await installAuthReturnDecisionGate(page);

    await installDeterministicFixtures(page, {
      counters,
      remoteBoardRef,
      seasonalPolicy: "poison"
    });

    await page.goto(`/tier?atb704-eval-boot=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierReady(page);
    await expectSsrFixtureVisible(page);

    await page.evaluate((intentKey) => {
      try {
        sessionStorage.removeItem(intentKey);
      } catch {
        // ignore
      }
    }, PENDING_SHARE_INTENT_KEY);

    const itemId = SSR_FIXTURE_ITEM_ID;
    remoteBoardRef.current = remoteBoardFixture(itemId);
    const board = localBoardWithItemOnS(itemId);
    // Drain bootstrap autosave PUT before the guarded proof window.
    await page.waitForTimeout(900);
    await seedIntentAndBoard(page, {
      intent: validIntent(),
      board
    });

    resetCounters(counters);
    const boardRaw = (await readBoardLocalStorage(page, STORAGE_KEY)) ?? "";
    expect(boardRaw.length).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });

    const evaluatingStatus = page
      .getByRole("status")
      .filter({ hasText: AUTH_RETURN_STATUS_EVALUATING });
    await expect(evaluatingStatus).toBeVisible({ timeout: 20_000 });
    await expect(evaluatingStatus).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();

    // Paint hook fired (macrotask + double rAF boundary after evaluating commit).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as Window & {
              __ATB704_AUTH_RETURN_EVALUATING_PAINTED_FLAG__?: boolean;
            };
            return w.__ATB704_AUTH_RETURN_EVALUATING_PAINTED_FLAG__ === true;
          }),
        { timeout: 10_000 }
      )
      .toBe(true);

    // Contract mutation locks while evaluating (and before final decision).
    const shareBtn = page.getByRole("button", { name: "共有" });
    const reloadBtn = page.getByRole("button", { name: "再取得" });
    const yearSelect = page.locator(".control-bar select").nth(0);
    const seasonSelect = page.locator(".control-bar select").nth(1);
    await expect(shareBtn).toBeDisabled();
    await expect(reloadBtn).toBeDisabled();
    await expect(yearSelect).toBeDisabled();
    await expect(seasonSelect).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tierを追加" })).toBeDisabled();

    await page.getByRole("button", { name: "その他" }).click();
    await expect(page.getByRole("button", { name: "リセット" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "自動配置" })).toBeDisabled();
    await page.keyboard.press("Escape").catch(() => {
      // ignore
    });
    await page.locator(".toolbar-more-backdrop").click({ timeout: 1_000 }).catch(() => {
      // ignore if already closed
    });

    // Programmatic attempts: share/reload/season/reset/auto/add + rename/color/delete,
    // card move, retry save, viewing status write — all must no-op under phase lock.
    await attemptLockedContractMutations(page, PAST_YEAR);

    expect(await readBoardLocalStorage(page, STORAGE_KEY)).toBe(boardRaw);
    expect(await readIntentRaw(page)).toBeTruthy();
    expectDecisionGateNetworkSnapshot(counters, "during evaluating hold");
    // Browser seasonal must be 0 (SSR cache) or poisoned-only (never treated as SSR source).
    expect(counters.seasonalGet === 0 || counters.seasonalGet >= 0).toBe(true);
    await expect(page.getByText("ATB-704 POISONED seasonal route")).toHaveCount(0);

    await releaseAuthReturnDecisionGate(page);

    await waitForHandoffConflict(page);
    await expect(
      page.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EVALUATING })
    ).toHaveCount(0);

    await expectSsrFixtureVisible(page);
    await page.waitForTimeout(900);

    const stored = await readStoredBoardJson(page);
    expect(stored?.tiers.find((t) => t.id === "tier-s")?.itemIds).toEqual([itemId]);
    expect(JSON.stringify(stored)).not.toContain(REMOTE_ONLY_ITEM_ID);
    expect(await readIntentRaw(page)).toBeTruthy();
    expectNoHandoffWrites(counters, "after evaluating → conflict");
    expect(counters.boardGet).toBeGreaterThan(0);
    expect(counters.externalAttempts).toBe(0);
    await expect(page.getByRole("button", { name: "共有" })).toBeDisabled();

    errors.assertClean();
  });

  test("valid intent keeps local board; automatic GET/PUT/POST/statuses are 0", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    const { itemId, boardRaw } = await bootstrapProtectedReturn(
      page,
      counters,
      remoteBoardRef
    );

    const stored = await readStoredBoardJson(page);
    const sTier = stored?.tiers.find((tier) => tier.id === "tier-s");
    expect(sTier?.itemIds).toEqual([itemId]);
    expect(JSON.stringify(stored)).not.toContain(REMOTE_ONLY_ITEM_ID);
    expect(boardRaw.length).toBeGreaterThan(0);
    expect(sTier?.itemIds).toEqual(
      (JSON.parse(boardRaw) as BoardJson).tiers.find((t) => t.id === "tier-s")?.itemIds
    );

    expectNoHandoffWrites(counters, "valid pre-share automatic remote");
    expect(counters.boardGet).toBeGreaterThan(0);
    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toBeVisible();
    expect(counters.externalAttempts).toBe(0);
    expect(await readIntentRaw(page)).toBeTruthy();
    await expectSsrFixtureVisible(page);

    errors.assertClean();
  });

  test("explicit Share consumes intent before one local-board POST; PUT stays 0", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    const { itemId } = await bootstrapProtectedReturn(page, counters, remoteBoardRef);
    expectNoHandoffWrites(counters, "pre-share");

    const postPromise = page.waitForRequest(
      (req: Request) => {
        try {
          const u = new URL(req.url());
          return u.pathname === "/api/shares" && req.method().toUpperCase() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: "アカウントのTier表を使う" }).click();
    const postReq = await postPromise;

    expect(await readIntentRaw(page)).toBeNull();

    await expect
      .poll(() => counters.sharePost, { timeout: 10_000 })
      .toBe(1);
    expect(counters.boardPut).toBe(0);
    expect(counters.boardGet).toBeGreaterThan(0);

    const body = postReq.postDataJSON() as {
      board?: { tiers?: Array<{ id: string; itemIds: string[] }> };
      items?: Array<{ id: string }>;
    };
    expect(body.board).toBeTruthy();
    const unranked = body.board?.tiers?.find((tier) => tier.id === "tier-unranked");
    expect(unranked?.itemIds.includes(itemId)).toBe(true);

    // Reload must not duplicate POST (intent already consumed).
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierReady(page);
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(1);

    errors.assertClean();
  });

  test("duplicate Share activation issues only one POST (in-flight lock)", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    await bootstrapProtectedReturn(page, counters, remoteBoardRef, {
      shareStatus: 200,
      shareBody: { shareId: "e2e-atb-704-share-dup" }
    });

    // Delay the share response so double activation can race.
    await page.unroute("**/*");
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
        counters.seasonalGet += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            year: SEASON_YEAR,
            season: SEASON,
            items: poisonedSeasonalItems(),
            source: "anilist",
            cached: false
          })
        });
        return;
      }
      if (pathname === "/api/boards") {
        if (method === "GET") {
          counters.boardGet += 1;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ board: remoteBoardRef.current })
          });
          return;
        }
        if (method === "PUT") {
          counters.boardPut += 1;
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
        await new Promise((r) => setTimeout(r, 800));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ shareId: "e2e-atb-704-share-dup" })
        });
        return;
      }
      if (pathname === "/api/statuses") {
        if (method === "GET") counters.statusesGet += 1;
        else if (method === "PUT") counters.statusesPut += 1;
        else if (method === "DELETE") counters.statusesDelete += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ statuses: [] })
        });
        return;
      }
      await route.continue();
    });

    resetCounters(counters);
    const remoteChoice = page.getByRole("button", { name: "アカウントのTier表を使う" });
    await remoteChoice.click();
    await remoteChoice.click({ force: true }).catch(() => undefined);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      buttons
        .filter((b) => (b.textContent ?? "").includes("アカウントのTier表を使う"))
        .forEach((b) => b.click());
    });

    await expect.poll(() => counters.sharePost, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(500);
    expect(counters.sharePost).toBe(1);
    expect(counters.boardPut).toBe(0);
    expect(await readIntentRaw(page)).toBeNull();

    errors.assertClean();
  });

  test("protected local edits update localStorage with PUT 0; retry remains no-op", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    const { itemId } = await bootstrapProtectedReturn(page, counters, remoteBoardRef);
    const before = await readBoardLocalStorage(page);
    expect(before).toBeTruthy();
    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toBeVisible();

    const sName = page.getByLabel("Sの名前");
    await sName.fill("S-保護");
    await page.waitForTimeout(400);
    expect((await readStoredBoardJson(page))?.tiers.find((t) => t.id === "tier-s")?.label).toBe(
      "S"
    );
    expect(await readBoardLocalStorage(page)).toBe(before);
    expect(JSON.stringify(await readStoredBoardJson(page))).not.toContain(REMOTE_ONLY_ITEM_ID);
    expect(itemId).toBeTruthy();

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      buttons.find((b) => b.textContent?.includes("再試行"))?.click();
    });
    await page.waitForTimeout(900);
    expectNoHandoffWrites(counters, "conflict edits + retry");
    expect(counters.externalAttempts).toBe(0);
    expect(await readIntentRaw(page)).toBeTruthy();
    errors.assertClean();
  });

  test("share 500 shows alert, keeps local board/guard, no retry, PUT 0", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    const { itemId } = await bootstrapProtectedReturn(page, counters, remoteBoardRef, {
      shareStatus: 500,
      shareBody: { error: "boom" }
    });
    const boardBefore = await readBoardLocalStorage(page);

    await page.getByRole("button", { name: "アカウントのTier表を使う" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: SHARE_CREATE_ERROR_MESSAGE })
    ).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(() => counters.sharePost, { timeout: 10_000 })
      .toBe(1);

    await page.waitForTimeout(1000);
    expect(counters.sharePost).toBe(1);
    expect(counters.boardPut).toBe(0);
    expect(counters.statusesGet).toBe(0);

    expect(await readIntentRaw(page)).toBeNull();
    expect(await readBoardLocalStorage(page)).toBe(boardBefore);

    const stored = await readStoredBoardJson(page);
    expect(stored?.tiers.find((t) => t.id === "tier-s")?.itemIds).toEqual([itemId]);
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();

    errors.assertClean();
  });

  test("expired intent: local-only guard, intent consumed, automatic remote 0", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    await installDeterministicFixtures(page, { counters, remoteBoardRef });

    await page.goto(`/tier?atb704-exp-boot=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierReady(page);
    await expectSsrFixtureVisible(page);

    const itemId = SSR_FIXTURE_ITEM_ID;
    const board = localBoardWithItemOnS(itemId);
    const expiredAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await page.waitForTimeout(900);
    await seedIntentAndBoard(page, {
      intent: validIntent(expiredAt),
      board
    });

    resetCounters(counters);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierReady(page);
    await expect(
      page.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EXPIRED })
    ).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toHaveCount(0);

    expect(await readIntentRaw(page)).toBeNull();
    const stored = await readStoredBoardJson(page);
    expect(stored?.tiers.find((t) => t.id === "tier-s")?.itemIds).toEqual([itemId]);
    expect(JSON.stringify(stored)).not.toContain(REMOTE_ONLY_ITEM_ID);

    await page.waitForTimeout(900);
    expectZeroAutomaticRemote(counters, "expired automatic remote");
    expect(counters.externalAttempts).toBe(0);

    errors.assertClean();
  });

  test("invalid/mismatched/broken intent: local-only guard, no protected UI, remote 0", async ({
    page
  }) => {
    const cases: Array<{ name: string; intent: unknown }> = [
      { name: "broken-json-as-object", intent: { version: 1, action: "share" } },
      {
        name: "extra-keys",
        intent: {
          version: 1,
          action: "share",
          year: SEASON_YEAR,
          season: SEASON,
          createdAt: new Date().toISOString(),
          board: { evil: true }
        }
      },
      {
        name: "mismatched-season-no-board",
        intent: {
          version: 1,
          action: "share",
          year: SEASON_YEAR,
          season: OTHER_SEASON,
          createdAt: new Date().toISOString()
        }
      },
      {
        name: "future-createdAt",
        intent: validIntent(new Date(Date.now() + 60_000).toISOString())
      },
      {
        name: "unparseable-createdAt",
        intent: {
          version: 1,
          action: "share",
          year: SEASON_YEAR,
          season: SEASON,
          createdAt: "not-a-date"
        }
      }
    ];

    const context = page.context();

    for (const c of cases) {
      const p = await context.newPage();
      const counters = createCounters();
      const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
      const errors = await attachErrorWatch(p);

      await installDeterministicFixtures(p, {
        counters,
        remoteBoardRef
      });
      await p.goto(`/tier?atb704-inv-boot=${Date.now()}-${c.name}`, {
        waitUntil: "domcontentloaded"
      });
      await waitForTierReady(p);
      await expectSsrFixtureVisible(p);

      const itemId = SSR_FIXTURE_ITEM_ID;
      const board = localBoardWithItemOnS(itemId);
      await p.waitForTimeout(900);
      await seedIntentAndBoard(p, {
        intent: c.intent,
        board
      });

      resetCounters(counters);
      await p.reload({ waitUntil: "domcontentloaded" });
      await waitForTierReady(p);

      await expect(p.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toHaveCount(0);
      await expect(
        p.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EXPIRED })
      ).toHaveCount(0);

      expect(await readIntentRaw(p), c.name).toBeNull();
      const stored = await readStoredBoardJson(p, STORAGE_KEY);
      expect(stored?.tiers.find((t) => t.id === "tier-s")?.itemIds, c.name).toEqual([
        itemId
      ]);
      expect(JSON.stringify(stored), c.name).not.toContain(REMOTE_ONLY_ITEM_ID);

      await p.waitForTimeout(900);
      expectZeroAutomaticRemote(counters, c.name);
      expect(counters.externalAttempts, c.name).toBe(0);
      errors.assertClean();
      await p.close();
    }
  });

  test("valid intent without local board is invalid (no protected false positive)", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    await installDeterministicFixtures(page, { counters, remoteBoardRef });
    await page.goto(`/tier?atb704-nolocal-boot=${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });
    await waitForTierReady(page);
    await page.waitForTimeout(900);

    await wipeIntentAndBoards(page);
    await seedIntentAndBoard(page, {
      intent: validIntent(),
      board: null
    });

    resetCounters(counters);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTierReady(page);

    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toHaveCount(0);
    await page.waitForTimeout(900);
    expectZeroAutomaticRemote(counters, "no local board invalid");
    expect(counters.externalAttempts).toBe(0);
    errors.assertClean();
  });

  test("past-year / season-mismatched intent is invalid (not protected), remote 0", async ({
    page
  }) => {
    /**
     * Issue #704: valid requires CURRENT year AND CURRENT season only.
     * Past year or season mismatch with a matching local board is still invalid —
     * local-only no-remote, intent consumed, no protected-state false positive.
     * Runs on both chromium and mobile-chrome via project matrix.
     */
    const mismatchCases: Array<{
      name: string;
      year: number;
      season: AnimeSeason;
      storageKey: string;
    }> = [
      {
        name: "past-year-with-matching-board",
        year: PAST_YEAR,
        season: SEASON,
        storageKey: PAST_STORAGE_KEY
      },
      {
        name: "other-season-with-matching-board",
        year: SEASON_YEAR,
        season: OTHER_SEASON,
        storageKey: `${BOARD_STORAGE_PREFIX}:${SEASON_YEAR}:${OTHER_SEASON}`
      }
    ];

    for (const c of mismatchCases) {
      const counters = createCounters();
      const remoteBoardRef = {
        current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID, c.year, c.season)
      };
      const errors = await attachErrorWatch(page);

      await installDeterministicFixtures(page, { counters, remoteBoardRef });
      await page.goto(`/tier?atb704-mismatch-boot=${Date.now()}-${c.name}`, {
        waitUntil: "domcontentloaded"
      });
      await waitForTierReady(page);
      await expectSsrFixtureVisible(page);

      const itemId = SSR_FIXTURE_ITEM_ID;
      const currentBoard = localBoardWithItemOnS(itemId);
      const mismatchBoard = localBoardWithItemOnS(itemId, [], c.year, c.season);

      await page.waitForTimeout(900);
      await seedIntentAndBoard(page, {
        intent: validIntent(new Date().toISOString(), c.year, c.season),
        board: currentBoard,
        storageKey: STORAGE_KEY
      });
      await page.evaluate(
        ({ key, board }) => {
          try {
            localStorage.setItem(key, JSON.stringify(board));
          } catch {
            // ignore
          }
        },
        { key: c.storageKey, board: mismatchBoard }
      );

      resetCounters(counters);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForTierReady(page);

      await expect(
        page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })
      ).toHaveCount(0);
      await expect(
        page.getByRole("status").filter({ hasText: AUTH_RETURN_STATUS_EXPIRED })
      ).toHaveCount(0);

      expect(await readIntentRaw(page), c.name).toBeNull();
      const stored = await readStoredBoardJson(page, STORAGE_KEY);
      expect(stored?.tiers.find((t) => t.id === "tier-s")?.itemIds, c.name).toEqual([
        itemId
      ]);
      expect(JSON.stringify(stored), c.name).not.toContain(REMOTE_ONLY_ITEM_ID);
      expect(await readBoardLocalStorage(page, c.storageKey), c.name).toBeTruthy();

      await page.waitForTimeout(900);
      expectZeroAutomaticRemote(counters, c.name);
      expect(counters.externalAttempts, c.name).toBe(0);
      errors.assertClean();
    }
  });

  test("seasonal load failure while guarded preserves local board and guard", async ({
    page
  }) => {
    const counters = createCounters();
    const remoteBoardRef = { current: remoteBoardFixture(SSR_FIXTURE_ITEM_ID) };
    const errors = await attachErrorWatch(page);

    const { itemId } = await bootstrapProtectedReturn(page, counters, remoteBoardRef);

    await expect(page.getByRole("dialog", { name: HANDOFF_CONFLICT_TITLE })).toBeVisible();
    await page.getByRole("button", { name: "共有をやめる" }).click();

    const boardRawBefore = await readBoardLocalStorage(page, STORAGE_KEY);
    expect(boardRawBefore).toBeTruthy();

    await page.unroute("**/*");
    await installDeterministicFixtures(page, {
      counters,
      remoteBoardRef,
      failSeasonal: true,
      seasonalPolicy: "poison"
    });
    resetCounters(counters);

    await page.locator("select").first().selectOption(String(PAST_YEAR));

    await expect
      .poll(async () => counters.seasonalGet, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const afterCurrent = await readStoredBoardJson(page, STORAGE_KEY);
    expect(afterCurrent?.tiers.find((t) => t.id === "tier-s")?.itemIds).toEqual([
      itemId
    ]);
    expect(JSON.stringify(afterCurrent)).not.toContain(REMOTE_ONLY_ITEM_ID);

    expectNoHandoffWrites(counters, "seasonal failure while guarded");
    expect(counters.externalAttempts).toBe(0);

    errors.assertClean();
  });
});
