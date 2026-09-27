import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
  COMMENT_REPORT_INVALID,
  parseCommentReportBody,
} from "../lib/api/write-request-guard.ts";
import {
  ensureShareSchema,
  listComments,
  moderateComment,
  reportComment,
} from "../lib/shares.ts";

type LocalHarness = {
  client: ReturnType<typeof createClient>;
  directory: string;
  close: () => void;
};

function createLocalHarness(prefix = "atb-moderation-"): LocalHarness {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(directory, "db.sqlite");
  const client = createClient({ url: `file:${dbPath.replaceAll("\\", "/")}` });
  return {
    client,
    directory,
    close: () => {
      client.close();
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still have a short-lived SQLite handle.
      }
    },
  };
}

async function setupSchema(client: ReturnType<typeof createClient>): Promise<void> {
  await client.execute("pragma foreign_keys = on");
  await ensureShareSchema(client);
}

async function seedShare(
  client: ReturnType<typeof createClient>,
  shareId: string,
  ownerUserId: string,
  commentId: string,
  commentUserId: string
): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `insert into board_shares
            (share_id, user_id, board_json, items_json, created_at, updated_at)
          values (?, ?, '{}', '[]', ?, ?)`,
    args: [shareId, ownerUserId, now, now],
  });
  await client.execute({
    sql: `insert into share_comments
            (comment_id, share_id, user_id, body, created_at, updated_at)
          values (?, ?, ?, 'comment', ?, ?)`,
    args: [commentId, shareId, commentUserId, now, now],
  });
}

async function countReports(
  client: ReturnType<typeof createClient>,
  commentId: string
): Promise<number> {
  const result = await client.execute({
    sql: "select count(*) as count from share_comment_reports where comment_id = ?",
    args: [commentId],
  });
  return Number(result.rows[0]?.count ?? 0);
}

async function reportWithLocalLockRetry(
  client: ReturnType<typeof createClient>,
  reporterUserId: string
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId,
        reason: "spam",
        client,
      });
      assert.equal(result.outcome, "reported");
      return;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("SQLITE_BUSY")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 + (attempt % 10) * 5));
    }
  }
  throw new Error(`SQLite remained locked while reporting as ${reporterUserId}.`);
}

test("report input validation is executable and bounded", async () => {
  assert.deepEqual(parseCommentReportBody({ reason: "spoiler", detail: "  内容を確認してください  " }), {
    ok: true,
    reason: "spoiler",
    detail: "内容を確認してください",
  });

  for (const value of [
    null,
    [],
    {},
    { reason: "invalid" },
    { reason: "spam", extra: true },
    { reason: "spam", detail: 1 },
    { reason: "spam", detail: "x".repeat(501) },
    { reason: "spam", detail: "line\nbreak" },
  ]) {
    const result = parseCommentReportBody(value);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(await result.response.json(), { error: COMMENT_REPORT_INVALID });
    }
  }
});

test("reporting is idempotent, rejects self/cross-share binding, and hides on the third report", async () => {
  const harness = createLocalHarness();
  try {
    await setupSchema(harness.client);
    await seedShare(harness.client, "share-a", "owner-a", "comment-a", "commenter-a");
    await seedShare(harness.client, "share-b", "owner-b", "comment-b", "commenter-b");

    assert.deepEqual(
      await reportComment({
        shareId: "share-b",
        commentId: "comment-a",
        reporterUserId: "reporter-1",
        reason: "spam",
        client: harness.client,
      }),
      { outcome: "not_found" }
    );
    assert.deepEqual(
      await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId: "commenter-a",
        reason: "spam",
        client: harness.client,
      }),
      { outcome: "self" }
    );

    assert.deepEqual(
      await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId: "reporter-1",
        reason: "spam",
        client: harness.client,
      }),
      { outcome: "reported", hidden: false }
    );
    assert.equal((await listComments("share-a", harness.client)).length, 1);

    assert.deepEqual(
      await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId: "reporter-1",
        reason: "other",
        client: harness.client,
      }),
      { outcome: "duplicate", hidden: false }
    );
    assert.equal(await countReports(harness.client, "comment-a"), 1);

    assert.deepEqual(
      await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId: "reporter-2",
        reason: "harassment",
        client: harness.client,
      }),
      { outcome: "reported", hidden: false }
    );
    assert.equal((await listComments("share-a", harness.client)).length, 1);

    assert.deepEqual(
      await reportComment({
        shareId: "share-a",
        commentId: "comment-a",
        reporterUserId: "reporter-3",
        reason: "spoiler",
        client: harness.client,
      }),
      { outcome: "reported", hidden: true }
    );
    assert.equal(await countReports(harness.client, "comment-a"), 3);
    assert.equal((await listComments("share-a", harness.client)).length, 0);
  } finally {
    harness.close();
  }
});

