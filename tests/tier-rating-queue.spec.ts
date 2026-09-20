import { expect, test, type Page, type Route } from "@playwright/test";
import { getCurrentAnimeSeason } from "../lib/season";
import type { AnimeSeason } from "../lib/types";
import { SEASON_LABELS } from "../lib/types";

test.use({ serviceWorkers: "block" });
test.describe.configure({ timeout: 90_000, retries: 0 });

const current = getCurrentAnimeSeason();
const TEST_YEAR = current.year - 1;
const TEST_SEASON = current.season as AnimeSeason;
const SEASON_LABEL = SEASON_LABELS[TEST_SEASON];

const ID_A = "anilist-rq-completed-a";
const ID_B = "anilist-rq-completed-b";
const ID_WATCHING = "anilist-rq-watching";
const ID_RANKED = "anilist-rq-ranked";
const ID_OTHER_YEAR = "anilist-rq-other-year";
const ID_MISSING_META = "anilist-rq-missing-meta";
const ID_UNKNOWN_SEASON = "anilist-rq-unknown-season";
const ID_WRONG_SEASON = "anilist-rq-wrong-season";
const ID_STRING_YEAR = "anilist-rq-string-year";
const ID_OFF_BOARD = "anilist-rq-off-board";

const TITLE_A = "評価待ち完了A";
const TITLE_B = "評価待ち完了B";
const TITLE_WATCHING = "評価待ち視聴中";
const TITLE_RANKED = "評価待ち配置済";
const TITLE_OTHER_YEAR = "評価待ち別年";
const TITLE_MISSING_META = "評価待ちメタなし";
const TITLE_UNKNOWN_SEASON = "評価待ち不明期";
const TITLE_WRONG_SEASON = "評価待ち別期";
const TITLE_STRING_YEAR = "評価待ち文字列年";

const WRONG_SEASON: AnimeSeason = TEST_SEASON === "WINTER" ? "SPRING" : "WINTER";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const DISPLAY_MODE_KEY = "numanie-display-mode";

type StatusFixture = {
  animeId: string;
  status: string;
  anime: ReturnType<typeof makeItem>;
};

function sentinelUrl(id: string) {
  return `https://e2e-sentinel.invalid/atb-743/${id}.jpg`;
}

function makeItem(
  id: string,
  title: string,
  season?: AnimeSeason | string | null,
  seasonYear?: number | null
) {
  const imageUrl = sentinelUrl(id);
  return {
    id,
    source: "anilist" as const,
    title,
    titles: { native: title, userPreferred: title, romaji: `${title} Romaji` },
    imageUrl,
    proxiedImageUrl: `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`,
    siteUrl: `https://anilist.co/anime/${id}`,
    season: season ?? null,
    seasonYear: seasonYear ?? null
  };
}

const ITEM_A = makeItem(ID_A, TITLE_A, TEST_SEASON, TEST_YEAR);
const ITEM_B = makeItem(ID_B, TITLE_B, TEST_SEASON, TEST_YEAR);
const ITEM_WATCHING = makeItem(ID_WATCHING, TITLE_WATCHING, TEST_SEASON, TEST_YEAR);
const ITEM_RANKED = makeItem(ID_RANKED, TITLE_RANKED, TEST_SEASON, TEST_YEAR);
const ITEM_OTHER_YEAR = makeItem(
  ID_OTHER_YEAR,
  TITLE_OTHER_YEAR,
  TEST_SEASON,
  TEST_YEAR - 1
);
const ITEM_MISSING_META = makeItem(ID_MISSING_META, TITLE_MISSING_META, null, null);
const ITEM_UNKNOWN_SEASON = makeItem(
  ID_UNKNOWN_SEASON,
  TITLE_UNKNOWN_SEASON,
  "AUTUMN",
  TEST_YEAR
);
const ITEM_WRONG_SEASON = makeItem(
  ID_WRONG_SEASON,
  TITLE_WRONG_SEASON,
  WRONG_SEASON,
  TEST_YEAR
);
/** Runtime-only non-numeric year. Production types stay number|null. */
const ITEM_STRING_YEAR = {
  ...makeItem(ID_STRING_YEAR, TITLE_STRING_YEAR, TEST_SEASON, TEST_YEAR),
  seasonYear: String(TEST_YEAR) as unknown as number
};
const ITEM_OFF_BOARD = makeItem(ID_OFF_BOARD, "評価待ち対象外", TEST_SEASON, TEST_YEAR);

