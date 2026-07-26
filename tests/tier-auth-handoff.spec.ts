import { test, expect, type Page, type Route } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";
import type { AnimeSeason } from "../lib/types";

/**
 * ATB-582-P0-TIER-AUTH-HANDOFF — deterministic mocked E2E only.
 * No live Google OAuth, Turso board writes, or real share creation.
 */

const PENDING_SHARE_INTENT_KEY = "anime-tier-board:pending-share-intent:v1";
const STORAGE_PREFIX = "anime-tier-board:v1";

const current = getCurrentAnimeSeason();
const SEASON_YEAR = current.year;
const SEASON = current.season as AnimeSeason;
const STORAGE_KEY = `${STORAGE_PREFIX}:${SEASON_YEAR}:${SEASON}`;

const FIXTURE_ITEMS = [
  {
    id: "anilist-handoff-001",
    source: "anilist",
    title: "ハンドオフ試験アニメ甲",
    titles: {
      native: "ハンドオフ試験アニメ甲",
      userPreferred: "ハンドオフ試験アニメ甲",
      romaji: "Handoff Fixture A"
    },
    imageUrl: "https://e2e-sentinel.invalid/atb-582/a.jpg",
    proxiedImageUrl:
      "/api/image-proxy?url=" +
      encodeURIComponent("https://e2e-sentinel.invalid/atb-582/a.jpg"),
    siteUrl: "https://anilist.co/anime/handoff-001"
  },
  {
    id: "anilist-handoff-002",
    source: "anilist",
    title: "ハンドオフ試験アニメ乙",
    titles: {
      native: "ハンドオフ試験アニメ乙",
      userPreferred: "ハンドオフ試験アニメ乙",
      romaji: "Handoff Fixture B"
    },
    imageUrl: "https://e2e-sentinel.invalid/atb-582/b.jpg",
    proxiedImageUrl:
      "/api/image-proxy?url=" +
      encodeURIComponent("https://e2e-sentinel.invalid/atb-582/b.jpg"),
    siteUrl: "https://anilist.co/anime/handoff-002"
  }
] as const;

function makeBoard(overrides?: {
  sTierIds?: string[];
  updatedAt?: string;
  labelS?: string;
}) {
  const sIds = overrides?.sTierIds ?? ["anilist-handoff-001"];
  const unranked = FIXTURE_ITEMS.map((i) => i.id).filter((id) => !sIds.includes(id));
  return {
    version: 1 as const,
    season: SEASON,
    seasonYear: SEASON_YEAR,
    updatedAt: overrides?.updatedAt ?? "2026-07-01T00:00:00.000Z",
    tiers: [
      {
        id: "tier-s",
        label: overrides?.labelS ?? "S",
        color: "#f87171",
        itemIds: sIds
      },
      { id: "tier-a", label: "A", color: "#fbbf24", itemIds: [] as string[] },
      { id: "tier-b", label: "B", color: "#34d399", itemIds: [] as string[] },
      { id: "tier-c", label: "C", color: "#60a5fa", itemIds: [] as string[] },
      { id: "tier-d", label: "D", color: "#a78bfa", itemIds: [] as string[] },
      {
        id: "tier-unranked",
        label: "未分類",
        color: "#9ca3af",
        itemIds: unranked,
        locked: true
      }
    ]
  };
}

const LOCAL_BOARD = makeBoard({
  sTierIds: ["anilist-handoff-001"],
  updatedAt: "2026-07-10T10:00:00.000Z",
  labelS: "S-local"
});

const REMOTE_BOARD = makeBoard({
  sTierIds: ["anilist-handoff-002"],
  updatedAt: "2026-07-11T12:00:00.000Z",
  labelS: "S-remote"
});

const SAME_BOARD = makeBoard({
  sTierIds: ["anilist-handoff-001"],
  updatedAt: "2026-07-12T08:00:00.000Z",
  labelS: "S-same"
});