test("owner hide/delete and comment-owner delete are authorized while non-owners are denied", async () => {
  const harness = createLocalHarness();
  try {
    await setupSchema(harness.client);
    await seedShare(harness.client, "share-a", "owner-a", "comment-a", "commenter-a");
    await harness.client.execute({
      sql: `insert into share_comments
              (comment_id, share_id, user_id, body, created_at, updated_at)
            values ('comment-b', 'share-a', 'commenter-b', 'comment', ?, ?)`,
      args: [new Date().toISOString(), new Date().toISOString()],
    });

    assert.deepEqual(
      await moderateComment({
        shareId: "share-a",
        commentId: "comment-a",
        actorUserId: "owner-a",
        action: "hide",
        client: harness.client,
      }),
      { outcome: "moderated" }
    );
    assert.equal((await listComments("share-a", harness.client)).length, 1);

    assert.deepEqual(
      await moderateComment({
        shareId: "share-a",
        commentId: "comment-b",
        actorUserId: "other-user",
        action: "hide",
        client: harness.client,
      }),
      { outcome: "not_found" }
    );
    assert.deepEqual(
      await moderateComment({
        shareId: "share-a",
        commentId: "comment-b",
        actorUserId: "other-user",
        action: "delete",
        client: harness.client,
      }),
      { outcome: "forbidden" }
    );
    assert.deepEqual(
      await moderateComment({
        shareId: "share-a",
        commentId: "comment-b",
        actorUserId: "commenter-b",
        action: "delete",
        client: harness.client,
      }),
      { outcome: "moderated" }
    );
    assert.deepEqual(
      await moderateComment({
        shareId: "share-a",
        commentId: "comment-a",
        actorUserId: "owner-a",
        action: "delete",
        client: harness.client,
      }),
      { outcome: "moderated" }
    );
    assert.equal((await listComments("share-a", harness.client)).length, 0);
  } finally {
    harness.close();
  }
});

test("concurrent reporters create one row per reporter", async () => {
  const harness = createLocalHarness();
  const clients = [1, 2, 3].map(() =>
    createClient({ url: `file:${path.join(harness.directory, "db.sqlite").replaceAll("\\", "/")}` })
  );
  try {
    await setupSchema(harness.client);
    await seedShare(harness.client, "share-a", "owner-a", "comment-a", "commenter-a");
    await Promise.all(
      clients.map((client, index) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            reportWithLocalLockRetry(client, `reporter-${index}`).then(resolve, reject);
          }, index * 150);
        })
      )
    );
    assert.equal(await countReports(harness.client, "comment-a"), 3);
    assert.equal((await listComments("share-a", harness.client)).length, 0);
  } finally {
    for (const client of clients) client.close();
    harness.close();
  }
});

test("independent clients can concurrently initialize one local database", async () => {
  const first = createLocalHarness("atb-moderation-concurrent-schema-");
  const second = createClient({
    url: `file:${path.join(first.directory, "db.sqlite").replaceAll("\\", "/")}`,
  });

  try {
    const results = await Promise.allSettled([
      ensureShareSchema(first.client),
      ensureShareSchema(second),
    ]);
    assert.equal(results[0]?.status, "fulfilled", JSON.stringify(results[0]));
    assert.equal(results[1]?.status, "fulfilled", JSON.stringify(results[1]));

    for (const [table, column] of [
      ["board_shares", "user_id"],
      ["share_reactions", "user_id"],
      ["share_comments", "hidden_at"],
    ] as const) {
      const result = await first.client.execute(`pragma table_info(${table})`);
      assert.equal(
        result.rows.filter((row) => String(row.name) === column).length,
        1,
        `${table}.${column}`
      );
    }
  } finally {
    second.close();
    first.close();
  }
});

test("legacy schema migration adds missing columns and retries after an unexpected ALTER failure", async () => {
  const legacy = createLocalHarness("atb-moderation-legacy-");
  try {
    await legacy.client.execute("pragma foreign_keys = on");
    await legacy.client.execute(`create table board_shares (
      share_id text primary key,
      board_json text not null,
      items_json text not null,
      created_at text not null,
      updated_at text not null
    )`);
    await legacy.client.execute(`create table share_reactions (
      share_id text not null,
      reaction_key text not null,
      kind text not null,
      created_at text not null,
      primary key (share_id, reaction_key, kind)
    )`);
    await legacy.client.execute(`create table share_comments (
      comment_id text primary key,
      share_id text not null,
      user_id text not null,
      body text not null,
      created_at text not null,
      updated_at text not null
    )`);
    await ensureShareSchema(legacy.client);

    for (const [table, column] of [
      ["board_shares", "user_id"],
      ["share_reactions", "user_id"],
      ["share_comments", "hidden_at"],
    ] as const) {
      const result = await legacy.client.execute(`pragma table_info(${table})`);
      assert.equal(result.rows.some((row) => String(row.name) === column), true, `${table}.${column}`);
    }
  } finally {
    legacy.close();
  }

  let hiddenColumnAdded = false;
  let alterAttempts = 0;
  const failingClient = {
    execute: async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const tableInfo = /^pragma table_info\(([^)]+)\)$/i.exec(sql.trim());
      if (tableInfo?.[1] === "share_comments") {
        return { rows: hiddenColumnAdded ? [{ name: "hidden_at" }] : [] };
      }
      if (tableInfo?.[1] === "board_shares" || tableInfo?.[1] === "share_reactions") {
        return { rows: [{ name: "user_id" }] };
      }
      if (/^alter table share_comments add column hidden_at/i.test(sql.trim())) {
        alterAttempts += 1;
        if (alterAttempts === 1) {
          throw new Error("unexpected migration failure");
        }
        hiddenColumnAdded = true;
      }
      return { rows: [], rowsAffected: 0 };
    },
  };

  await assert.rejects(() => ensureShareSchema(failingClient as never), /unexpected migration failure/);
  await assert.doesNotReject(() => ensureShareSchema(failingClient as never));
  assert.equal(alterAttempts, 2);
});
