import { getTursoClient } from "@/lib/turso";

/** Exact confirmation string required by DELETE /api/account (no trim/case coercion). */
export const ACCOUNT_DELETION_CONFIRMATION = "削除する";

/** Known app-owned tables that may be lazily created. */
export const ACCOUNT_DELETION_TABLES = [
  "share_comments",
  "share_reactions",
  "board_shares",
  "user_anime_statuses",
  "tier_boards",
  "user_subscriptions",
  "user_preferences",
  "push_subscriptions",
  "native_push_tokens",
  "native_sessions",
  "evangelist_cards",
  "season_share"
] as const;

export type AccountDeletionTable = (typeof ACCOUNT_DELETION_TABLES)[number];

type SqlArg = string | number | null | boolean | Uint8Array | ArrayBuffer;
type SqlStatement = { sql: string; args?: SqlArg[] };

export type AccountDeletionExecutor = {
  execute(statement: SqlStatement | string): Promise<unknown>;
};

export type AccountDeletionClient = {
  execute(statement: SqlStatement | string): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction(mode: "write"): Promise<
    AccountDeletionExecutor & {
      commit(): Promise<void>;
      rollback(): Promise<void>;
    }
  >;
};

/**
 * Delete all known app data owned by `userId` in a single write transaction.
 * Idempotent. Absent lazily-created tables are skipped via sqlite_schema.
 * Does not delete Google / Auth.js identity tables or other users' independent data.
 */
export async function deleteUserAccountData(
  userId: string,
  client: AccountDeletionClient = getTursoClient() as AccountDeletionClient
): Promise<void> {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required.");
  }

  const existing = await listExistingAccountTables(client);
  if (existing.size === 0) {
    return;
  }

  const tx = await client.transaction("write");
  try {
    await runAccountDeletionStatements(tx, userId, existing);
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // ignore rollback errors; original error is primary
    }
    throw error;
  }
}

async function listExistingAccountTables(
  client: AccountDeletionClient
): Promise<Set<AccountDeletionTable>> {
  const placeholders = ACCOUNT_DELETION_TABLES.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `select name from sqlite_schema
          where type = 'table' and name in (${placeholders})`,
    args: [...ACCOUNT_DELETION_TABLES]
  });

  const existing = new Set<AccountDeletionTable>();
  for (const row of result.rows) {
    const name = String(row.name);
    if ((ACCOUNT_DELETION_TABLES as readonly string[]).includes(name)) {
      existing.add(name as AccountDeletionTable);
    }
  }
  return existing;
}

async function runAccountDeletionStatements(
  executor: AccountDeletionExecutor,
  userId: string,
  existing: Set<AccountDeletionTable>
): Promise<void> {
  const has = (table: AccountDeletionTable) => existing.has(table);
  const run = (statement: SqlStatement) => executor.execute(statement);

  // Own board shares: cascade all comments/reactions on those shares (including other users').
  if (has("board_shares")) {
    if (has("share_comments")) {
      await run({
        sql: `delete from share_comments
              where share_id in (
                select share_id from board_shares where user_id = ?
              )`,
        args: [userId]
      });
    }
    if (has("share_reactions")) {
      await run({
        sql: `delete from share_reactions
              where share_id in (
                select share_id from board_shares where user_id = ?
              )`,
        args: [userId]
      });
    }
  }

  // Own comments/reactions on other users' shares (and any remaining own rows).
  if (has("share_comments")) {
    await run({
      sql: "delete from share_comments where user_id = ?",
      args: [userId]
    });
  }
  if (has("share_reactions")) {
    await run({
      sql: `delete from share_reactions
            where user_id = ? or reaction_key = ?`,
      args: [userId, userId]
    });
  }

  if (has("board_shares")) {
    await run({
      sql: "delete from board_shares where user_id = ?",
      args: [userId]
    });
  }

  const simpleUserTables: AccountDeletionTable[] = [
    "user_anime_statuses",
    "tier_boards",
    "user_subscriptions",
    "user_preferences",
    "push_subscriptions",
    "native_push_tokens",
    "native_sessions",
    "evangelist_cards",
    "season_share"
  ];

  for (const table of simpleUserTables) {
    if (!has(table)) {
      continue;
    }
    await run({
      sql: `delete from ${table} where user_id = ?`,
      args: [userId]
    });
  }
}
