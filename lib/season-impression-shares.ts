import { randomBytes } from "node:crypto";
import { getTursoClient } from "@/lib/turso";
import { ensureShareSchema } from "@/lib/shares";
import { ensureImpressionSchema, impressionFromRow } from "@/lib/season-impressions";
import { buildImpressionSnapshot, type ImpressionShare, type ImpressionShareHistory, type ImpressionShareInput, type ImpressionSnapshot } from "@/lib/season-impressions-model";

type Client = ReturnType<typeof getTursoClient>;

export async function createImpressionShare(userId: string, input: ImpressionShareInput, client: Client = getTursoClient()): Promise<string | null> {
  await ensureImpressionSchema(client);
  await ensureShareSchema(client);
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({ sql: `select * from season_impressions
      where user_id = ? and season_year = ? and season = ? and deleted_at is null`, args: [userId, input.year, input.season] });
    const snapshot = buildImpressionSnapshot(input, result.rows.map(impressionFromRow));
    if (!snapshot) { await tx.rollback(); return null; }
    const { items, ...board } = snapshot;
    const shareId = randomBytes(18).toString("base64url");
    const now = new Date().toISOString();
    await tx.execute({ sql: `insert into board_shares (share_id, user_id, board_json, items_json, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)`, args: [shareId, userId, JSON.stringify(board), JSON.stringify(items), now, now] });
    await tx.commit();
    return shareId;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally { tx.close(); }
}

export async function getImpressionShare(shareId: string, client: Client = getTursoClient()): Promise<ImpressionShare | null> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: `select share_id, board_json, items_json, created_at from board_shares
    where share_id = ? and json_extract(board_json, '$.kind') = 'season-impressions'`, args: [shareId] });
  const row = result.rows[0];
  if (!row) return null;
  const board = JSON.parse(String(row.board_json)) as ImpressionSnapshot;
  return { kind: "season-impressions", version: 1, year: board.year, season: board.season,
    items: JSON.parse(String(row.items_json)), shareId: String(row.share_id), createdAt: String(row.created_at) };
}

export async function listImpressionShares(userId: string, client: Client = getTursoClient()): Promise<ImpressionShareHistory[]> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: `select share_id, board_json, created_at from board_shares
    where user_id = ? and json_extract(board_json, '$.kind') = 'season-impressions' order by created_at desc`, args: [userId] });
  return result.rows.map((row) => {
    const board = JSON.parse(String(row.board_json)) as ImpressionSnapshot;
    return { shareId: String(row.share_id), year: board.year, season: board.season, createdAt: String(row.created_at) };
  });
}

export async function stopImpressionShare(userId: string, shareId: string, client: Client = getTursoClient()): Promise<boolean> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: `delete from board_shares
    where share_id = ? and user_id = ? and json_extract(board_json, '$.kind') = 'season-impressions'`, args: [shareId, userId] });
  return result.rowsAffected > 0;
}
