import { randomBytes } from "node:crypto";
import type { AnimeSeason } from "@/lib/types";
import { normalizeSeason } from "@/lib/season";
import { getTursoClient } from "@/lib/turso";

export type SeasonShareRecord = {
  id: string;
  userId: string;
  season: AnimeSeason;
  seasonYear: number;
  statuses: string[];
  comment: string | null;
};

let seasonShareSchemaReady: Promise<void> | null = null;

export function ensureSeasonShareSchema() {
  seasonShareSchemaReady ??= (async () => {
    const client = getTursoClient();

    await client.execute(`create table if not exists season_share (
      id text primary key,
      user_id text not null,
      season text not null,
      season_year integer not null,
      statuses text not null,
      comment text,
      created_at text not null default (datetime('now')),
      unique(user_id, season, season_year)
    )`);
    await client
      .execute("alter table season_share add column comment text")
      .catch(() => undefined);
  })();

  return seasonShareSchemaReady;
}

export async function createSeasonShare({
  userId,
  season,
  seasonYear,
  statuses,
  comment
}: {
  userId: string;
  season: AnimeSeason;
  seasonYear: number;
  statuses: string[];
  comment: string | null;
}): Promise<string> {
  await ensureSeasonShareSchema();

  const id = randomBytes(9).toString("base64url");
  const client = getTursoClient();
  await client.execute({
    sql: `insert into season_share
            (id, user_id, season, season_year, statuses, comment)
          values (?, ?, ?, ?, ?, ?)
          on conflict(user_id, season, season_year)
          do update set statuses = excluded.statuses,
                        comment = excluded.comment`,
    args: [id, userId, season, seasonYear, statuses.join(","), comment]
  });

  const result = await client.execute({
    sql: `select id from season_share
          where user_id = ? and season = ? and season_year = ?
          limit 1`,
    args: [userId, season, seasonYear]
  });

  return String(result.rows[0].id);
}

export async function getSeasonShare(id: string): Promise<SeasonShareRecord | null> {
  await ensureSeasonShareSchema();

  const result = await getTursoClient().execute({
    sql: `select id, user_id, season, season_year, statuses, comment
          from season_share
          where id = ?
          limit 1`,
    args: [id]
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const season = normalizeSeason(String(row.season));
  if (!season) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    season,
    seasonYear: Number(row.season_year),
    statuses: String(row.statuses)
      .split(",")
      .filter(Boolean),
    comment: row.comment ? String(row.comment) : null
  };
}
