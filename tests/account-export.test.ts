import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  ACCOUNT_EXPORT_FILENAME,
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  exportUserAccountData,
  type AccountExportClient,
  type AccountExportPayload
} from "../lib/account-export.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

type MemoryHarness = {
  client: ReturnType<typeof createClient>;
  asExportClient: AccountExportClient;
  close: () => Promise<void>;
};

function createMemoryHarness(): MemoryHarness {
  const dir = mkdtempSync(path.join(os.tmpdir(), "atb-account-export-"));
  const dbPath = path.join(dir, "db.sqlite");
  const url = pathToFileURL(dbPath).href;
  const client = createClient({ url });
  return {
    client,
    asExportClient: client as unknown as AccountExportClient,
    close: async () => {
      try {
        client.close();
      } catch {
        // ignore
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may briefly lock the file; leave temp dir for OS cleanup.
      }
    }
  };
}

async function createAllKnownTables(client: AccountExportClient): Promise<void> {
  await client.execute(`create table user_anime_statuses (
    user_id text not null,
    anime_id text not null,
    status text not null,
    anime_json text not null,
    updated_at text not null,
    primary key (user_id, anime_id)
  )`);
  await client.execute(`create table tier_boards (
    user_id text not null,
    season_year integer not null,
    season text not null,
    board_json text not null,
    updated_at text not null,
    primary key (user_id, season_year, season)
  )`);
  await client.execute(`create table user_subscriptions (
    user_id text not null,
    service_id text not null,
    created_at text not null,
    primary key (user_id, service_id)
  )`);
  await client.execute(`create table user_preferences (
    user_id text primary key,
    onboarding_done integer not null default 0,
    updated_at text not null
  )`);
  await client.execute(`create table push_subscriptions (
    id text not null primary key,
    user_id text not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at text not null
  )`);
  await client.execute(`create table native_push_tokens (
    id text not null primary key,
    user_id text not null,
    expo_push_token text not null unique,
    platform text not null,
    created_at text not null
  )`);
  await client.execute(`create table native_sessions (
    session_id text primary key,
    user_id text not null,
    created_at text not null,
    expires_at text not null,
    revoked_at text
  )`);
  await client.execute(`create table evangelist_cards (
    id text primary key,
    user_id text not null,
    anime_id text not null,
    anime_title text not null,
    comment text not null,
    created_at text not null
  )`);
  await client.execute(`create table season_share (
    id text primary key,
    user_id text not null,
    season text not null,
    season_year integer not null,
    statuses text not null,
    comment text
  )`);
  await client.execute(`create table board_shares (
    share_id text primary key,
    user_id text,
    board_json text not null,
    items_json text not null,
    created_at text not null,
    updated_at text not null
  )`);
  await client.execute(`create table share_comments (
    comment_id text primary key,
    share_id text not null,
    user_id text not null,
    user_name text,
    user_image text,
    body text not null,
    created_at text not null,
    updated_at text not null
  )`);
  await client.execute(`create table share_reactions (
    share_id text not null,
    reaction_key text not null,
    user_id text,
    kind text not null,
    created_at text not null,
    primary key (share_id, reaction_key, kind)
  )`);
}

async function seedUserData(
  client: AccountExportClient,
  userId: string,
  suffix: string
): Promise<void> {
  const now = "2026-07-25T00:00:00.000Z";
  await client.execute({
    sql: `insert into user_anime_statuses (user_id, anime_id, status, anime_json, updated_at)
          values (?, ?, 'watching', '{"title":"A"}', ?)`,
    args: [userId, `anime-${suffix}`, now]
  });
  await client.execute({
    sql: `insert into tier_boards (user_id, season_year, season, board_json, updated_at)
          values (?, 2026, 'summer', '{"S":[]}', ?)`,
    args: [userId, now]
  });
  await client.execute({
    sql: `insert into user_subscriptions (user_id, service_id, created_at) values (?, 'netflix', ?)`,
    args: [userId, now]
  });
  await client.execute({
    sql: `insert into user_preferences (user_id, onboarding_done, updated_at) values (?, 1, ?)`,
    args: [userId, now]
  });
  await client.execute({
    sql: `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
          values (?, ?, ?, 'secret-p256dh', 'secret-auth', ?)`,
    args: [`push-${suffix}`, userId, `https://push.example/${suffix}`, now]
  });
  await client.execute({
    sql: `insert into native_push_tokens (id, user_id, expo_push_token, platform, created_at)
          values (?, ?, ?, 'ios', ?)`,
    args: [`npt-${suffix}`, userId, `ExponentPushToken[${suffix}]`, now]
  });
  await client.execute({
    sql: `insert into native_sessions (session_id, user_id, created_at, expires_at, revoked_at)
          values (?, ?, ?, ?, null)`,
    args: [`sess-${suffix}`, userId, now, now]
  });
  await client.execute({
    sql: `insert into evangelist_cards (id, user_id, anime_id, anime_title, comment, created_at)
          values (?, ?, ?, 'Title', 'comment', ?)`,
    args: [`ev-${suffix}`, userId, `anime-${suffix}`, now]
  });
  await client.execute({
    sql: `insert into season_share (id, user_id, season, season_year, statuses, comment)
          values (?, ?, 'summer', 2026, 'watching', null)`,
    args: [`ss-${suffix}`, userId]
  });
  await client.execute({
    sql: `insert into board_shares (share_id, user_id, board_json, items_json, created_at, updated_at)
          values (?, ?, '{}', '[]', ?, ?)`,
    args: [`share-${suffix}`, userId, now, now]
  });
  await client.execute({
    sql: `insert into share_comments
            (comment_id, share_id, user_id, user_name, user_image, body, created_at, updated_at)
          values (?, ?, ?, 'Name', null, 'hello', ?, ?)`,
    args: [`c-${suffix}`, `share-${suffix}`, userId, now, now]
  });
  await client.execute({
    sql: `insert into share_reactions (share_id, reaction_key, user_id, kind, created_at)
          values (?, ?, ?, 'like', ?)`,
    args: [`share-${suffix}`, userId, userId, now]
  });
}

