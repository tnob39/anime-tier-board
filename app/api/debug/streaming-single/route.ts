import { NextResponse } from "next/server";
import { devOnlyRouteGuard } from "@/lib/dev-only";
import { getTursoClient } from "@/lib/turso";
import { fetchAndSaveStreamingProviders, stripSeasonQualifierForDebug } from "@/lib/streaming-providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = devOnlyRouteGuard();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const romaji = searchParams.get("romaji") ?? undefined;
  const english = searchParams.get("english") ?? undefined;

  if (!title) {
    return NextResponse.json({ error: "title は必須です" }, { status: 400 });
  }

  const baseTitle = stripSeasonQualifierForDebug(title);
  const baseRomaji = romaji ? stripSeasonQualifierForDebug(romaji) : null;

  const fallbacks = [romaji, english, baseTitle, baseRomaji]
    .filter((t): t is string => Boolean(t?.trim()) && t !== title);
  const triedTitles = [title, ...fallbacks];

  const startMs = Date.now();
  let providers = null;
  let fetchError: string | null = null;

  try {
    providers = await fetchAndSaveStreamingProviders(title, fallbacks);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const elapsedMs = Date.now() - startMs;

  // DB に保存された値も確認
  const client = getTursoClient();
  const dbRow = await client
    .execute({ sql: "SELECT * FROM anime_streaming_providers WHERE anime_title = ?", args: [title] })
    .catch(() => ({ rows: [] }));

  return NextResponse.json({
    title,
    triedTitles,
    elapsedMs,
    result: providers
      ? {
          flatrate: providers.flatrate.map((p) => p.name),
          providerLink: providers.providerLink,
          tmdbId: providers.tmdbId,
          mediaType: providers.mediaType,
        }
      : null,
    fetchError,
    dbCached: dbRow.rows[0]
      ? {
          tmdbId: dbRow.rows[0].tmdb_id,
          flatrate: (() => {
            try { return JSON.parse(dbRow.rows[0].jp_flatrate as string); } catch { return []; }
          })(),
          updatedAt: dbRow.rows[0].updated_at,
        }
      : null,
  });
}
