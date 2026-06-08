import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";

export const dynamic = "force-dynamic";

// DELETE: empty-flatrate エントリを削除して再取得を促す
export async function DELETE() {
  const client = getTursoClient();

  const result = await client.execute(
    `DELETE FROM anime_streaming_providers WHERE jp_flatrate = '[]' OR jp_flatrate IS NULL`
  );

  return NextResponse.json({
    deleted: result.rowsAffected,
    message: `空 flatrate のキャッシュ ${result.rowsAffected} 件を削除しました。Tier ボードを開くと再取得されます。`,
  });
}

// GET: 現在のキャッシュ統計
export async function GET() {
  const client = getTursoClient();

  const total = await client.execute(
    "SELECT COUNT(*) as cnt FROM anime_streaming_providers"
  );
  const withProviders = await client.execute(
    `SELECT COUNT(*) as cnt FROM anime_streaming_providers WHERE jp_flatrate != '[]' AND jp_flatrate IS NOT NULL`
  );
  const empty = await client.execute(
    `SELECT COUNT(*) as cnt FROM anime_streaming_providers WHERE jp_flatrate = '[]' OR jp_flatrate IS NULL`
  );

  return NextResponse.json({
    total: total.rows[0]?.cnt,
    withProviders: withProviders.rows[0]?.cnt,
    emptyFlatrate: empty.rows[0]?.cnt,
  });
}
