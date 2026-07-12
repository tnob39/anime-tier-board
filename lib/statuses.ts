import { getTursoClient } from "@/lib/turso";
import type { AnimeItem } from "@/lib/types";

export const VIEWING_STATUSES = ["planned", "watching", "completed", "paused", "dropped"] as const;

export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export const WATCH_RHYTHMS = ["weekly", "batch", "slow"] as const;
export type WatchRhythm = (typeof WATCH_RHYTHMS)[number];

export type AnimeStatusRecord = {
  animeId: string;
  status: ViewingStatus;
  anime: AnimeItem | null;
  favoriteLevel: number | null;
  watchSlot: string | null;
  notes: string | null;
  watchRhythm: WatchRhythm | null;
  watchedEpisodes: number | null;
  updatedAt: string;
};

export type DashboardData = {
  totalStatuses: number;
  statusCounts: Record<ViewingStatus, number>;
  topGenres: Array<{ name: string; count: number }>;
  topVoiceActors: Array<{ name: string; count: number }>;
  recent: AnimeStatusRecord[];
};

let statusSchemaReady: Promise<void> | null = null;
const STATUS_LIST_LIMIT = 500;

export async function listStatuses(userId: string): Promise<AnimeStatusRecord[]> {
  await ensureStatusSchema();

  const result = await getTursoClient().execute({
    sql: `select anime_id, status, anime_json, favorite_level, watch_slot, notes, watch_rhythm, watched_episodes, updated_at
          from user_anime_statuses
          where user_id = ?
          order by updated_at desc
          limit ?`,
    args: [userId, STATUS_LIST_LIMIT]
  });

  return result.rows
    .map((row) => {
      const status = String(row.status);
      if (!isViewingStatus(status)) {
        return null;
      }

      return {
        animeId: String(row.anime_id),
        status,
        anime: parseAnime(row.anime_json),
        favoriteLevel: normalizeFavoriteLevel(row.favorite_level),
        watchSlot: row.watch_slot ? String(row.watch_slot) : null,
        notes: row.notes ? String(row.notes) : null,
        watchRhythm: normalizeWatchRhythm(row.watch_rhythm),
        watchedEpisodes: normalizeWatchedEpisodes(row.watched_episodes),
        updatedAt: String(row.updated_at)
      };
    })
    .filter((record): record is AnimeStatusRecord => Boolean(record));
}

export async function saveStatus({
  userId,
  animeId,
  status,
  anime
}: {
  userId: string;
  animeId: string;
  status: ViewingStatus;
  anime: AnimeItem;
}) {
  await ensureStatusSchema();

  const now = new Date().toISOString();
  await getTursoClient().execute({
    sql: `insert into user_anime_statuses
            (user_id, anime_id, status, anime_json, updated_at)
          values (?, ?, ?, ?, ?)
          on conflict(user_id, anime_id)
          do update set status = excluded.status,
                        anime_json = excluded.anime_json,
                        updated_at = excluded.updated_at`,
    args: [userId, animeId, status, JSON.stringify(anime), now]
  });
}

export async function deleteStatus(userId: string, animeId: string) {
  await ensureStatusSchema();

  await getTursoClient().execute({
    sql: "delete from user_anime_statuses where user_id = ? and anime_id = ?",
    args: [userId, animeId]
  });
}

export async function updateWatchRhythm({
  userId,
  animeId,
  watchRhythm
}: {
  userId: string;
  animeId: string;
  watchRhythm: WatchRhythm | null;
}) {
  await ensureStatusSchema();

  const now = new Date().toISOString();
  await getTursoClient().execute({
    sql: `update user_anime_statuses
          set watch_rhythm = ?, updated_at = ?
          where user_id = ? and anime_id = ?`,
    args: [watchRhythm, now, userId, animeId]
  });
}

export type PatchStatusOutcome =
  | { kind: "updated"; item: AnimeStatusRecord }
  | { kind: "not_found" }
  | { kind: "conflict" };

export async function patchStatusAndWatchedEpisodes({
  userId,
  animeId,
  status,
  watchedEpisodes,
  expectedUpdatedAt
}: {
  userId: string;
  animeId: string;
  status: ViewingStatus;
  watchedEpisodes: number | null;
  expectedUpdatedAt: string;
}): Promise<PatchStatusOutcome> {
  await ensureStatusSchema();

  const now = new Date().toISOString();
  const updateResult = await getTursoClient().execute({
    sql: `update user_anime_statuses
          set status = ?,
              watched_episodes = ?,
              updated_at = ?
          where user_id = ? and anime_id = ? and updated_at = ?`,
    args: [status, watchedEpisodes, now, userId, animeId, expectedUpdatedAt]
  });

  if ((updateResult.rowsAffected ?? 0) > 0) {
    const item = await getStatusRecord(userId, animeId);
    if (!item) {
      return { kind: "not_found" };
    }

    return { kind: "updated", item };
  }

  const existing = await getTursoClient().execute({
    sql: "select 1 from user_anime_statuses where user_id = ? and anime_id = ? limit 1",
    args: [userId, animeId]
  });

  if (existing.rows.length === 0) {
    return { kind: "not_found" };
  }

  return { kind: "conflict" };
}

