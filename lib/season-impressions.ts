import { getTursoClient } from "@/lib/turso";
import type { ImpressionInput, ImpressionSeason, ImpressionSeasonState, ImpressionRevisionCursor, SeasonImpression } from "@/lib/season-impressions-model";

type Client = ReturnType<typeof getTursoClient>;
const ready = new WeakMap<object, Promise<void>>();

export function ensureImpressionSchema(client: Client = getTursoClient()): Promise<void> {
  const existing = ready.get(client);
  if (existing) return existing;
  const initialization = client.execute(`create table if not exists season_impressions (
    user_id text not null,
    season_year integer not null,
    season text not null check (season in ('WINTER', 'SPRING', 'SUMMER', 'FALL')),
    anime_id text not null,
    anime_json text not null,
    checked_at text not null,
    rating text check (rating in ('liked', 'neutral', 'not_for_me')),
    note text check (length(note) <= 140),
    spoiler text not null check (spoiler in ('unspecified', 'no_spoiler', 'has_spoiler')),
    revision integer not null,
    updated_at text not null,
    deleted_at text,
    primary key (user_id, season_year, season, anime_id)
  )`).then(() => {}).catch((error) => { ready.delete(client); throw error; });
  ready.set(client, initialization);
  return initialization;
}

export function impressionFromRow(row: Record<string, unknown>): SeasonImpression {
  return { year: Number(row.season_year), season: row.season as ImpressionSeason["season"],
    anime: JSON.parse(String(row.anime_json)), rating: row.rating as SeasonImpression["rating"],
    note: row.note == null ? null : String(row.note), spoiler: row.spoiler as SeasonImpression["spoiler"],
    revision: Number(row.revision), checkedAt: String(row.checked_at), updatedAt: String(row.updated_at) };
}

export async function listSeasonImpressions(userId: string, key: ImpressionSeason, client: Client = getTursoClient()): Promise<SeasonImpression[]> {
  await ensureImpressionSchema(client);
  const result = await client.execute({ sql: `select * from season_impressions
    where user_id = ? and season_year = ? and season = ? and deleted_at is null order by checked_at, anime_id`, args: [userId, key.year, key.season] });
  return result.rows.map(impressionFromRow);
}

/** One owner-scoped read supplies the active rows and the cursors needed for deliberate recreation. */
export async function readImpressionSeasonState(userId: string, key: ImpressionSeason, client: Client = getTursoClient()): Promise<ImpressionSeasonState> {
  await ensureImpressionSchema(client);
  const result = await client.execute({ sql: `select * from season_impressions
    where user_id = ? and season_year = ? and season = ? order by checked_at, anime_id`, args: [userId, key.year, key.season] });
  return {
    impressions: result.rows.filter((row) => row.deleted_at == null).map(impressionFromRow),
    deletedRevisions: result.rows.filter((row) => row.deleted_at != null)
      .map((row) => ({ animeId: String(row.anime_id), revision: Number(row.revision) }))
  };
}

export async function saveSeasonImpression(userId: string, input: ImpressionInput, client: Client = getTursoClient()): Promise<SeasonImpression | null> {
  await ensureImpressionSchema(client);
  const now = new Date().toISOString();
  if (input.revision === 0) {
    const result = await client.execute({
      sql: `insert into season_impressions
      (user_id, season_year, season, anime_id, anime_json, checked_at, rating, note, spoiler, revision, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      on conflict (user_id, season_year, season, anime_id) do nothing
      returning *`,
      args: [userId, input.year, input.season, input.anime.id, JSON.stringify(input.anime), now, input.rating, input.note, input.spoiler, now]
    });
    return result.rows[0] ? impressionFromRow(result.rows[0]) : null;
  }
  const updated = await client.execute({ sql: `update season_impressions set anime_json = ?, rating = ?, note = ?, spoiler = ?,
    revision = revision + 1, updated_at = ?, checked_at = case when deleted_at is not null then ? else checked_at end, deleted_at = null
    where user_id = ? and season_year = ? and season = ? and anime_id = ? and revision = ? returning *`,
    args: [JSON.stringify(input.anime), input.rating, input.note, input.spoiler, now, now, userId, input.year, input.season, input.anime.id, input.revision] });
  return updated.rows[0] ? impressionFromRow(updated.rows[0]) : null;
}

export async function deleteSeasonImpression(userId: string, animeId: string, key: ImpressionSeason & { revision: number }, client: Client = getTursoClient()): Promise<ImpressionRevisionCursor | null> {
  await ensureImpressionSchema(client);
  // Erase content but retain the revision tombstone so delete/recreate cannot accept a stale edit.
  const result = await client.execute({ sql: `update season_impressions set anime_json = '{}', rating = null, note = null,
    spoiler = 'unspecified', revision = revision + 1, deleted_at = ?, updated_at = ?
    where user_id = ? and season_year = ? and season = ? and anime_id = ? and revision = ? and deleted_at is null returning revision`,
    args: [new Date().toISOString(), new Date().toISOString(), userId, key.year, key.season, animeId, key.revision] });
  return result.rows[0] ? { animeId, revision: Number(result.rows[0].revision) } : null;
}