const SEASONAL_ITEMS = [
  ITEM_A,
  ITEM_B,
  ITEM_WATCHING,
  ITEM_RANKED,
  ITEM_OTHER_YEAR,
  ITEM_MISSING_META,
  ITEM_UNKNOWN_SEASON,
  ITEM_WRONG_SEASON,
  ITEM_STRING_YEAR
];

function defaultStatuses(): StatusFixture[] {
  return [
    { animeId: ID_A, status: "completed", anime: ITEM_A },
    { animeId: ID_B, status: "completed", anime: ITEM_B },
    { animeId: ID_WATCHING, status: "watching", anime: ITEM_WATCHING },
    { animeId: ID_RANKED, status: "completed", anime: ITEM_RANKED },
    { animeId: ID_OTHER_YEAR, status: "completed", anime: ITEM_OTHER_YEAR },
    { animeId: ID_MISSING_META, status: "completed", anime: ITEM_MISSING_META },
    { animeId: ID_UNKNOWN_SEASON, status: "completed", anime: ITEM_UNKNOWN_SEASON },
    { animeId: ID_WRONG_SEASON, status: "completed", anime: ITEM_WRONG_SEASON },
    { animeId: ID_STRING_YEAR, status: "completed", anime: ITEM_STRING_YEAR },
    { animeId: ID_OFF_BOARD, status: "completed", anime: ITEM_OFF_BOARD }
  ];
}

function emptyTiers(sItemIds: string[], unrankedIds: string[]) {
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

function testBoard() {
  return {
    version: 1,
    season: TEST_SEASON,
    seasonYear: TEST_YEAR,
    tiers: emptyTiers(
      [ID_RANKED],
      [
        ID_WATCHING,
        ID_A,
        ID_B,
        ID_OTHER_YEAR,
        ID_MISSING_META,
        ID_UNKNOWN_SEASON,
        ID_WRONG_SEASON,
        ID_STRING_YEAR
      ]
    ),
    updatedAt: "2026-09-20T00:00:00.000Z"
  };
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data)
  };
}

async function fulfillQuietImages(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "image/png",
    body: TINY_PNG
  });
}

async function installBaseRoutes(
  page: Page,
  options?: {
    statuses?: StatusFixture[] | "error" | "delay";
  }
) {
  const statuses = options?.statuses ?? defaultStatuses();

  await page.route("**/api/image-proxy**", fulfillQuietImages);
  await page.route("**/*e2e-sentinel.invalid*/**", fulfillQuietImages);

  await page.route("**/api/anime/seasonal**", async (route) => {
    const url = new URL(route.request().url());
    const year = Number(url.searchParams.get("year"));
    const season = url.searchParams.get("season");
    if (year === TEST_YEAR && season === TEST_SEASON) {
      await route.fulfill(
        json({
          year,
          season,
          items: SEASONAL_ITEMS,
          source: "anilist",
          cached: false
        })
      );
      return;
    }
    await route.fulfill(
      json({
        year: year || current.year,
        season: season || current.season,
        items: [],
        source: "anilist",
        cached: false
      })
    );
  });

  await page.route("**/api/boards**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      const url = new URL(route.request().url());
      const year = Number(url.searchParams.get("year"));
      const season = url.searchParams.get("season");
      if (year === TEST_YEAR && season === TEST_SEASON) {
        await route.fulfill(json({ board: testBoard() }));
        return;
      }
      await route.fulfill(json({ board: null }));
      return;
    }
    if (method === "PUT") {
      await route.fulfill(json({ ok: true }));
      return;
    }
    await route.fulfill(json({}));
  });

  await page.route("**/api/statuses**", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill(json({ ok: true }));
      return;
    }
    if (statuses === "delay") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill(json({ statuses: [] }));
      return;
    }
    if (statuses === "error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "視聴ステータスの取得に失敗しました。" })
      });
      return;
    }
    await route.fulfill(json({ statuses }));
  });
}

async function gotoTier(page: Page) {
  await page.goto("/tier", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible({
    timeout: 30_000
  });
}

async function selectTestYear(page: Page) {
  const seasonal = page.waitForResponse((response) => {
    const url = response.url();
    return (
      url.includes("/api/anime/seasonal") &&
      url.includes(`year=${TEST_YEAR}`) &&
      url.includes(`season=${TEST_SEASON}`)
    );
  });
  const yearSelect = page
    .locator(".control-bar-season label.field")
    .filter({ hasText: "年" })
    .locator("select");
  await yearSelect.selectOption(String(TEST_YEAR));
  await seasonal;
  await expect(
    page.getByText(`${TEST_YEAR}年 ${SEASON_LABEL}アニメ`, { exact: true })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".tier-list").getByText(TITLE_RANKED, { exact: true })).toBeVisible(
    { timeout: 30_000 }
  );
}

