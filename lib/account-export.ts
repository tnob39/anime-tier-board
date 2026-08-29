import { getTursoClient } from "@/lib/turso";
import { ACCOUNT_DELETION_TABLES, type AccountDeletionTable } from "@/lib/account-deletion";

/** Stable export schema version. Bump only with intentional breaking changes. */
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1 as const;

/** Download filename for Content-Disposition attachment. */
export const ACCOUNT_EXPORT_FILENAME = "numanie-account-export.json";

type SqlArg = string | number | null | boolean | Uint8Array | ArrayBuffer;
type SqlStatement = { sql: string; args?: SqlArg[] };

export type AccountExportClient = {
  execute(statement: SqlStatement | string): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type AccountExportPayload = {
  schemaVersion: typeof ACCOUNT_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  userId: string;
  data: {
    userAnimeStatuses: Array<{
      animeId: string;
      status: string;
      anime: unknown;
      updatedAt: string;
    }>;
    tierBoards: Array<{
      seasonYear: number;
      season: string;
      board: unknown;
      updatedAt: string;
    }>;
    userSubscriptions: Array<{
      serviceId: string;
      createdAt: string;
    }>;
    userPreferences: Array<{
      onboardingDone: boolean;
      updatedAt: string;
    }>;
    /** Web push metadata only — crypto keys are never exported. */
    pushSubscriptions: Array<{
      id: string;
      endpoint: string;
      createdAt: string;
    }>;
    /** Device platform metadata only — native push tokens are never exported. */
    nativePushTokens: Array<{
      id: string;
      platform: string;
      createdAt: string;
    }>;
    /** Session timing metadata only — session IDs/tokens are never exported. */
    nativeSessions: Array<{
      createdAt: string;
      expiresAt: string;
      revokedAt: string | null;
    }>;
    evangelistCards: Array<{
      id: string;
      animeId: string;
      animeTitle: string;
      comment: string;
      createdAt: string;
    }>;
    seasonShares: Array<{
      id: string;
      season: string;
      seasonYear: number;
      statuses: string;
      comment: string | null;
    }>;
    boardShares: Array<{
      shareId: string;
      board: unknown;
      items: unknown;
      createdAt: string;
      updatedAt: string;
    }>;
    shareComments: Array<{
      commentId: string;
      shareId: string;
      userName: string | null;
      userImage: string | null;
      body: string;
      createdAt: string;
      updatedAt: string;
    }>;
    shareReactions: Array<{
      shareId: string;
      reactionKey: string;
      kind: string;
      createdAt: string;
    }>;
  };
};

function emptyData(): AccountExportPayload["data"] {
  return {
    userAnimeStatuses: [],
    tierBoards: [],
    userSubscriptions: [],
    userPreferences: [],
    pushSubscriptions: [],
    nativePushTokens: [],
    nativeSessions: [],
    evangelistCards: [],
    seasonShares: [],
    boardShares: [],
    shareComments: [],
    shareReactions: []
  };
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function asString(value: unknown, fallback = ""): string {
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return String(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Export all known app data owned by `userId` as a fixed-schema JSON payload.
 * Absent lazily-created tables are skipped (empty collections).
 * Never includes push crypto keys, native push tokens, or native session IDs.
 */
export async function exportUserAccountData(
  userId: string,
  client: AccountExportClient = getTursoClient() as AccountExportClient
): Promise<AccountExportPayload> {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required.");
  }

  const existing = await listExistingAccountTables(client);
  const data = emptyData();

  if (existing.has("user_anime_statuses")) {
    const result = await client.execute({
      sql: `select anime_id, status, anime_json, updated_at
            from user_anime_statuses where user_id = ?`,
      args: [userId]
    });
    data.userAnimeStatuses = result.rows.map((row) => ({
      animeId: asString(row.anime_id),
      status: asString(row.status),
      anime: parseJsonColumn(row.anime_json),
      updatedAt: asString(row.updated_at)
    }));
  }

  if (existing.has("tier_boards")) {
    const result = await client.execute({
      sql: `select season_year, season, board_json, updated_at
            from tier_boards where user_id = ?`,
      args: [userId]
    });
    data.tierBoards = result.rows.map((row) => ({
      seasonYear: asNumber(row.season_year),
      season: asString(row.season),
      board: parseJsonColumn(row.board_json),
      updatedAt: asString(row.updated_at)
    }));
  }

  if (existing.has("user_subscriptions")) {
    const result = await client.execute({
      sql: `select service_id, created_at from user_subscriptions where user_id = ?`,
      args: [userId]
    });
    data.userSubscriptions = result.rows.map((row) => ({
      serviceId: asString(row.service_id),
      createdAt: asString(row.created_at)
    }));
  }

  if (existing.has("user_preferences")) {
    const result = await client.execute({
      sql: `select onboarding_done, updated_at from user_preferences where user_id = ?`,
      args: [userId]
    });
    data.userPreferences = result.rows.map((row) => ({
      onboardingDone: Boolean(row.onboarding_done),
      updatedAt: asString(row.updated_at)
    }));
  }

  if (existing.has("push_subscriptions")) {
    // Select only non-secret metadata columns for web push rows.
    const result = await client.execute({
      sql: `select id, endpoint, created_at from push_subscriptions where user_id = ?`,
      args: [userId]
    });
    data.pushSubscriptions = result.rows.map((row) => ({
      id: asString(row.id),
      endpoint: asString(row.endpoint),
      createdAt: asString(row.created_at)
    }));
  }

  if (existing.has("native_push_tokens")) {
    // Select only non-secret device metadata columns.
    const result = await client.execute({
      sql: `select id, platform, created_at from native_push_tokens where user_id = ?`,
      args: [userId]
    });
    data.nativePushTokens = result.rows.map((row) => ({
      id: asString(row.id),
      platform: asString(row.platform),
      createdAt: asString(row.created_at)
    }));
  }

  if (existing.has("native_sessions")) {
    // Select only timing metadata; never export session identifiers.
    const result = await client.execute({
      sql: `select created_at, expires_at, revoked_at from native_sessions where user_id = ?`,
      args: [userId]
    });
    data.nativeSessions = result.rows.map((row) => ({
      createdAt: asString(row.created_at),
      expiresAt: asString(row.expires_at),
      revokedAt: asNullableString(row.revoked_at)
    }));
  }

  if (existing.has("evangelist_cards")) {
    const result = await client.execute({
      sql: `select id, anime_id, anime_title, comment, created_at
            from evangelist_cards where user_id = ?`,
      args: [userId]
    });
    data.evangelistCards = result.rows.map((row) => ({
      id: asString(row.id),
      animeId: asString(row.anime_id),
      animeTitle: asString(row.anime_title),
      comment: asString(row.comment),
      createdAt: asString(row.created_at)
    }));
  }

  if (existing.has("season_share")) {
    const result = await client.execute({
      sql: `select id, season, season_year, statuses, comment
            from season_share where user_id = ?`,
      args: [userId]
    });
    data.seasonShares = result.rows.map((row) => ({
      id: asString(row.id),
      season: asString(row.season),
      seasonYear: asNumber(row.season_year),
      statuses: asString(row.statuses),
      comment: asNullableString(row.comment)
    }));
  }

  if (existing.has("board_shares")) {
    const result = await client.execute({
      sql: `select share_id, board_json, items_json, created_at, updated_at
            from board_shares where user_id = ?`,
      args: [userId]
    });
    data.boardShares = result.rows.map((row) => ({
      shareId: asString(row.share_id),
      board: parseJsonColumn(row.board_json),
      items: parseJsonColumn(row.items_json),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at)
    }));
  }

  if (existing.has("share_comments")) {
    const result = await client.execute({
      sql: `select comment_id, share_id, user_name, user_image, body, created_at, updated_at
            from share_comments where user_id = ?`,
      args: [userId]
    });
    data.shareComments = result.rows.map((row) => ({
      commentId: asString(row.comment_id),
      shareId: asString(row.share_id),
      userName: asNullableString(row.user_name),
      userImage: asNullableString(row.user_image),
      body: asString(row.body),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at)
    }));
  }

  if (existing.has("share_reactions")) {
    const result = await client.execute({
      sql: `select share_id, reaction_key, kind, created_at
            from share_reactions
            where user_id = ? or reaction_key = ?`,
      args: [userId, userId]
    });
    data.shareReactions = result.rows.map((row) => ({
      shareId: asString(row.share_id),
      reactionKey: asString(row.reaction_key),
      kind: asString(row.kind),
      createdAt: asString(row.created_at)
    }));
  }

  return {
    schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    data
  };
}

async function listExistingAccountTables(
  client: AccountExportClient
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
