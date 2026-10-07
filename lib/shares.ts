import { randomBytes } from "node:crypto";
import { getTursoClient } from "@/lib/turso";
import type { AnimeStatusRecord, DashboardData } from "@/lib/statuses";
import type { AnimeItem, AnimeSeason } from "@/lib/types";
import {
  OWNER_COMMENT_INBOX_PAGE_SIZE,
  OWNER_COMMENT_PREVIEW_LENGTH,
  ownerCommentPreview,
  type CommentableShareKind,
  type OwnerCommentInboxCursor,
  type OwnerCommentInboxPage
} from "@/lib/owner-comment-inbox";

export const REACTION_KINDS = ["like", "agree", "surprised", "want_to_watch"] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export type ReactionCounts = Record<ReactionKind, number>;

export type SharedTierRow = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
  locked?: boolean;
};

export type SharedBoard = {
  version: number;
  season: AnimeSeason;
  seasonYear: number;
  tiers: SharedTierRow[];
  updatedAt: string;
};

export type ShareComment = {
  id: string;
  body: string;
  userName: string | null;
  userImage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentReportReason = "spam" | "harassment" | "spoiler" | "other";
export type CommentReportResult =
  | { outcome: "reported"; hidden: boolean }
  | { outcome: "duplicate"; hidden: boolean }
  | { outcome: "not_found" }
  | { outcome: "self" };
export type CommentModerationAction = "hide" | "delete";
export type CommentModerationResult =
  | { outcome: "moderated" }
  | { outcome: "not_found" }
  | { outcome: "forbidden" };

type ShareDbClient = ReturnType<typeof getTursoClient>;

export type BoardShare = {
  shareId: string;
  board: SharedBoard;
  items: AnimeItem[];
  createdAt: string;
  updatedAt: string;
  reactionCounts: ReactionCounts;
};

export type SharedWatchlist = {
  version: number;
  kind: "watchlist";
  title: string;
  updatedAt: string;
};

export type WatchlistShare = {
  shareId: string;
  watchlist: SharedWatchlist;
  items: AnimeStatusRecord[];
  createdAt: string;
  updatedAt: string;
  reactionCounts: ReactionCounts;
};

export type SharedDashboard = {
  version: number;
  kind: "dashboard";
  title: string;
  updatedAt: string;
};

export type DashboardShare = {
  shareId: string;
  dashboard: SharedDashboard;
  data: DashboardData;
  createdAt: string;
  updatedAt: string;
  reactionCounts: ReactionCounts;
};

const shareSchemaReady = new WeakMap<object, Promise<void>>();
const COMMENT_LIST_LIMIT = 100;

export async function createShare(
  userId: string,
  board: SharedBoard,
  items: AnimeItem[]
): Promise<string> {
  await ensureShareSchema();

  const shareId = createShareId();
  const now = new Date().toISOString();

  await getTursoClient().execute({
    sql: `insert into board_shares
            (share_id, user_id, board_json, items_json, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?)`,
    args: [shareId, userId, JSON.stringify(board), JSON.stringify(items), now, now]
  });

  return shareId;
}

export async function getShare(shareId: string): Promise<BoardShare | null> {
  await ensureShareSchema();

  const shareResult = await getTursoClient().execute({
    sql: `select share_id, board_json, items_json, created_at, updated_at
          from board_shares
          where share_id = ?
          limit 1`,
    args: [shareId]
  });
  const row = shareResult.rows[0];

  if (!row || typeof row.board_json !== "string" || typeof row.items_json !== "string") {
    return null;
  }

  const board = JSON.parse(row.board_json);
  if (board.kind === "season-impressions") return null;

  return {
    shareId: String(row.share_id),
    board: board as SharedBoard,
    items: JSON.parse(row.items_json) as AnimeItem[],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    reactionCounts: await getReactionCounts(shareId)
  };
}

export async function createWatchlistShare(
  userId: string,
  items: AnimeStatusRecord[]
): Promise<string> {
  await ensureShareSchema();

  const shareId = createShareId();
  const now = new Date().toISOString();
  const watchlist: SharedWatchlist = {
    version: 1,
    kind: "watchlist",
    title: "マイリスト",
    updatedAt: now
  };

  await getTursoClient().execute({
    sql: `insert into board_shares
            (share_id, user_id, board_json, items_json, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?)`,
    args: [shareId, userId, JSON.stringify(watchlist), JSON.stringify(items), now, now]
  });

  return shareId;
}

export async function getWatchlistShare(shareId: string): Promise<WatchlistShare | null> {
  await ensureShareSchema();

  const shareResult = await getTursoClient().execute({
    sql: `select share_id, board_json, items_json, created_at, updated_at
          from board_shares
          where share_id = ?
          limit 1`,
    args: [shareId]
  });
  const row = shareResult.rows[0];

  if (!row || typeof row.board_json !== "string" || typeof row.items_json !== "string") {
    return null;
  }

  const watchlist = JSON.parse(row.board_json) as SharedWatchlist;
  if (watchlist.kind !== "watchlist") {
    return null;
  }

  return {
    shareId: String(row.share_id),
    watchlist,
    items: JSON.parse(row.items_json) as AnimeStatusRecord[],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    reactionCounts: await getReactionCounts(shareId)
  };
}

export async function createDashboardShare(
  userId: string,
  data: DashboardData
): Promise<string> {
  await ensureShareSchema();

  const shareId = createShareId();
  const now = new Date().toISOString();
  const dashboard: SharedDashboard = {
    version: 1,
    kind: "dashboard",
    title: "好み分析ダッシュボード",
    updatedAt: now
  };

  await getTursoClient().execute({
    sql: `insert into board_shares
            (share_id, user_id, board_json, items_json, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?)`,
    args: [shareId, userId, JSON.stringify(dashboard), JSON.stringify(data), now, now]
  });

  return shareId;
}

export async function getDashboardShare(shareId: string): Promise<DashboardShare | null> {
  await ensureShareSchema();

  const shareResult = await getTursoClient().execute({
    sql: `select share_id, board_json, items_json, created_at, updated_at
          from board_shares
          where share_id = ?
          limit 1`,
    args: [shareId]
  });
  const row = shareResult.rows[0];

  if (!row || typeof row.board_json !== "string" || typeof row.items_json !== "string") {
    return null;
  }

  const dashboard = JSON.parse(row.board_json) as SharedDashboard;
  if (dashboard.kind !== "dashboard") {
    return null;
  }

  return {
    shareId: String(row.share_id),
    dashboard,
    data: JSON.parse(row.items_json) as DashboardData,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    reactionCounts: await getReactionCounts(shareId)
  };
}

export async function setReaction(
  shareId: string,
  userId: string,
  kind: ReactionKind
): Promise<{ reactionCounts: ReactionCounts; viewerReactions: ReactionKind[] }> {
  await ensureShareSchema();
  await assertShareExists(shareId);

  await getTursoClient().execute({
    sql: `delete from share_reactions
          where share_id = ? and (user_id = ? or reaction_key = ?)`,
    args: [shareId, userId, userId]
  });

  await getTursoClient().execute({
    sql: `insert or replace into share_reactions
            (share_id, reaction_key, user_id, kind, created_at)
          values (?, ?, ?, ?, ?)`,
    args: [shareId, userId, userId, kind, new Date().toISOString()]
  });

  return {
    reactionCounts: await getReactionCounts(shareId),
    viewerReactions: await getViewerReactions(shareId, userId)
  };
}

export async function getViewerReactions(
  shareId: string,
  userId: string
): Promise<ReactionKind[]> {
  await ensureShareSchema();

  const result = await getTursoClient().execute({
    sql: `select kind from share_reactions
          where share_id = ? and (user_id = ? or reaction_key = ?)`,
    args: [shareId, userId, userId]
  });

  return result.rows
    .map((row) => String(row.kind))
    .filter(isReactionKind);
}

export async function listComments(
  shareId: string,
  client: ShareDbClient = getTursoClient()
): Promise<ShareComment[]> {
  await ensureShareSchema(client);

  await assertShareInteractionsAllowed(shareId, client);

  const result = await client.execute({
    sql: `select comment_id, body, user_name, user_image, created_at, updated_at
          from share_comments
          where share_id = ? and hidden_at is null
          order by created_at desc
          limit ?`,
    args: [shareId, COMMENT_LIST_LIMIT]
  });

  return result.rows
    .map((row) => ({
      id: String(row.comment_id),
      body: String(row.body),
      userName: row.user_name ? String(row.user_name) : null,
      userImage: row.user_image ? String(row.user_image) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }))
    .reverse();
}

export async function listOwnerCommentInbox(
  userId: string,
  cursor: OwnerCommentInboxCursor | null = null,
  client: ShareDbClient = getTursoClient()
): Promise<OwnerCommentInboxPage> {
  await ensureShareSchema(client);

  // The report threshold and owner moderation both set hidden_at atomically.
  // Rank only visible comments so counts and the latest preview describe the same set.
  const result = await client.execute({
    sql: `with owned_shares as (
            select share_id, created_at,
              case when json_valid(board_json) then
                case when json_type(board_json) = 'object' then
                  coalesce(json_extract(board_json, '$.kind'), 'tier')
                end
              end as kind
            from board_shares
            where user_id = ?
          ), ranked_comments as (
            select s.share_id, s.kind, s.created_at as shared_at,
              c.created_at as latest_comment_at,
              substr(c.body, 1, ?) as preview,
              count(*) over (partition by s.share_id) as comment_count,
              row_number() over (
                partition by s.share_id order by c.created_at desc, c.comment_id desc
              ) as position
            from owned_shares s
            join share_comments c on c.share_id = s.share_id
            where s.kind in ('tier', 'dashboard', 'watchlist') and c.hidden_at is null
          )
          select share_id, kind, shared_at, latest_comment_at, preview, comment_count
          from ranked_comments
          where position = 1
            and (? is null or latest_comment_at < ? or (latest_comment_at = ? and share_id < ?))
          order by latest_comment_at desc, share_id desc
          limit ?`,
    args: [userId, OWNER_COMMENT_PREVIEW_LENGTH + 1, cursor?.latestCommentAt ?? null,
      cursor?.latestCommentAt ?? null, cursor?.latestCommentAt ?? null, cursor?.shareId ?? null,
      OWNER_COMMENT_INBOX_PAGE_SIZE + 1]
  });

  const items = result.rows.slice(0, OWNER_COMMENT_INBOX_PAGE_SIZE).map((row) => ({
    shareId: String(row.share_id),
    kind: String(row.kind) as CommentableShareKind,
    sharedAt: String(row.shared_at),
    commentCount: Number(row.comment_count),
    latestCommentAt: String(row.latest_comment_at),
    preview: ownerCommentPreview(String(row.preview))
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: result.rows.length > OWNER_COMMENT_INBOX_PAGE_SIZE && last
      ? `${last.latestCommentAt}|${last.shareId}` : null
  };
}

export async function addComment({
  shareId,
  userId,
  userName,
  userImage,
  body
}: {
  shareId: string;
  userId: string;
  userName?: string | null;
  userImage?: string | null;
  body: string;
}): Promise<ShareComment> {
  await ensureShareSchema();
  await assertShareExists(shareId);

  const now = new Date().toISOString();
  const comment: ShareComment = {
    id: createShareId(),
    body,
    userName: userName ?? null,
    userImage: userImage ?? null,
    createdAt: now,
    updatedAt: now
  };

  await getTursoClient().execute({
    sql: `insert into share_comments
            (comment_id, share_id, user_id, user_name, user_image, body, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      comment.id,
      shareId,
      userId,
      comment.userName,
      comment.userImage,
      comment.body,
      now,
      now
    ]
  });

  return comment;
}

type ReportCommentInput = {
  shareId: string;
  commentId: string;
  reporterUserId: string;
  reason: CommentReportReason;
  detail?: string | null;
  client?: ShareDbClient;
};

export async function reportComment(input: ReportCommentInput): Promise<CommentReportResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await reportCommentOnce(input);
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= 5) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 10));
    }
  }
}

async function reportCommentOnce({
  shareId,
  commentId,
  reporterUserId,
  reason,
  detail,
  client = getTursoClient()
}: ReportCommentInput): Promise<CommentReportResult> {
  await ensureShareSchema(client);
  await assertShareInteractionsAllowed(shareId, client);

  const tx = await client.transaction("write");
  try {
    const commentResult = await tx.execute({
      sql: `select user_id, hidden_at
            from share_comments
            where comment_id = ? and share_id = ?
            limit 1`,
      args: [commentId, shareId]
    });
    const comment = commentResult.rows[0];
    if (!comment) {
      await tx.rollback();
      return { outcome: "not_found" };
    }
    if (String(comment.user_id) === reporterUserId) {
      await tx.rollback();
      return { outcome: "self" };
    }

    const inserted = await tx.execute({
      sql: `insert or ignore into share_comment_reports
              (share_id, comment_id, reporter_user_id, reason, detail, created_at)
            select share_id, comment_id, ?, ?, ?, ?
            from share_comments
            where comment_id = ? and share_id = ? and user_id <> ?`,
      args: [
        reporterUserId,
        reason,
        detail ?? null,
        new Date().toISOString(),
        commentId,
        shareId,
        reporterUserId
      ]
    });

    if (!inserted.rowsAffected) {
      await tx.commit();
      return {
        outcome: "duplicate",
        hidden: comment.hidden_at != null
      };
    }

    const countResult = await tx.execute({
      sql: `select count(*) as count
            from share_comment_reports
            where comment_id = ? and share_id = ?`,
      args: [commentId, shareId]
    });
    const reportCount = Number(countResult.rows[0]?.count ?? 0);
    const hidden = comment.hidden_at != null || reportCount >= 3;

    if (reportCount >= 3) {
      await tx.execute({
        sql: `update share_comments
              set hidden_at = coalesce(hidden_at, ?)
              where comment_id = ? and share_id = ?`,
        args: [new Date().toISOString(), commentId, shareId]
      });
    }

    await tx.commit();
    return { outcome: "reported", hidden };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Preserve the database failure as the public operation failure.
    }
    throw error;
  }
}

function isSqliteBusy(error: unknown): boolean {
  return error instanceof Error && error.message.includes("SQLITE_BUSY");
}

export async function moderateComment({
  shareId,
  commentId,
  actorUserId,
  action,
  client = getTursoClient()
}: {
  shareId: string;
  commentId: string;
  actorUserId: string;
  action: CommentModerationAction;
  client?: ShareDbClient;
}): Promise<CommentModerationResult> {
  await ensureShareSchema(client);
  await assertShareInteractionsAllowed(shareId, client);

  const tx = await client.transaction("write");
  try {
    if (action === "hide") {
      const result = await tx.execute({
        sql: `update share_comments
              set hidden_at = coalesce(hidden_at, ?)
              where comment_id = ? and share_id = ?
                and exists (
                  select 1 from board_shares
                  where board_shares.share_id = share_comments.share_id
                    and board_shares.user_id = ?
                )`,
        args: [new Date().toISOString(), commentId, shareId, actorUserId]
      });

      if (result.rowsAffected) {
        await tx.commit();
        return { outcome: "moderated" };
      }
    } else {
      await tx.execute({
        sql: `delete from share_comment_reports
              where comment_id = ? and share_id = ?
                and exists (
                  select 1 from share_comments
                  where share_comments.comment_id = share_comment_reports.comment_id
                    and share_comments.share_id = share_comment_reports.share_id
                    and (
                      share_comments.user_id = ? or exists (
                        select 1 from board_shares
                        where board_shares.share_id = share_comments.share_id
                          and board_shares.user_id = ?
                      )
                    )
                )`,
        args: [commentId, shareId, actorUserId, actorUserId]
      });
      const result = await tx.execute({
        sql: `delete from share_comments
              where comment_id = ? and share_id = ?
                and (
                  user_id = ? or exists (
                    select 1 from board_shares
                    where board_shares.share_id = share_comments.share_id
                      and board_shares.user_id = ?
                  )
                )`,
        args: [commentId, shareId, actorUserId, actorUserId]
      });

      if (result.rowsAffected) {
        await tx.commit();
        return { outcome: "moderated" };
      }
    }

    const target = await tx.execute({
      sql: `select 1 from share_comments
            where comment_id = ? and share_id = ?
            limit 1`,
      args: [commentId, shareId]
    });
    await tx.rollback();
    if (action === "hide") {
      return { outcome: "not_found" };
    }
    return target.rows.length ? { outcome: "forbidden" } : { outcome: "not_found" };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Preserve the database failure as the public operation failure.
    }
    throw error;
  }
}

export function isReactionKind(value: string): value is ReactionKind {
  return REACTION_KINDS.includes(value as ReactionKind);
}

async function assertShareExists(shareId: string) {
  await assertShareInteractionsAllowed(shareId);
  const shareExists = await getTursoClient().execute({
    sql: "select 1 from board_shares where share_id = ? limit 1",
    args: [shareId]
  });

  if (!shareExists.rows.length) {
    throw new Error("Share not found.");
  }
}

export const SHARE_INTERACTIONS_DISABLED = "今期チェックの共有ではコメント・リアクションを利用できません。";

export async function assertShareInteractionsAllowed(shareId: string, client: ShareDbClient = getTursoClient()): Promise<void> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: "select board_json from board_shares where share_id = ?", args: [shareId] });
  if (result.rows[0] && JSON.parse(String(result.rows[0].board_json)).kind === "season-impressions") {
    throw new Error(SHARE_INTERACTIONS_DISABLED);
  }
}

async function getReactionCounts(shareId: string): Promise<ReactionCounts> {
  const result = await getTursoClient().execute({
    sql: `select kind, count(*) as count
          from share_reactions
          where share_id = ?
          group by kind`,
    args: [shareId]
  });
  const counts = createEmptyReactionCounts();

  for (const row of result.rows) {
    const kind = String(row.kind);
    if (isReactionKind(kind)) {
      counts[kind] = typeof row.count === "number" ? row.count : Number(row.count ?? 0);
    }
  }

  return counts;
}

function createEmptyReactionCounts(): ReactionCounts {
  return {
    like: 0,
    agree: 0,
    surprised: 0,
    want_to_watch: 0
  };
}

export function ensureShareSchema(client: ShareDbClient = getTursoClient()): Promise<void> {
  const existing = shareSchemaReady.get(client);
  if (existing) {
    return existing;
  }

  const initialization = initializeShareSchema(client).catch((error) => {
    shareSchemaReady.delete(client);
    throw error;
  });
  shareSchemaReady.set(client, initialization);
  return initialization;
}

async function initializeShareSchema(client: ShareDbClient): Promise<void> {
    await client.execute(`create table if not exists board_shares (
      share_id text primary key,
      user_id text,
      board_json text not null,
      items_json text not null,
      created_at text not null,
      updated_at text not null
    )`);
    await ensureColumn(client, "board_shares", "user_id", "text");
    await client.execute(`create table if not exists canonical_share_mappings (
      owner_id text not null,
      kind text not null,
      season_year integer not null,
      season text not null,
      share_id text not null unique,
      created_at text not null,
      primary key (owner_id, kind, season_year, season)
    )`);
    await client.execute(`insert or ignore into canonical_share_mappings
      (owner_id, kind, season_year, season, share_id, created_at)
      select b.user_id, 'season-impressions',
        cast(json_extract(b.board_json, '$.year') as integer),
        json_extract(b.board_json, '$.season'), b.share_id, b.created_at
      from board_shares b
      where b.user_id is not null
        and json_valid(b.board_json)
        and json_extract(b.board_json, '$.kind') = 'season-impressions'
        and json_extract(b.board_json, '$.season') in ('WINTER', 'SPRING', 'SUMMER', 'FALL')
        and not exists (
          select 1 from board_shares newer
          where newer.user_id = b.user_id
            and json_valid(newer.board_json)
            and json_extract(newer.board_json, '$.kind') = 'season-impressions'
            and json_extract(newer.board_json, '$.year') = json_extract(b.board_json, '$.year')
            and json_extract(newer.board_json, '$.season') = json_extract(b.board_json, '$.season')
            and (newer.updated_at > b.updated_at
              or (newer.updated_at = b.updated_at and newer.created_at > b.created_at)
              or (newer.updated_at = b.updated_at and newer.created_at = b.created_at and newer.share_id > b.share_id))
        )`);
    await client.execute(`create table if not exists share_reactions (
      share_id text not null,
      reaction_key text not null,
      user_id text,
      kind text not null,
      created_at text not null,
      primary key (share_id, reaction_key, kind)
    )`);
    await client.execute(`create table if not exists share_comments (
      comment_id text primary key,
      share_id text not null,
      user_id text not null,
      user_name text,
      user_image text,
      body text not null,
      created_at text not null,
      updated_at text not null,
      hidden_at text
    )`);
    await ensureColumn(client, "share_comments", "hidden_at", "text");
    await client.execute(
      "create unique index if not exists idx_share_comments_share_comment on share_comments(share_id, comment_id)"
    );
    await client.execute(`create table if not exists share_comment_reports (
      share_id text not null,
      comment_id text not null,
      reporter_user_id text not null,
      reason text not null check (reason in ('spam', 'harassment', 'spoiler', 'other')),
      detail text,
      created_at text not null,
      primary key (comment_id, reporter_user_id),
      foreign key (share_id, comment_id)
        references share_comments(share_id, comment_id)
    )`);
    await ensureColumn(client, "share_reactions", "user_id", "text");
    await client.execute(`delete from share_reactions
        where user_id is not null
          and rowid not in (
            select max(rowid)
            from share_reactions
            where user_id is not null
            group by share_id, user_id
          )`);
    await client.execute(
      "create unique index if not exists idx_share_reactions_one_user on share_reactions(share_id, user_id) where user_id is not null"
    );
    await client.execute(
      "create index if not exists idx_board_shares_owner_created on board_shares(user_id, created_at)"
    );
    await client.execute(
      "create index if not exists idx_share_reactions_share on share_reactions(share_id)"
    );
    await client.execute(
      "create index if not exists idx_share_comments_share_created on share_comments(share_id, created_at)"
    );
    await client.execute(
      "create index if not exists idx_share_comment_reports_comment on share_comment_reports(comment_id, share_id)"
    );
    await client.execute(
      "create index if not exists idx_share_comment_reports_reporter on share_comment_reports(reporter_user_id)"
    );
}

async function ensureColumn(
  client: ShareDbClient,
  table: "board_shares" | "share_comments" | "share_reactions",
  column: "user_id" | "hidden_at",
  definition: string
): Promise<void> {
  const before = await client.execute(`pragma table_info(${table})`);
  if (!hasSchemaColumn(before, column)) {
    try {
      await client.execute(`alter table ${table} add column ${column} ${definition}`);
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error;
      }

      // Another isolate may have committed the same ALTER between our PRAGMA
      // and ALTER. Accept that race only after observing the exact column.
      const afterRace = await client.execute(`pragma table_info(${table})`);
      if (!hasSchemaColumn(afterRace, column)) {
        throw error;
      }
    }
  }

  const after = await client.execute(`pragma table_info(${table})`);
  if (!hasSchemaColumn(after, column)) {
    throw new Error(`Schema migration did not create ${table}.${column}.`);
  }
}

function hasSchemaColumn(result: { rows: readonly unknown[] }, column: string): boolean {
  return result.rows.some(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "name" in row &&
      String((row as { name?: unknown }).name) === column
  );
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}

function createShareId(): string {
  return randomBytes(9).toString("base64url");
}
