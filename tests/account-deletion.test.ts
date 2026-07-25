import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_TABLES,
  deleteUserAccountData,
  type AccountDeletionClient
} from "../lib/account-deletion.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

type MemoryHarness = {
  client: ReturnType<typeof createClient>;
  asAccountClient: AccountDeletionClient;
  close: () => Promise<void>;
};

function createMemoryHarness(): MemoryHarness {
  // Bare `:memory:` breaks transaction isolation in @libsql/client sqlite3 mode.
  // Use a unique temp file URL so each test is isolated and transactions work.
  const dir = mkdtempSync(path.join(os.tmpdir(), "atb-account-del-"));
  const dbPath = path.join(dir, "db.sqlite");
  const url = pathToFileURL(dbPath).href;
  const client = createClient({ url });
  return {
    client,
    asAccountClient: client as unknown as AccountDeletionClient,
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

async function countRows(
  client: AccountDeletionClient,
  sql: string,
  args: Array<string | number> = []
): Promise<number> {
  const result = await client.execute({ sql, args });
  const raw = result.rows[0]?.n ?? result.rows[0]?.["count(*)"] ?? 0;
  return typeof raw === "number" ? raw : Number(raw);
}

async function createAllKnownTables(client: AccountDeletionClient): Promise<void> {
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
  client: AccountDeletionClient,
  userId: string,
  suffix: string
): Promise<void> {
  const now = "2026-07-25T00:00:00.000Z";
  await client.execute({
    sql: `insert into user_anime_statuses (user_id, anime_id, status, anime_json, updated_at)
          values (?, ?, 'watching', '{}', ?)`,
    args: [userId, `anime-${suffix}`, now]
  });
  await client.execute({
    sql: `insert into tier_boards (user_id, season_year, season, board_json, updated_at)
          values (?, 2026, 'summer', '{}', ?)`,
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
          values (?, ?, ?, 'p', 'a', ?)`,
    args: [`push-${suffix}`, userId, `https://push.example/${suffix}`, now]
  });
  await client.execute({
    sql: `insert into native_push_tokens (id, user_id, expo_push_token, platform, created_at)
          values (?, ?, ?, 'ios', ?)`,
    args: [`npt-${suffix}`, userId, `ExponentPushToken[${suffix}]`, now]
  });
  await client.execute({
    sql: `insert into native_sessions (session_id, user_id, created_at, expires_at)
          values (?, ?, ?, ?)`,
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
}

test("deleteUserAccountData removes known owned rows and is idempotent", async () => {
  const harness = createMemoryHarness();
  const client = harness.asAccountClient;
  try {
    await createAllKnownTables(client);
    await seedUserData(client, "user-a", "a");
    await seedUserData(client, "user-b", "b");

    await deleteUserAccountData("user-a", client);
    await deleteUserAccountData("user-a", client);

    assert.equal(
      await countRows(client, "select count(*) as n from user_anime_statuses where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from tier_boards where user_id = ?", ["user-a"]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from user_subscriptions where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from user_preferences where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from push_subscriptions where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from native_push_tokens where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from native_sessions where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from evangelist_cards where user_id = ?", [
        "user-a"
      ]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from season_share where user_id = ?", ["user-a"]),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from board_shares where user_id = ?", ["user-a"]),
      0
    );

    // Other user intact
    assert.equal(
      await countRows(client, "select count(*) as n from user_anime_statuses where user_id = ?", [
        "user-b"
      ]),
      1
    );
    assert.equal(
      await countRows(client, "select count(*) as n from board_shares where user_id = ?", ["user-b"]),
      1
    );
  } finally {
    await harness.close();
  }
});

test("ownership isolation and share comment/reaction dependency cascade", async () => {
  const harness = createMemoryHarness();
  const client = harness.asAccountClient;
  try {
    await createAllKnownTables(client);
    const now = "2026-07-25T00:00:00.000Z";

    await client.execute({
      sql: `insert into board_shares (share_id, user_id, board_json, items_json, created_at, updated_at)
            values ('own-share', 'user-a', '{}', '[]', ?, ?),
                   ('other-share', 'user-b', '{}', '[]', ?, ?)`,
      args: [now, now, now, now]
    });

    // Own share: other user's comment/reaction must cascade-delete with the share.
    await client.execute({
      sql: `insert into share_comments
              (comment_id, share_id, user_id, body, created_at, updated_at)
            values ('c-on-own', 'own-share', 'user-b', 'hello', ?, ?),
                   ('c-own-on-other', 'other-share', 'user-a', 'mine', ?, ?),
                   ('c-other-on-other', 'other-share', 'user-b', 'theirs', ?, ?)`,
      args: [now, now, now, now, now, now]
    });
    await client.execute({
      sql: `insert into share_reactions
              (share_id, reaction_key, user_id, kind, created_at)
            values ('own-share', 'user-b', 'user-b', 'like', ?),
                   ('other-share', 'user-a', 'user-a', 'agree', ?),
                   ('other-share', 'user-b', 'user-b', 'like', ?)`,
      args: [now, now, now]
    });

    // Independent other-user board data
    await client.execute({
      sql: `insert into user_anime_statuses (user_id, anime_id, status, anime_json, updated_at)
            values ('user-b', 'anime-b', 'watching', '{}', ?)`,
      args: [now]
    });

    await deleteUserAccountData("user-a", client);

    assert.equal(
      await countRows(client, "select count(*) as n from board_shares where share_id = 'own-share'"),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from share_comments where share_id = 'own-share'"),
      0
    );
    assert.equal(
      await countRows(client, "select count(*) as n from share_reactions where share_id = 'own-share'"),
      0
    );

    // Own comment/reaction on other share removed
    assert.equal(
      await countRows(client, "select count(*) as n from share_comments where comment_id = 'c-own-on-other'"),
      0
    );
    assert.equal(
      await countRows(
        client,
        "select count(*) as n from share_reactions where share_id = 'other-share' and user_id = 'user-a'"
      ),
      0
    );

    // Other user's independent share data remains
    assert.equal(
      await countRows(client, "select count(*) as n from board_shares where share_id = 'other-share'"),
      1
    );
    assert.equal(
      await countRows(
        client,
        "select count(*) as n from share_comments where comment_id = 'c-other-on-other'"
      ),
      1
    );
    assert.equal(
      await countRows(
        client,
        "select count(*) as n from share_reactions where share_id = 'other-share' and user_id = 'user-b'"
      ),
      1
    );
    assert.equal(
      await countRows(client, "select count(*) as n from user_anime_statuses where user_id = 'user-b'"),
      1
    );
  } finally {
    await harness.close();
  }
});

test("absent lazily-created known tables are skipped safely", async () => {
  const harness = createMemoryHarness();
  const client = harness.asAccountClient;
  try {
    await client.execute(`create table user_anime_statuses (
      user_id text not null,
      anime_id text not null,
      status text not null,
      anime_json text not null,
      updated_at text not null,
      primary key (user_id, anime_id)
    )`);
    await client.execute({
      sql: `insert into user_anime_statuses (user_id, anime_id, status, anime_json, updated_at)
            values ('user-a', 'a1', 'watching', '{}', '2026-07-25T00:00:00.000Z')`,
      args: []
    });

    await assert.doesNotReject(() => deleteUserAccountData("user-a", client));
    assert.equal(
      await countRows(client, "select count(*) as n from user_anime_statuses where user_id = 'user-a'"),
      0
    );
  } finally {
    await harness.close();
  }

  // No tables at all
  const emptyHarness = createMemoryHarness();
  try {
    await assert.doesNotReject(() => deleteUserAccountData("user-a", emptyHarness.asAccountClient));
  } finally {
    await emptyHarness.close();
  }
});

test("write transaction rolls back when a statement fails mid-deletion", async () => {
  const harness = createMemoryHarness();
  const base = harness.client;
  const baseClient = harness.asAccountClient;
  try {
    await createAllKnownTables(baseClient);
    await seedUserData(baseClient, "user-a", "a");

    let deleteCount = 0;
    const failingClient: AccountDeletionClient = {
      execute: (statement) => baseClient.execute(statement),
      transaction: async (mode) => {
        const tx = await base.transaction(mode);
        return {
          execute: async (statement) => {
            const sql = typeof statement === "string" ? statement : statement.sql;
            if (/^delete from/i.test(sql.trim())) {
              deleteCount += 1;
              if (deleteCount === 3) {
                throw new Error("forced mid-transaction failure");
              }
            }
            return tx.execute(statement as never);
          },
          commit: () => tx.commit(),
          rollback: () => tx.rollback()
        };
      }
    };

    await assert.rejects(
      () => deleteUserAccountData("user-a", failingClient),
      /forced mid-transaction failure/
    );

    // Seeded row still present after rollback
    assert.equal(
      await countRows(baseClient, "select count(*) as n from user_anime_statuses where user_id = 'user-a'"),
      1
    );
    assert.equal(
      await countRows(baseClient, "select count(*) as n from board_shares where user_id = 'user-a'"),
      1
    );
    assert.equal(
      await countRows(baseClient, "select count(*) as n from user_subscriptions where user_id = 'user-a'"),
      1
    );
  } finally {
    await harness.close();
  }
});

test("source contract: API accepts exact 削除する confirmation and returns {ok:true}", () => {
  const route = readProjectFile("app/api/account/route.ts");

  assert.match(route, /withApiRoute\(\s*["']account\.DELETE["']/);
  assert.match(route, /requireUserId\s*\(/);
  assert.match(route, /export const DELETE/);
  assert.match(route, /ACCOUNT_DELETION_CONFIRMATION/);
  assert.match(route, /deleteUserAccountData\s*\(\s*userId\s*\)/);
  assert.match(route, /NextResponse\.json\(\s*\{\s*ok:\s*true\s*\}/);
  assert.match(route, /code:\s*["']VALIDATION["']/);
  assert.match(route, /status:\s*400/);

  // No trim/case coercion on confirmation
  assert.doesNotMatch(route, /confirmation\s*\.\s*trim\s*\(/);
  assert.doesNotMatch(route, /toLowerCase\s*\(\s*\)|toUpperCase\s*\(\s*\)/);

  // Must not take user id from request body
  assert.doesNotMatch(route, /payload\.userId|body\.userId|payload\.user_id/);
});

test("source contract: settings UI two-step deletion and signOut only after success", () => {
  const ui = readProjectFile("app/settings/settings-client.tsx");

  assert.match(ui, /アカウントデータの削除/);
  assert.match(ui, /Googleアカウント/);
  assert.match(ui, /取り消せません|完全に削除/);
  assert.match(ui, /アカウントデータを削除する/);
  assert.match(ui, /method:\s*["']DELETE["']/);
  assert.match(ui, /\/api\/account/);
  assert.match(ui, /confirmation:\s*deleteInput/);
  assert.match(ui, /signOut\(\s*\{\s*callbackUrl:\s*["']\/["']\s*\}\s*\)/);
  assert.match(ui, /role=["']alert["']/);
  assert.match(ui, /aria-live=["']assertive["']/);
  assert.match(ui, /キャンセル/);
  assert.match(ui, /deletePending/);
  assert.match(ui, /ACCOUNT_DELETION_CONFIRMATION/);

  // First button must not call API; only open confirm
  assert.match(ui, /openDeleteConfirm|setShowDeleteConfirm\(true\)/);
  assert.match(ui, /disabled=\{!canSubmitDeletion\}|disabled=\{!canSubmit/);

  // Logout section retained
  assert.match(ui, /ログアウト/);
  assert.match(ui, /signOut\(\)/);
});

test("source contract: lib uses single write transaction and sqlite_schema", () => {
  const lib = readProjectFile("lib/account-deletion.ts");

  assert.equal(ACCOUNT_DELETION_CONFIRMATION, "削除する");
  assert.ok(ACCOUNT_DELETION_TABLES.includes("share_comments"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("share_reactions"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("board_shares"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("user_anime_statuses"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("native_sessions"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("evangelist_cards"));
  assert.ok(ACCOUNT_DELETION_TABLES.includes("season_share"));

  assert.match(lib, /sqlite_schema/);
  assert.match(lib, /transaction\(\s*["']write["']\s*\)/);
  assert.match(lib, /\.commit\s*\(/);
  assert.match(lib, /\.rollback\s*\(/);
  assert.match(lib, /delete from share_comments[\s\S]*board_shares where user_id/);
  assert.match(lib, /delete from share_reactions[\s\S]*board_shares where user_id/);
  assert.match(lib, /user_id = \? or reaction_key = \?/);

  // Must not leak counts in return value
  assert.doesNotMatch(lib, /return\s*\{\s*deleted|rowsAffected|count:/);
});