function assertNoSecrets(payload: AccountExportPayload): void {
  const raw = JSON.stringify(payload);
  assert.doesNotMatch(raw, /secret-p256dh|secret-auth/);
  assert.doesNotMatch(raw, /ExponentPushToken/);
  assert.doesNotMatch(raw, /"p256dh"|"auth"/);
  assert.doesNotMatch(raw, /expo_push_token|expoPushToken/);
  assert.doesNotMatch(raw, /session_id|sessionId/);
  assert.doesNotMatch(raw, /jwt|cookie|Bearer /i);
}

test("exportUserAccountData returns fixed schemaVersion and empty collections for empty account", async () => {
  const harness = createMemoryHarness();
  try {
    await createAllKnownTables(harness.asExportClient);
    const payload = await exportUserAccountData("user-empty", harness.asExportClient);

    assert.equal(payload.schemaVersion, ACCOUNT_EXPORT_SCHEMA_VERSION);
    assert.equal(payload.userId, "user-empty");
    assert.ok(typeof payload.exportedAt === "string" && payload.exportedAt.length > 0);

    assert.deepEqual(payload.data.userAnimeStatuses, []);
    assert.deepEqual(payload.data.tierBoards, []);
    assert.deepEqual(payload.data.userSubscriptions, []);
    assert.deepEqual(payload.data.userPreferences, []);
    assert.deepEqual(payload.data.pushSubscriptions, []);
    assert.deepEqual(payload.data.nativePushTokens, []);
    assert.deepEqual(payload.data.nativeSessions, []);
    assert.deepEqual(payload.data.evangelistCards, []);
    assert.deepEqual(payload.data.seasonShares, []);
    assert.deepEqual(payload.data.boardShares, []);
    assert.deepEqual(payload.data.shareComments, []);
    assert.deepEqual(payload.data.shareReactions, []);
  } finally {
    await harness.close();
  }
});

test("exportUserAccountData exports only the requested user's rows and redacts secrets", async () => {
  const harness = createMemoryHarness();
  try {
    await createAllKnownTables(harness.asExportClient);
    await seedUserData(harness.asExportClient, "user-a", "a");
    await seedUserData(harness.asExportClient, "user-b", "b");

    const payload = await exportUserAccountData("user-a", harness.asExportClient);
    assertNoSecrets(payload);

    assert.equal(payload.userId, "user-a");
    assert.equal(payload.data.userAnimeStatuses.length, 1);
    assert.equal(payload.data.userAnimeStatuses[0]?.animeId, "anime-a");
    assert.equal(payload.data.tierBoards.length, 1);
    assert.equal(payload.data.userSubscriptions[0]?.serviceId, "netflix");
    assert.equal(payload.data.userPreferences.length, 1);
    assert.equal(payload.data.pushSubscriptions.length, 1);
    assert.equal(payload.data.pushSubscriptions[0]?.id, "push-a");
    assert.equal(payload.data.pushSubscriptions[0]?.endpoint, "https://push.example/a");
    assert.equal(payload.data.nativePushTokens.length, 1);
    assert.equal(payload.data.nativePushTokens[0]?.id, "npt-a");
    assert.equal(payload.data.nativePushTokens[0]?.platform, "ios");
    assert.equal(payload.data.nativeSessions.length, 1);
    assert.ok(!("sessionId" in (payload.data.nativeSessions[0] ?? {})));
    assert.equal(payload.data.evangelistCards.length, 1);
    assert.equal(payload.data.seasonShares.length, 1);
    assert.equal(payload.data.boardShares.length, 1);
    assert.equal(payload.data.shareComments.length, 1);
    assert.equal(payload.data.shareReactions.length, 1);

    // Other user must not appear
    const raw = JSON.stringify(payload);
    assert.doesNotMatch(raw, /user-b|anime-b|push-b|npt-b|sess-b|share-b/);
  } finally {
    await harness.close();
  }
});