type ApiCounters = {
  boardGet: number;
  boardPut: number;
  sharePost: number;
  lastPutBody: unknown;
};

function emptyCounters(): ApiCounters {
  return { boardGet: 0, boardPut: 0, sharePost: 0, lastPutBody: null };
}

async function installBaseFixtures(
  page: Page,
  options: {
    remoteBoard: unknown | null | "fail";
    putMode?: "ok" | "conflict" | "fail";
    shareMode?: "ok" | "fail";
    counters: ApiCounters;
  }
) {
  const putMode = options.putMode ?? "ok";
  const shareMode = options.shareMode ?? "ok";

  await page.route("**/api/anime/seasonal**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: FIXTURE_ITEMS, warning: null })
    });
  });

  await page.route("**/api/statuses**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statuses: [] })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route("**/api/boards**", async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      options.counters.boardGet += 1;
      if (options.remoteBoard === "fail") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "server error" })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ board: options.remoteBoard })
      });
      return;
    }

    if (method === "PUT") {
      options.counters.boardPut += 1;
      try {
        options.counters.lastPutBody = route.request().postDataJSON();
      } catch {
        options.counters.lastPutBody = null;
      }
      if (putMode === "conflict") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "別の端末で更新されたため、保存できませんでした。"
          })
        });
        return;
      }
      if (putMode === "fail") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "server error" })
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

    await route.fulfill({ status: 405, body: "method not allowed" });
  });

  await page.route("**/api/shares", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    options.counters.sharePost += 1;
    if (shareMode === "fail") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "シェアの作成に失敗しました。" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shareId: "e2e-share-handoff-001" })
    });
  });

  // Block accidental live Google OAuth / external share noise
  await page.route("**/accounts.google.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/auth/signin/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>mocked-signin</body></html>"
    });
  });
}

async function seedGuestBoard(page: Page, board: ReturnType<typeof makeBoard>) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    [STORAGE_KEY, JSON.stringify(board)] as const
  );
}

async function seedPendingIntent(
  page: Page,
  intent: {
    action: string;
    seasonYear: number;
    season: string;
    storageKey: string;
    boardUpdatedAt: string;
    createdAt: string;
  } | string
) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    [
      PENDING_SHARE_INTENT_KEY,
      typeof intent === "string" ? intent : JSON.stringify(intent)
    ] as const
  );
}

function validIntent(createdAt = new Date().toISOString()) {
  return {
    action: "share" as const,
    seasonYear: SEASON_YEAR,
    season: SEASON,
    storageKey: STORAGE_KEY,
    boardUpdatedAt: LOCAL_BOARD.updatedAt,
    createdAt
  };
}

async function gotoTier(page: Page) {
  await page.goto("/tier", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 20_000
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
      consoleErrors.push(msg.text());
    }
  });
  return {
    pageErrors,
    consoleErrors,
    assertClean() {
      expect(pageErrors, `pageerror: ${pageErrors.join(" | ")}`).toEqual([]);
      expect(consoleErrors, `console.error: ${consoleErrors.join(" | ")}`).toEqual([]);
    }
  };
}

// ---------------------------------------------------------------------------
// Guest flows (no auth storage)
// ---------------------------------------------------------------------------