export async function updateTrackingDetails({
  userId,
  animeId,
  favoriteLevel,
  watchSlot,
  notes,
  watchedEpisodes
}: {
  userId: string;
  animeId: string;
  favoriteLevel: number | null;
  watchSlot: string | null;
  notes: string | null;
  watchedEpisodes: number | null;
}) {
  await ensureStatusSchema();

  const normalizedFavoriteLevel =
    typeof favoriteLevel === "number"
      ? Math.min(5, Math.max(1, Math.trunc(favoriteLevel)))
      : null;
  const normalizedWatchSlot = normalizeOptionalText(watchSlot, 80);
  const normalizedNotes = normalizeOptionalText(notes, 500);
  const normalizedWatchedEpisodes = normalizeWatchedEpisodes(watchedEpisodes);
  const now = new Date().toISOString();

  await getTursoClient().execute({
    sql: `update user_anime_statuses
          set favorite_level = ?,
              watch_slot = ?,
              notes = ?,
              watched_episodes = ?,
              updated_at = ?
          where user_id = ? and anime_id = ?`,
    args: [
      normalizedFavoriteLevel,
      normalizedWatchSlot,
      normalizedNotes,
      normalizedWatchedEpisodes,
      now,
      userId,
      animeId
    ]
  });
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  const records = await listStatuses(userId);
  const statusCounts = createEmptyStatusCounts();
  const genreCounts = new Map<string, number>();
  const voiceActorCounts = new Map<string, number>();

  for (const record of records) {
    statusCounts[record.status] += 1;

    for (const genre of record.anime?.genres ?? []) {
      addCount(genreCounts, genre);
    }

    for (const actor of record.anime?.voiceActors ?? []) {
      addCount(voiceActorCounts, actor.name);
    }
  }

  return {
    totalStatuses: records.length,
    statusCounts,
    topGenres: topCounts(genreCounts),
    topVoiceActors: topCounts(voiceActorCounts),
    recent: records.slice(0, 12)
  };
}

export function isViewingStatus(value: string): value is ViewingStatus {
  return VIEWING_STATUSES.includes(value as ViewingStatus);
}

export function ensureStatusSchema() {
  statusSchemaReady ??= (async () => {
    const client = getTursoClient();

    await client.execute(`create table if not exists user_anime_statuses (
      user_id text not null,
      anime_id text not null,
      status text not null,
      anime_json text not null,
      favorite_level integer,
      watch_slot text,
      notes text,
      watched_episodes integer,
      updated_at text not null,
      primary key (user_id, anime_id)
    )`);
    await client
      .execute("alter table user_anime_statuses add column favorite_level integer")
      .catch(() => undefined);
    await client
      .execute("alter table user_anime_statuses add column watch_slot text")
      .catch(() => undefined);
    await client
      .execute("alter table user_anime_statuses add column notes text")
      .catch(() => undefined);
    await client
      .execute("alter table user_anime_statuses add column watch_rhythm text")
      .catch(() => undefined);
    await client
      .execute("alter table user_anime_statuses add column watched_episodes integer")
      .catch(() => undefined);
  })();

  return statusSchemaReady;
}

async function getStatusRecord(userId: string, animeId: string): Promise<AnimeStatusRecord | null> {
  const result = await getTursoClient().execute({
    sql: `select anime_id, status, anime_json, favorite_level, watch_slot, notes, watch_rhythm, watched_episodes, updated_at
          from user_anime_statuses
          where user_id = ? and anime_id = ?
          limit 1`,
    args: [userId, animeId]
  });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const recordStatus = String(row.status);
  if (!isViewingStatus(recordStatus)) {
    return null;
  }

  return {
    animeId: String(row.anime_id),
    status: recordStatus,
    anime: parseAnime(row.anime_json),
    favoriteLevel: normalizeFavoriteLevel(row.favorite_level),
    watchSlot: row.watch_slot ? String(row.watch_slot) : null,
    notes: row.notes ? String(row.notes) : null,
    watchRhythm: normalizeWatchRhythm(row.watch_rhythm),
    watchedEpisodes: normalizeWatchedEpisodes(row.watched_episodes),
    updatedAt: String(row.updated_at)
  };
}

function createEmptyStatusCounts(): Record<ViewingStatus, number> {
  return {
    planned: 0,
    watching: 0,
    completed: 0,
    paused: 0,
    dropped: 0
  };
}

function parseAnime(value: unknown): AnimeItem | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value) as AnimeItem;
  } catch {
    return null;
  }
}

function normalizeWatchRhythm(value: unknown): WatchRhythm | null {
  if (typeof value !== "string") return null;
  return WATCH_RHYTHMS.includes(value as WatchRhythm) ? (value as WatchRhythm) : null;
}

function normalizeFavoriteLevel(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null;
  }

  return Math.min(5, Math.max(1, Math.trunc(numeric)));
}

function normalizeWatchedEpisodes(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.trunc(numeric);
}

function normalizeOptionalText(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function addCount(counts: Map<string, number>, rawName: string) {
  const name = rawName.trim();
  if (!name) {
    return;
  }

  counts.set(name, (counts.get(name) ?? 0) + 1);
}

function topCounts(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}
