import { randomBytes } from "node:crypto";
import { getTursoClient } from "@/lib/turso";
import { ensureShareSchema } from "@/lib/shares";
import { ensureImpressionSchema, impressionFromRow } from "@/lib/season-impressions";
import { buildImpressionSnapshot, type ImpressionShare, type ImpressionShareHistory, type ImpressionShareInput, type ImpressionSnapshot } from "@/lib/season-impressions-model";

type Client = ReturnType<typeof getTursoClient>;
type WriteTransaction = Awaited<ReturnType<Client["transaction"]>>;
let localWriteQueue: Promise<void> = Promise.resolve();

export type PublishImpressionShareResult = { shareId: string; operation: "created" | "updated" | "existing"; updatedAt: string };

export async function publishImpressionShare(userId: string, input: ImpressionShareInput, client: Client = getTursoClient()): Promise<PublishImpressionShareResult | null> {
  await ensureImpressionSchema(client);
  await ensureShareSchema(client);
  const release = await acquireLocalWriteSlot();
  let tx: WriteTransaction;
  try { tx = await beginWriteTransaction(client); }
  catch (error) { release(); throw error; }
  try {
    const result = await tx.execute({ sql: `select * from season_impressions
      where user_id = ? and season_year = ? and season = ? and deleted_at is null`, args: [userId, input.year, input.season] });
    const snapshot = buildImpressionSnapshot(input, result.rows.map(impressionFromRow));
    if (!snapshot) { await tx.rollback(); return null; }
    const { items, ...board } = snapshot;
    const now = new Date().toISOString();
    const mapped = await tx.execute({ sql: `select m.share_id, s.updated_at from canonical_share_mappings m
      join board_shares s on s.share_id = m.share_id
      where m.owner_id = ? and m.kind = 'season-impressions' and m.season_year = ? and m.season = ?`,
      args: [userId, input.year, input.season] });
    if (mapped.rows[0]) {
      const shareId = String(mapped.rows[0].share_id);
      const updatedAt = String(mapped.rows[0].updated_at);
      if (input.targetShareId === null && input.expectedUpdatedAt === null) {
        await tx.commit();
        return { shareId, operation: "existing", updatedAt };
      }
      if (input.targetShareId !== shareId || input.expectedUpdatedAt !== updatedAt) { await tx.rollback(); return null; }
      const nextUpdatedAt = new Date(Math.max(Date.now(), Date.parse(updatedAt) + 1)).toISOString();
      const updated = await tx.execute({ sql: `update board_shares set board_json = ?, items_json = ?, updated_at = ?
        where share_id = ? and user_id = ? and updated_at = ? and json_extract(board_json, '$.kind') = 'season-impressions'
          and json_extract(board_json, '$.year') = ? and json_extract(board_json, '$.season') = ?`,
        args: [JSON.stringify(board), JSON.stringify(items), nextUpdatedAt, shareId, userId, updatedAt, input.year, input.season] });
      if (updated.rowsAffected !== 1) { await tx.rollback(); return null; }
      await tx.commit();
      return { shareId, operation: "updated", updatedAt: nextUpdatedAt };
    }
    if (input.targetShareId !== null || input.expectedUpdatedAt !== null) { await tx.rollback(); return null; }
    const shareId = randomBytes(18).toString("base64url");
    await tx.execute({ sql: `insert into board_shares (share_id, user_id, board_json, items_json, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)`, args: [shareId, userId, JSON.stringify(board), JSON.stringify(items), now, now] });
    const claimed = await tx.execute({ sql: `insert or ignore into canonical_share_mappings
      (owner_id, kind, season_year, season, share_id, created_at) values (?, 'season-impressions', ?, ?, ?, ?)`,
      args: [userId, input.year, input.season, shareId, now] });
    if (claimed.rowsAffected !== 1) {
      await tx.execute({ sql: "delete from board_shares where share_id = ?", args: [shareId] });
      await tx.rollback();
      return null;
    }
    await tx.commit();
    return { shareId, operation: "created", updatedAt: now };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally { tx.close(); release(); }
}

export async function createImpressionShare(userId: string, input: ImpressionShareInput, client: Client = getTursoClient()): Promise<string | null> {
  return (await publishImpressionShare(userId, { ...input, targetShareId: null, expectedUpdatedAt: null }, client))?.shareId ?? null;
}

export async function getImpressionShare(shareId: string, client: Client = getTursoClient()): Promise<ImpressionShare | null> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: `select share_id, board_json, items_json, created_at, updated_at from board_shares
    where share_id = ? and json_extract(board_json, '$.kind') = 'season-impressions'`, args: [shareId] });
  const row = result.rows[0];
  if (!row) return null;
  const board = JSON.parse(String(row.board_json)) as ImpressionSnapshot;
  return { kind: "season-impressions", version: 1, year: board.year, season: board.season,
    items: JSON.parse(String(row.items_json)), shareId: String(row.share_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export async function listImpressionShares(userId: string, client: Client = getTursoClient()): Promise<ImpressionShareHistory[]> {
  await ensureShareSchema(client);
  const result = await client.execute({ sql: `select s.share_id, s.board_json, s.created_at, s.updated_at,
      case when m.share_id is null then 0 else 1 end as canonical
    from board_shares s left join canonical_share_mappings m on m.share_id = s.share_id
    where s.user_id = ? and json_extract(s.board_json, '$.kind') = 'season-impressions'
    order by canonical desc, s.updated_at desc, s.created_at desc`, args: [userId] });
  return result.rows.map((row) => {
    const board = JSON.parse(String(row.board_json)) as ImpressionSnapshot;
    return { shareId: String(row.share_id), year: board.year, season: board.season, createdAt: String(row.created_at), updatedAt: String(row.updated_at), canonical: Number(row.canonical) === 1 };
  });
}

export async function stopImpressionShare(userId: string, shareId: string, client: Client = getTursoClient()): Promise<boolean> {
  await ensureShareSchema(client);
  const release = await acquireLocalWriteSlot();
  let tx: WriteTransaction;
  try { tx = await beginWriteTransaction(client); }
  catch (error) { release(); throw error; }
  try {
    await tx.execute({ sql: "delete from canonical_share_mappings where share_id = ? and owner_id = ? and kind = 'season-impressions'", args: [shareId, userId] });
    const result = await tx.execute({ sql: `delete from board_shares
      where share_id = ? and user_id = ? and json_extract(board_json, '$.kind') = 'season-impressions'`, args: [shareId, userId] });
    await tx.commit();
    return result.rowsAffected > 0;
  } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); release(); }
}

async function acquireLocalWriteSlot(): Promise<() => void> {
  const previous = localWriteQueue;
  let release!: () => void;
  localWriteQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  return release;
}

async function beginWriteTransaction(client: Client): Promise<WriteTransaction> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.transaction("write");
    } catch (error) {
      // No SQL has run yet, so a bounded lock retry cannot duplicate a publish or delete.
      if (attempt >= 4 || !(error instanceof Error) || !/SQLITE_BUSY|database is locked/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
