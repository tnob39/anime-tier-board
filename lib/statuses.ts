import { getTursoClient } from "@/lib/turso";
import type { AnimeItem } from "@/lib/types";

export const VIEWING_STATUSES = ["planned", "watching", "completed", "paused", "dropped"] as const;

export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export type AnimeStatusRecord = {
  animeId: string;
  status: ViewingStatus;
  anime: AnimeItem | null;
  updatedAt: string;
};

export type DashboardData = {
  totalStatuses: number;
  statusCounts: Record<ViewingStatus, number>;
  topGenres: Array<{ name: string; count: number }>;
  topStudios: Array<{ name: string; count: number }>;
  topVoiceActors: Array<{ name: string; count: number }>;
  recent: AnimeStatusRecord[];
};

let statusSchemaReady: Promise<void> | null = null;
const STATUS_LIST_LIMIT = 500;

export async function listStatuses(userId: string): Promise<AnimeStatusRecord[]> {
  await ensureStatusSchema();

  const result = await getTursoClient().execute({
    sql: `select anime_id, status, anime_json, updated_at
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

export async function getDashboard(userId: string): Promise<DashboardData> {
  const records = await listStatuses(userId);
  const statusCounts = createEmptyStatusCounts();
  const genreCounts = new Map<string, number>();
  const studioCounts = new Map<string, number>();
  const voiceActorCounts = new Map<string, number>();

  for (const record of records) {
    statusCounts[record.status] += 1;

    for (const genre of record.anime?.genres ?? []) {
      addCount(genreCounts, genre);
    }

    for (const studio of record.anime?.studios ?? []) {
      addCount(studioCounts, studio.name);
    }

    for (const actor of record.anime?.voiceActors ?? []) {
      addCount(voiceActorCounts, actor.name);
    }
  }

  return {
    totalStatuses: records.length,
    statusCounts,
    topGenres: topCounts(genreCounts),
    topStudios: topCounts(studioCounts),
    topVoiceActors: topCounts(voiceActorCounts),
    recent: records.slice(0, 12)
  };
}

export function isViewingStatus(value: string): value is ViewingStatus {
  return VIEWING_STATUSES.includes(value as ViewingStatus);
}

function ensureStatusSchema() {
  statusSchemaReady ??= getTursoClient()
    .execute(`create table if not exists user_anime_statuses (
      user_id text not null,
      anime_id text not null,
      status text not null,
      anime_json text not null,
      updated_at text not null,
      primary key (user_id, anime_id)
    )`)
    .then(() => undefined);

  return statusSchemaReady;
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
