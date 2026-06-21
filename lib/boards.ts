import { getTursoClient } from "@/lib/turso";
import type { AnimeSeason } from "@/lib/types";

export type PersistedBoard = {
  version: number;
  season: AnimeSeason;
  seasonYear: number;
  tiers: Array<{
    id: string;
    label: string;
    color: string;
    itemIds: string[];
    locked?: boolean;
  }>;
  updatedAt: string;
};

let schemaReady: Promise<void> | null = null;

export async function getBoard(
  userId: string,
  seasonYear: number,
  season: AnimeSeason
): Promise<PersistedBoard | null> {
  await ensureSchema();

  const result = await getTursoClient().execute({
    sql: `select board_json from tier_boards
          where user_id = ? and season_year = ? and season = ?
          limit 1`,
    args: [userId, seasonYear, season]
  });
  const raw = result.rows[0]?.board_json;

  if (typeof raw !== "string") {
    return null;
  }

  return JSON.parse(raw) as PersistedBoard;
}

export async function saveBoard(
  userId: string,
  board: PersistedBoard,
  options?: { expectedUpdatedAt?: string | null }
): Promise<"saved" | "conflict"> {
  await ensureSchema();

  if (options?.expectedUpdatedAt) {
    const existing = await getBoard(userId, board.seasonYear, board.season);
    if (existing && existing.updatedAt > options.expectedUpdatedAt) {
      return "conflict";
    }
  }

  await getTursoClient().execute({
    sql: `insert into tier_boards
            (user_id, season_year, season, board_json, updated_at)
          values (?, ?, ?, ?, ?)
          on conflict(user_id, season_year, season)
          do update set board_json = excluded.board_json,
                        updated_at = excluded.updated_at`,
    args: [
      userId,
      board.seasonYear,
      board.season,
      JSON.stringify(board),
      board.updatedAt
    ]
  });

  return "saved";
}

function ensureSchema() {
  schemaReady ??= getTursoClient()
    .execute(`create table if not exists tier_boards (
      user_id text not null,
      season_year integer not null,
      season text not null,
      board_json text not null,
      updated_at text not null,
      primary key (user_id, season_year, season)
    )`)
    .then(() => undefined);

  return schemaReady;
}