test("absent lazily-created tables are skipped as empty collections without throwing", async () => {
  const harness = createMemoryHarness();
  try {
    await harness.asExportClient.execute(`create table user_anime_statuses (
      user_id text not null,
      anime_id text not null,
      status text not null,
      anime_json text not null,
      updated_at text not null,
      primary key (user_id, anime_id)
    )`);
    await harness.asExportClient.execute({
      sql: `insert into user_anime_statuses (user_id, anime_id, status, anime_json, updated_at)
            values ('user-a', 'a1', 'watching', '{}', '2026-07-25T00:00:00.000Z')`,
      args: []
    });

    const payload = await exportUserAccountData("user-a", harness.asExportClient);
    assert.equal(payload.data.userAnimeStatuses.length, 1);
    assert.deepEqual(payload.data.tierBoards, []);
    assert.deepEqual(payload.data.pushSubscriptions, []);
    assert.deepEqual(payload.data.nativeSessions, []);
  } finally {
    await harness.close();
  }

  const emptyHarness = createMemoryHarness();
  try {
    const payload = await exportUserAccountData("user-a", emptyHarness.asExportClient);
    assert.equal(payload.schemaVersion, ACCOUNT_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(payload.data.userAnimeStatuses, []);
  } finally {
    await emptyHarness.close();
  }
});

test("exportUserAccountData rejects empty userId", async () => {
  const harness = createMemoryHarness();
  try {
    await assert.rejects(() => exportUserAccountData("", harness.asExportClient), /userId/);
  } finally {
    await harness.close();
  }
});

test("source contract: GET /api/account uses requireUserId and attachment headers", () => {
  const route = readProjectFile("app/api/account/route.ts");

  assert.match(route, /export const GET/);
  assert.match(route, /withApiRoute\(\s*["']account\.GET["']/);
  assert.match(route, /requireUserId\s*\(/);
  assert.match(route, /exportUserAccountData\s*\(\s*userId\s*\)/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /ACCOUNT_EXPORT_FILENAME/);
  assert.match(route, /application\/json/);
  assert.match(route, /ACCOUNT_EXPORT_SCHEMA_VERSION|schemaVersion/);
  assert.equal(ACCOUNT_EXPORT_FILENAME, "numanie-account-export.json");

  // Must not take user id from query/body
  assert.doesNotMatch(route, /searchParams\.get\(\s*["']userId["']\s*\)/);
  assert.doesNotMatch(route, /payload\.userId|body\.userId|payload\.user_id/);

  const getHandler = route.slice(route.indexOf("export const GET"), route.indexOf("export const DELETE"));
  assert.doesNotMatch(getHandler, /request\.json\(\)/);
  assert.doesNotMatch(getHandler, /\.json\(\)/);

  // DELETE contract retained
  assert.match(route, /export const DELETE/);
  assert.match(route, /deleteUserAccountData\s*\(\s*userId\s*\)/);
});

test("source contract: export lib never selects secret columns", () => {
  const lib = readProjectFile("lib/account-export.ts");

  assert.equal(ACCOUNT_EXPORT_SCHEMA_VERSION, 1);
  assert.equal(ACCOUNT_EXPORT_FILENAME, "numanie-account-export.json");

  assert.match(lib, /sqlite_schema/);
  assert.doesNotMatch(lib, /\bp256dh\b/);
  assert.doesNotMatch(lib, /\bauth\b/);
  assert.doesNotMatch(lib, /expo_push_token/);
  assert.doesNotMatch(lib, /session_id/);
  assert.doesNotMatch(lib, /jwt|cookie/i);
});

test("source contract: settings UI separates export and delete failure states", () => {
  const ui = readProjectFile("app/settings/settings-client.tsx");

  assert.match(ui, /データエクスポート|アカウントデータのエクスポート/);
  assert.match(ui, /method:\s*["']GET["']/);
  assert.match(ui, /\/api\/account/);
  assert.match(ui, /exportPending|exportError|exportSuccess|retry/);
  assert.match(ui, /aria-live/);
  assert.match(ui, /再試行|もう一度/);

  // Export helper must not call signOut / delete APIs
  const exportFnStart = ui.indexOf("async function executeAccountExport");
  const exportFnEnd = ui.indexOf("function openDeleteConfirm");
  assert.ok(exportFnStart >= 0 && exportFnEnd > exportFnStart);
  const exportFn = ui.slice(exportFnStart, exportFnEnd);
  assert.doesNotMatch(exportFn, /signOut/);
  assert.doesNotMatch(exportFn, /method:\s*["']DELETE["']/);
  assert.doesNotMatch(exportFn, /ACCOUNT_DELETION_CONFIRMATION/);

  // Delete two-step retained
  assert.match(ui, /ACCOUNT_DELETION_CONFIRMATION/);
  assert.match(ui, /削除する/);
  assert.match(ui, /バックアップ|ログ|キャッシュ|Google/);
  assert.match(ui, /signOut\(\s*\{\s*callbackUrl:\s*["']\/["']\s*\}\s*\)/);
});