test.describe("tier auth handoff — guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("guest board survives reload; login prompt close keeps state/URL/intent", async ({
    page
  }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: null, counters });
    await seedGuestBoard(page, LOCAL_BOARD);

    await gotoTier(page);

    await expect(page.getByText("S-local", { exact: true })).toBeVisible();

    const beforeUrl = page.url();
    const boardBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

    await page.getByRole("button", { name: "共有" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("ログインが必要です")).toBeVisible();
    await expect(
      dialog.getByText(
        "Tier表を共有するにはログインしてください。作成したTier表はそのまま引き継がれます。"
      )
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "閉じる" })).toBeVisible();

    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    expect(page.url()).toBe(beforeUrl);
    const boardAfter = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(boardAfter).toBe(boardBefore);
    const intent = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PENDING_SHARE_INTENT_KEY
    );
    expect(intent).toBeNull();
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();
    await expect(page.getByText("S-local", { exact: true })).toBeVisible();

    errors.assertClean();
  });

  test("Google login writes metadata-only pending intent", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: null, counters });
    await seedGuestBoard(page, LOCAL_BOARD);
    await gotoTier(page);

    await page.getByRole("button", { name: "共有" }).click();
    await page.getByRole("button", { name: "Googleでログイン" }).click();

    const intentRaw = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PENDING_SHARE_INTENT_KEY
    );
    expect(intentRaw).toBeTruthy();
    const intent = JSON.parse(intentRaw!) as Record<string, unknown>;
    expect(intent.action).toBe("share");
    expect(intent.seasonYear).toBe(SEASON_YEAR);
    expect(intent.season).toBe(SEASON);
    expect(intent.storageKey).toBe(STORAGE_KEY);
    expect(typeof intent.boardUpdatedAt).toBe("string");
    expect(typeof intent.createdAt).toBe("string");
    // metadata only — no board body / tokens
    expect(intent).not.toHaveProperty("board");
    expect(intent).not.toHaveProperty("tiers");
    expect(intent).not.toHaveProperty("token");
    expect(intent).not.toHaveProperty("user");
    expect(intent).not.toHaveProperty("url");
    expect(counters.sharePost).toBe(0);
    errors.assertClean();
  });
});

// ---------------------------------------------------------------------------
// Authenticated auth-return (JWT storageState + intent seed; APIs mocked)
// ---------------------------------------------------------------------------

