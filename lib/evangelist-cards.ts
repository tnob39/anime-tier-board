import { randomBytes } from "node:crypto";
import { getTursoClient } from "@/lib/turso";
import { getStreamingProviders, type StreamingProvider } from "@/lib/streaming-services";
import type { AnimeItem } from "@/lib/types";

export type EvangelistCardMeta = {
  season?: string | null;
  seasonYear?: number | null;
  genres?: string[];
};

export type EvangelistCardRecord = {
  id: string;
  userId: string;
  animeId: string;
  animeTitle: string;
  animeImageUrl: string | null;
  animeProviders: StreamingProvider[];
  animeMeta: EvangelistCardMeta | null;
  comment: string;
  authorName: string | null;
  authorImage: string | null;
  viewCount: number;
  createdAt: string;
};

export type EvangelistCardResponse = {
  id: string;
  anime: {
    title: string;
    imageUrl: string | null;
    providers: StreamingProvider[];
    meta: EvangelistCardMeta | null;
  };
  comment: string;
  authorName: string | null;
  authorImage: string | null;
  viewCount: number;
  createdAt: string;
};

let evangelistSchemaReady: Promise<void> | null = null;
const MAX_COMMENT_LENGTH = 50;

export async function createEvangelistCard({
  userId,
  animeId,
  comment,
  anime,
  authorName,
  authorImage
}: {
  userId: string;
  animeId: string;
  comment: string;
  anime: AnimeItem;
  authorName?: string | null;
  authorImage?: string | null;
}): Promise<string> {
  await ensureEvangelistSchema();

  const normalizedComment = normalizeComment(comment);
  if (!normalizedComment) {
    throw new Error("コメントを入力してください。");
  }

  const cardId = createCardId();
  const providers = extractProvidersFromAnime(anime);
  const meta = extractMetaFromAnime(anime);

  await getTursoClient().execute({
    sql: `insert into evangelist_cards
            (id, user_id, anime_id, anime_title, anime_image_url, anime_providers, anime_meta,
             comment, author_name, author_image, view_count, created_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    args: [
      cardId,
      userId,
      animeId,
      anime.title,
      anime.proxiedImageUrl || anime.imageUrl || null,
      JSON.stringify(providers),
      meta ? JSON.stringify(meta) : null,
      normalizedComment,
      authorName?.trim() || null,
      authorImage?.trim() || null
    ]
  });

  return cardId;
}

export async function getEvangelistCard(
  cardId: string,
  options: { incrementView?: boolean } = {}
): Promise<EvangelistCardRecord | null> {
  await ensureEvangelistSchema();

  if (options.incrementView) {
    await getTursoClient().execute({
      sql: `update evangelist_cards
            set view_count = view_count + 1
            where id = ?`,
      args: [cardId]
    });
  }

  const result = await getTursoClient().execute({
    sql: `select id, user_id, anime_id, anime_title, anime_image_url, anime_providers, anime_meta,
                 comment, author_name, author_image, view_count, created_at
          from evangelist_cards
          where id = ?
          limit 1`,
    args: [cardId]
  });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRow(row);
}

export async function listEvangelistCardsByUser(userId: string): Promise<EvangelistCardRecord[]> {
  await ensureEvangelistSchema();

  const result = await getTursoClient().execute({
    sql: `select id, user_id, anime_id, anime_title, anime_image_url, anime_providers, anime_meta,
                 comment, author_name, author_image, view_count, created_at
          from evangelist_cards
          where user_id = ?
          order by created_at desc`,
    args: [userId]
  });

  return result.rows.map((row) => mapRow(row));
}

export function toEvangelistCardResponse(card: EvangelistCardRecord): EvangelistCardResponse {
  return {
    id: card.id,
    anime: {
      title: card.animeTitle,
      imageUrl: card.animeImageUrl,
      providers: card.animeProviders,
      meta: card.animeMeta
    },
    comment: card.comment,
    authorName: card.authorName,
    authorImage: card.authorImage,
    viewCount: card.viewCount,
    createdAt: card.createdAt
  };
}

export function normalizeComment(comment: string): string | null {
  const trimmed = comment.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_COMMENT_LENGTH);
}

export function isValidComment(comment: string): boolean {
  const trimmed = comment.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH;
}

export function ensureEvangelistSchema() {
  evangelistSchemaReady ??= (async () => {
    const client = getTursoClient();

    await client.execute(`create table if not exists evangelist_cards (
      id text primary key,
      user_id text not null,
      anime_id text not null,
      anime_title text not null,
      anime_image_url text,
      anime_providers text,
      comment text not null,
      view_count integer default 0,
      created_at text not null default (datetime('now'))
    )`);
    await client
      .execute("alter table evangelist_cards add column author_name text")
      .catch(() => undefined);
    await client
      .execute("alter table evangelist_cards add column author_image text")
      .catch(() => undefined);
    await client
      .execute("alter table evangelist_cards add column anime_meta text")
      .catch(() => undefined);
    await client.execute(
      "create index if not exists idx_evangelist_cards_user_created on evangelist_cards(user_id, created_at)"
    );
  })();

  return evangelistSchemaReady;
}

function mapRow(row: Record<string, unknown>): EvangelistCardRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    animeId: String(row.anime_id),
    animeTitle: String(row.anime_title),
    animeImageUrl: row.anime_image_url ? String(row.anime_image_url) : null,
    animeProviders: parseProviders(row.anime_providers),
    animeMeta: parseMeta(row.anime_meta),
    comment: String(row.comment),
    authorName: row.author_name ? String(row.author_name) : null,
    authorImage: row.author_image ? String(row.author_image) : null,
    viewCount:
      typeof row.view_count === "number" ? row.view_count : Number(row.view_count ?? 0),
    createdAt: String(row.created_at)
  };
}

function parseProviders(value: unknown): StreamingProvider[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as StreamingProvider[];
    return Array.isArray(parsed)
      ? parsed.filter((provider) => provider.name && provider.url)
      : [];
  } catch {
    return [];
  }
}

function parseMeta(value: unknown): EvangelistCardMeta | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value) as EvangelistCardMeta;
  } catch {
    return null;
  }
}

function extractProvidersFromAnime(anime: AnimeItem): StreamingProvider[] {
  return getStreamingProviders(anime);
}

function extractMetaFromAnime(anime: AnimeItem): EvangelistCardMeta | null {
  const meta: EvangelistCardMeta = {
    season: anime.season ?? null,
    seasonYear: anime.seasonYear ?? null,
    genres: anime.genres?.slice(0, 3) ?? []
  };

  if (!meta.season && !meta.seasonYear && !meta.genres?.length) {
    return null;
  }

  return meta;
}

function createCardId(): string {
  return randomBytes(9).toString("base64url");
}