async function openTestQueue(page: Page) {
  await gotoTier(page);
  await selectTestYear(page);
  const queue = page.locator(".rating-queue");
  await expect(queue).toBeVisible({ timeout: 30_000 });
  return queue;
}

function queue(page: Page) {
  return page.locator(".rating-queue");
}

test.describe("ATB-743 評価待ちキュー", () => {
  test("candidate filtering: completed / current season / unranked only", async ({
    page
  }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await expect(panel.getByRole("heading", { name: "評価待ち" })).toBeVisible();
    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(panel.getByText(TITLE_B, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(TITLE_WATCHING)).toHaveCount(0);
    await expect(panel.getByText(TITLE_RANKED)).toHaveCount(0);
    await expect(panel.getByText(TITLE_OTHER_YEAR)).toHaveCount(0);
    await expect(panel.getByText(TITLE_MISSING_META)).toHaveCount(0);
    await expect(panel.getByText(TITLE_UNKNOWN_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_WRONG_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_STRING_YEAR)).toHaveCount(0);

    const currentDest = panel.getByRole("button", { name: "未分類（現在）" });
    await expect(currentDest).toBeDisabled();
    await expect(currentDest.getByText("現在")).toBeVisible();
    await expect(panel.getByRole("button", { name: "S", exact: true })).toBeEnabled();
  });

  test("fail-closed: missing, unknown, and wrong season/year never enter the queue", async ({
    page
  }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(panel.getByText(TITLE_MISSING_META)).toHaveCount(0);
    await expect(panel.getByText(TITLE_UNKNOWN_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_WRONG_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_OTHER_YEAR)).toHaveCount(0);
    await expect(panel.getByText(TITLE_STRING_YEAR)).toHaveCount(0);

    await panel.getByRole("button", { name: "あとで" }).click();
    await expect(panel.getByText(TITLE_B, { exact: true })).toBeVisible();
    await expect(panel.getByText("残り 1 件")).toBeVisible();
    await expect(panel.getByText(TITLE_MISSING_META)).toHaveCount(0);
    await expect(panel.getByText(TITLE_UNKNOWN_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_WRONG_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_STRING_YEAR)).toHaveCount(0);

    await panel.getByRole("button", { name: "あとで" }).click();
    await expect(panel.getByText("評価待ちはありません")).toBeVisible();
    await expect(panel.getByText("残り 0 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(TITLE_B, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(TITLE_MISSING_META)).toHaveCount(0);
    await expect(panel.getByText(TITLE_UNKNOWN_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_WRONG_SEASON)).toHaveCount(0);
    await expect(panel.getByText(TITLE_STRING_YEAR)).toHaveCount(0);
  });

  test("status loading stays separate and does not block board editing", async ({
    page
  }) => {
    await installBaseRoutes(page, { statuses: "delay" });
    await gotoTier(page);

    const panel = queue(page);
    await expect(panel.getByText("評価待ちを読み込み中")).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();
    await expect(page.locator(".control-bar")).toBeVisible();
    const reload = page.getByRole("button", { name: "再取得" });
    await expect(reload).toBeEnabled();
    await reload.click();
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();
    await expect(panel.getByText("評価待ちはありません")).toBeVisible({
      timeout: 15_000
    });
  });

  test("status error stays on the queue and leaves board editing available", async ({
    page
  }) => {
    await installBaseRoutes(page, { statuses: "error" });
    await gotoTier(page);

    const panel = queue(page);
    await expect(panel.getByText("評価待ちを取得できませんでした。")).toBeVisible({
      timeout: 30_000
    });
    await expect(panel.getByText("Tier表の編集は続けられます。")).toBeVisible();
    await expect(page.locator(".notice.error")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "今期アニメTier表" })).toBeVisible();

    const more = page.getByRole("button", { name: "その他" });
    await more.click();
    await expect(page.getByRole("button", { name: "リセット" })).toBeVisible();
    await page.keyboard.press("Escape");

    const pool = page.locator(".pool-drawer-trigger");
    if (await pool.count()) {
      await pool.click();
      await expect(pool).toHaveAttribute("aria-expanded", "true");
    }
  });

  test("empty state is separate from loading and error", async ({ page }) => {
    await installBaseRoutes(page, { statuses: [] });
    const panel = await openTestQueue(page);
    await expect(panel.getByText("評価待ちはありません")).toBeVisible();
    await expect(panel.getByText("評価待ちを読み込み中")).toHaveCount(0);
    await expect(panel.getByText("評価待ちを取得できませんでした。")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "あとで" })).toHaveCount(0);
  });

  test("あとで skips the item for this session without repeating it", async ({
    page
  }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await expect(panel.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await panel.getByRole("button", { name: "あとで" }).click();

    await expect(panel.getByText(TITLE_B, { exact: true })).toBeVisible();
    await expect(panel.getByText("残り 1 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toHaveCount(0);

    await panel.getByRole("button", { name: "あとで" }).click();
    await expect(panel.getByText("評価待ちはありません")).toBeVisible();
    await expect(panel.getByText("残り 0 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(TITLE_B, { exact: true })).toHaveCount(0);
  });

  test("placement decreases remaining once and does not duplicate the card", async ({
    page
  }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await panel.getByRole("button", { name: "S", exact: true }).click();

    await expect(panel.getByText("残り 1 件")).toBeVisible();
    await expect(panel.getByText(TITLE_B, { exact: true })).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toHaveCount(0);

    const sRow = page.locator(".tier-list .tier-row").first();
    await expect(sRow.getByText(TITLE_A, { exact: true })).toHaveCount(1);
    await expect(page.locator(".tier-list").getByText(TITLE_A, { exact: true })).toHaveCount(
      1
    );

    const pool = page.locator(".pool-drawer-trigger");
    if (await pool.count()) {
      const expanded = await pool.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await pool.click();
      }
      await expect(
        page.locator("#pool-drawer-section").getByText(TITLE_A, { exact: true })
      ).toHaveCount(0);
    }
  });

  test("Undo restores the item to its exact prior unranked position", async ({
    page
  }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await panel.getByRole("button", { name: "S", exact: true }).click();
    await expect(panel.getByText(TITLE_B, { exact: true })).toBeVisible();
    await expect(page.locator(".tier-list .tier-row").first().getByText(TITLE_A)).toHaveCount(
      1
    );
    await expect(panel.getByRole("button", { name: "元に戻す" })).toBeVisible();

    await panel.getByRole("button", { name: "元に戻す" }).click();
    await expect(panel.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await expect(page.locator(".tier-list .tier-row").first().getByText(TITLE_A)).toHaveCount(
      0
    );

    const pool = page.locator(".pool-drawer-trigger");
    await pool.click();
    await expect(pool).toHaveAttribute("aria-expanded", "true");
    const titles = await page.locator("#pool-drawer-section .anime-title").allTextContents();
    expect(titles).toEqual([
      TITLE_WATCHING,
      TITLE_A,
      TITLE_B,
      TITLE_OTHER_YEAR,
      TITLE_MISSING_META,
      TITLE_UNKNOWN_SEASON,
      TITLE_WRONG_SEASON,
      TITLE_STRING_YEAR
    ]);
    expect(titles.filter((title) => title === TITLE_A)).toHaveLength(1);
  });

  test("keyboard path places the current candidate", async ({ page }) => {
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    const dest = panel.getByRole("button", { name: "A", exact: true });
    await dest.focus();
    await expect(dest).toBeFocused();
    await dest.press("Enter");

    await expect(panel.getByText("残り 1 件")).toBeVisible();
    await expect(panel.getByText(TITLE_B, { exact: true })).toBeVisible();
    const aRow = page.locator(".tier-list .tier-row").nth(1);
    await expect(aRow.getByText(TITLE_A, { exact: true })).toHaveCount(1);
  });

  test("Visual and Simple modes keep queue information and primary actions", async ({
    page
  }) => {
    await page.addInitScript(
      ([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // ignore
        }
      },
      [DISPLAY_MODE_KEY, "simple"] as const
    );
    await installBaseRoutes(page);
    const panel = await openTestQueue(page);

    await expect(panel).toHaveClass(/rating-queue--simple/);
    await expect(panel.getByRole("heading", { name: "評価待ち" })).toBeVisible();
    await expect(panel.getByText("残り 2 件")).toBeVisible();
    await expect(panel.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "あとで" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "S", exact: true })).toBeVisible();
    await expect(panel.locator(".rating-queue-poster")).toBeHidden();

    const later = panel.getByRole("button", { name: "あとで" });
    const box = await later.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