test.describe("tier auth handoff — auth return", () => {
  test("no remote: PUT local then one share POST; reload does not duplicate", async ({
    page
  }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: null, counters });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());

    await gotoTier(page);

    await expect
      .poll(() => counters.boardPut, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => counters.sharePost, { timeout: 15_000 })
      .toBe(1);

    const putBody = counters.lastPutBody as { board?: { tiers?: { label: string }[] } };
    expect(putBody?.board?.tiers?.some((t) => t.label === "S-local")).toBe(true);

    await expect(
      page.locator('a[href*="/share/e2e-share-handoff-001"]')
    ).toBeVisible({ timeout: 10_000 });

    const intentAfter = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      PENDING_SHARE_INTENT_KEY
    );
    expect(intentAfter).toBeNull();

    const putBeforeReload = counters.boardPut;
    const shareBeforeReload = counters.sharePost;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();
    await page.waitForTimeout(800);
    expect(counters.sharePost).toBe(shareBeforeReload);
    // auto-save may PUT again after idle; share must not duplicate
    expect(counters.sharePost - shareBeforeReload).toBe(0);
    void putBeforeReload;

    errors.assertClean();
  });

  test("same board: no conflict modal, one share, no required PUT before share", async ({
    page
  }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: SAME_BOARD, counters });
    await seedGuestBoard(page, SAME_BOARD);
    await seedPendingIntent(page, {
      ...validIntent(),
      boardUpdatedAt: SAME_BOARD.updatedAt
    });

    await gotoTier(page);

    await expect
      .poll(() => counters.sharePost, { timeout: 15_000 })
      .toBe(1);
    await expect(page.getByRole("dialog", { name: "保存済みのTier表があります" })).toHaveCount(
      0
    );
    // Same content: share may run without PUT (auto-save later is OK)
    expect(counters.sharePost).toBe(1);
    errors.assertClean();
  });

  test("conflict: no PUT/POST until choice; remote adopt skips PUT; local two-step uses expectedUpdatedAt", async ({
    page
  }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: REMOTE_BOARD, counters });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());

    await gotoTier(page);

    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    // Focus + Escape
    await expect(dialog.getByRole("button", { name: "この端末のTier表を使う" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    // Re-seed and re-enter for remote adopt
    await page.evaluate(
      ([intentKey, intent, boardKey, board]) => {
        sessionStorage.setItem(intentKey, intent);
        localStorage.setItem(boardKey, board);
      },
      [
        PENDING_SHARE_INTENT_KEY,
        JSON.stringify(validIntent()),
        STORAGE_KEY,
        JSON.stringify(LOCAL_BOARD)
      ] as const
    );
    counters.boardPut = 0;
    counters.sharePost = 0;
    counters.boardGet = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const putBeforeRemote = counters.boardPut;
    await dialog.getByRole("button", { name: "アカウントのTier表を使う" }).click();
    await expect
      .poll(() => counters.sharePost, { timeout: 15_000 })
      .toBe(1);
    expect(counters.boardPut).toBe(putBeforeRemote);

    // Local two-step replace
    await page.evaluate(
      ([intentKey, intent, boardKey, board]) => {
        sessionStorage.setItem(intentKey, intent);
        localStorage.setItem(boardKey, board);
      },
      [
        PENDING_SHARE_INTENT_KEY,
        JSON.stringify(validIntent()),
        STORAGE_KEY,
        JSON.stringify(LOCAL_BOARD)
      ] as const
    );
    counters.boardPut = 0;
    counters.sharePost = 0;
    counters.lastPutBody = null;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await expect(
      dialog.getByText("アカウントに保存済みのTier表を置き換えます。よろしいですか？")
    ).toBeVisible();
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    await dialog.getByRole("button", { name: "置き換えて共有" }).click();
    await expect
      .poll(() => counters.boardPut, { timeout: 15_000 })
      .toBe(1);
    await expect
      .poll(() => counters.sharePost, { timeout: 15_000 })
      .toBe(1);

    const body = counters.lastPutBody as {
      expectedUpdatedAt?: string;
      board?: { tiers?: { label: string }[] };
    };
    expect(body.expectedUpdatedAt).toBe(REMOTE_BOARD.updatedAt);
    expect(body.board?.tiers?.some((t) => t.label === "S-local")).toBe(true);

    errors.assertClean();
  });

  test("GET 500: local kept, no share, Japanese recovery", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: "fail", counters });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());

    await gotoTier(page);

    const alert = page.getByRole("alert");
    await expect(
      alert.getByText(
        "Tier表を引き継げませんでした。通信環境を確認して再度お試しください。"
      )
    ).toBeVisible({ timeout: 15_000 });
    await expect(alert.getByRole("button", { name: "再試行" })).toBeVisible();
    await expect(alert.getByRole("button", { name: "共有をやめる" })).toBeVisible();
    expect(counters.sharePost).toBe(0);
    expect(counters.boardPut).toBe(0);

    const local = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(local).toContain("S-local");

    await alert.getByRole("button", { name: "共有をやめる" }).click();
    await expect(
      page.getByText(
        "Tier表を引き継げませんでした。通信環境を確認して再度お試しください。"
      )
    ).toHaveCount(0);
    expect(counters.sharePost).toBe(0);

    errors.assertClean();
  });

  test("PUT 409 on local replace: re-conflict, no share, local intact", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, {
      remoteBoard: REMOTE_BOARD,
      putMode: "conflict",
      counters
    });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());

    await gotoTier(page);
    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "この端末のTier表を使う" }).click();
    await dialog.getByRole("button", { name: "置き換えて共有" }).click();

    await expect(dialog).toBeVisible({ timeout: 15_000 });
    expect(counters.sharePost).toBe(0);
    const local = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(local).toContain("S-local");

    errors.assertClean();
  });

  test("PUT 500 on no-remote handoff: no share, Japanese recovery", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, {
      remoteBoard: null,
      putMode: "fail",
      counters
    });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());

    await gotoTier(page);

    await expect(
      page.getByRole("alert").getByText(
        "Tier表を引き継げませんでした。通信環境を確認して再度お試しください。"
      )
    ).toBeVisible({ timeout: 15_000 });
    expect(counters.sharePost).toBe(0);
    const local = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(local).toContain("S-local");

    errors.assertClean();
  });

  test("invalid / expired / season-mismatch intent: no auto PUT/POST", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: null, counters });
    await seedGuestBoard(page, LOCAL_BOARD);

    // broken JSON
    await seedPendingIntent(page, "{not-json");
    await gotoTier(page);
    await page.waitForTimeout(600);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    // expired
    counters.boardPut = 0;
    counters.sharePost = 0;
    await page.evaluate(
      ([key, intent]) => {
        sessionStorage.setItem(key, intent);
      },
      [
        PENDING_SHARE_INTENT_KEY,
        JSON.stringify(
          validIntent(new Date(Date.now() - 11 * 60 * 1000).toISOString())
        )
      ] as const
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("共有の再開期限が切れました。もう一度「共有」を押してください。")
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    // season mismatch
    counters.boardPut = 0;
    counters.sharePost = 0;
    await page.evaluate(
      ([key, intent]) => {
        sessionStorage.setItem(key, intent);
      },
      [
        PENDING_SHARE_INTENT_KEY,
        JSON.stringify({
          ...validIntent(),
          seasonYear: SEASON_YEAR - 1,
          storageKey: `${STORAGE_PREFIX}:${SEASON_YEAR - 1}:${SEASON}`
        })
      ] as const
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    // unknown action
    counters.boardPut = 0;
    counters.sharePost = 0;
    await page.evaluate(
      ([key, intent]) => {
        sessionStorage.setItem(key, intent);
      },
      [
        PENDING_SHARE_INTENT_KEY,
        JSON.stringify({ ...validIntent(), action: "export" })
      ] as const
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    expect(counters.boardPut).toBe(0);
    expect(counters.sharePost).toBe(0);

    errors.assertClean();
  });

  test("auth return loading lock disables share", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);

    // Slow GET to observe loading lock
    await page.route("**/api/anime/seasonal**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: FIXTURE_ITEMS, warning: null })
      });
    });
    await page.route("**/api/statuses**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statuses: [] })
      });
    });
    await page.route("**/api/boards**", async (route: Route) => {
      if (route.request().method() === "GET") {
        counters.boardGet += 1;
        await new Promise((r) => setTimeout(r, 1500));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ board: null })
        });
        return;
      }
      if (route.request().method() === "PUT") {
        counters.boardPut += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
        return;
      }
      await route.fulfill({ status: 405, body: "no" });
    });
    await page.route("**/api/shares", async (route: Route) => {
      if (route.request().method() === "POST") {
        counters.sharePost += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ shareId: "e2e-share-handoff-001" })
        });
        return;
      }
      await route.continue();
    });

    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());
    await gotoTier(page);

    await expect(page.getByText("Tier表を引き継いでいます…")).toBeVisible({
      timeout: 5_000
    });
    await expect(page.getByRole("button", { name: "共有" })).toBeDisabled();

    await expect
      .poll(() => counters.sharePost, { timeout: 20_000 })
      .toBe(1);

    errors.assertClean();
  });

  test("conflict dialog Tab cycles within modal", async ({ page }) => {
    const counters = emptyCounters();
    const errors = await attachErrorWatch(page);
    await installBaseFixtures(page, { remoteBoard: REMOTE_BOARD, counters });
    await seedGuestBoard(page, LOCAL_BOARD);
    await seedPendingIntent(page, validIntent());
    await gotoTier(page);

    const dialog = page.getByRole("dialog", { name: "保存済みのTier表があります" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const first = dialog.getByRole("button", { name: "この端末のTier表を使う" });
    const last = dialog.getByRole("button", { name: "共有をやめる" });
    await expect(first).toBeFocused();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(last).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();

    errors.assertClean();
  });
});
