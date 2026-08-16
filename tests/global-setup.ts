import { chromium } from "@playwright/test";
import { encode } from "@auth/core/jwt";
import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export const TEST_USER_ID = "playwright-test-user";
const COOKIE_NAME = "authjs.session-token";

/** Deterministic image sentinels for ATB-621 Simple HTTP-zero proof (no real CDN). */
export const E2E_SENTINEL_HOST = "e2e-sentinel.invalid";
export const E2E_SENTINEL_MARKER = "e2e-sentinel.invalid/atb-621";

function sentinelExternalUrl(id: string): string {
  return `https://${E2E_SENTINEL_HOST}/atb-621/${id}.jpg`;
}

function sentinelProxyUrl(id: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(sentinelExternalUrl(id))}`;
}

// テスト用アニメデータ（streamingProvidersJp 付き + 固定 sentinel 画像 URL）
const TEST_ANIME = [
  {
    animeId: "anilist-pw-001",
    status: "watching",
    anime: {
      id: "anilist-pw-001",
      source: "anilist",
      title: "テストアニメ U-NEXT",
      titles: { native: "テストアニメ U-NEXT", romaji: "Test Anime UNEXT" },
      // external form — identifiable without /api/image-proxy
      imageUrl: sentinelExternalUrl("pw-001"),
      proxiedImageUrl: sentinelProxyUrl("pw-001"),
      siteUrl: "https://anilist.co",
      episodes: 12,
      streamingProvidersJp: {
        flatrate: [{ id: 84, name: "U-NEXT", logoUrl: null }],
      },
    },
  },
  {
    animeId: "anilist-pw-002",
    status: "planned",
    anime: {
      id: "anilist-pw-002",
      source: "anilist",
      title: "テストアニメ Netflix",
      titles: { native: "テストアニメ Netflix", romaji: "Test Anime Netflix" },
      imageUrl: sentinelExternalUrl("pw-002"),
      // proxy form — E2E can assert zero /api/image-proxy for this fixture
      proxiedImageUrl: sentinelProxyUrl("pw-002"),
      siteUrl: "https://anilist.co",
      episodes: 24,
      streamingProvidersJp: {
        flatrate: [{ id: 8, name: "Netflix", logoUrl: null }],
      },
    },
  },
  {
    animeId: "anilist-pw-003",
    status: "watching",
    anime: {
      id: "anilist-pw-003",
      source: "anilist",
      title: "テストアニメ Amazon",
      titles: { native: "テストアニメ Amazon", romaji: "Test Anime Amazon" },
      imageUrl: sentinelExternalUrl("pw-003"),
      proxiedImageUrl: sentinelProxyUrl("pw-003"),
      siteUrl: "https://anilist.co",
      episodes: 1,
      format: "MOVIE",
      streamingProvidersJp: {
        flatrate: [{ id: 9, name: "Amazon Prime Video", logoUrl: null }],
      },
    },
  },
];

async function globalSetup() {
  const authSecret = process.env.AUTH_SECRET;
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!authSecret || !tursoUrl || !tursoToken) {
    throw new Error("Missing env vars: AUTH_SECRET, TURSO_DATABASE_URL, or TURSO_AUTH_TOKEN");
  }

  // --- 1. セッション Cookie を生成して storageState を作成 ---
  const sessionToken = await encode({
    token: {
      sub: TEST_USER_ID,
      name: "Playwright Test User",
      email: "playwright@test.local",
    },
    secret: authSecret,
    salt: COOKIE_NAME,
    maxAge: 60 * 60 * 24, // 1 day
  });

  const authDir = path.resolve(__dirname, ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await context.storageState({ path: path.join(authDir, "user.json") });
  await browser.close();

  // --- 2. Turso にテストデータを投入 ---
  const db = createClient({ url: tursoUrl, authToken: tursoToken });
  const now = new Date().toISOString();

  // テーブルが存在しない場合に備えて作成
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_anime_statuses (
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      status TEXT NOT NULL,
      anime_json TEXT NOT NULL,
      favorite_level INTEGER,
      watch_slot TEXT,
      notes TEXT,
      watch_rhythm TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, anime_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, service_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      onboarding_done INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  // アニメステータス投入 (U-NEXT は watch_rhythm: weekly でリズム表示をテスト)
  const entries = [
    { ...TEST_ANIME[0], watchRhythm: "weekly" as const },
    { ...TEST_ANIME[1], watchRhythm: null },
    { ...TEST_ANIME[2], watchRhythm: null },
  ];
  for (const entry of entries) {
    await db.execute({
      sql: `INSERT INTO user_anime_statuses (user_id, anime_id, status, anime_json, watch_rhythm, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, anime_id) DO UPDATE SET
              status = excluded.status,
              anime_json = excluded.anime_json,
              watch_rhythm = excluded.watch_rhythm,
              updated_at = excluded.updated_at`,
      args: [TEST_USER_ID, entry.animeId, entry.status, JSON.stringify(entry.anime), entry.watchRhythm, now],
    });
  }

  // サブスク投入 (unext + amazon_prime)
  for (const serviceId of ["unext", "amazon_prime"]) {
    await db.execute({
      sql: `INSERT INTO user_subscriptions (user_id, service_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, service_id) DO NOTHING`,
      args: [TEST_USER_ID, serviceId, now],
    });
  }

  // オンボーディング完了フラグ
  await db.execute({
    sql: `INSERT INTO user_preferences (user_id, onboarding_done, updated_at)
          VALUES (?, 1, ?)
          ON CONFLICT(user_id) DO UPDATE SET onboarding_done = 1, updated_at = excluded.updated_at`,
    args: [TEST_USER_ID, now],
  });
}

export default globalSetup;
