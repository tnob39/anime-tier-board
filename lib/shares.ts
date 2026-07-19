import { randomBytes } from "node:crypto";
import { getTursoClient } from "@/lib/turso";
import type { AnimeStatusRecord, DashboardData } from "@/lib/statuses";
import type { AnimeItem, AnimeSeason } from "@/lib/types";

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

let shareSchemaReady: Promise<void> | null = null;
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

  return {
    shareId: String(row.share_id),
    board: JSON.parse(row.board_json) as SharedBoard,
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

export async function listComments(shareId: string): Promise<ShareComment[]> {
  await ensureShareSchema();

  const result = await getTursoClient().execute({
    sql: `select comment_id, body, user_name, user_image, created_at, updated_at
          from share_comments
          where share_id = ?
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

export function isReactionKind(value: string): value is ReactionKind {
  return REACTION_KINDS.includes(value as ReactionKind);
}

async function assertShareExists(shareId: string) {
  const shareExists = await getTursoClient().execute({
    sql: "select 1 from board_shares where share_id = ? limit 1",
    args: [shareId]
  });

  if (!shareExists.rows.length) {
    throw new Error("Share not found.");
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

function ensureShareSchema() {
  shareSchemaReady ??= (async () => {
    const client = getTursoClient();

    await client.execute(`create table if not exists board_shares (
      share_id text primary key,
      user_id text,
      board_json text not null,
      items_json text not null,
      created_at text not null,
      updated_at text not null
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
      updated_at text not null
    )`);
    await client
      .execute("alter table board_shares add column user_id text")
      .catch(() => undefined);
    await client
      .execute("alter table share_reactions add column user_id text")
      .catch(() => undefined);
    await client
      .execute(`delete from share_reactions
        where user_id is not null
          and rowid not in (
            select max(rowid)
            from share_reactions
            where user_id is not null
            group by share_id, user_id
          )`)
      .catch(() => undefined);
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
  })();

  return shareSchemaReady;
}

function createShareId(): string {
  return randomBytes(9).toString("base64url");
}
