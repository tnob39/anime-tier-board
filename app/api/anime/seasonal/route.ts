import { NextResponse } from "next/server";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { getCurrentAnimeSeason, normalizeSeason } from "@/lib/season";
import {
  buildProviderMapForItems,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const current = getCurrentAnimeSeason();
  const yearParam = url.searchParams.get("year");
  const seasonParam = normalizeSeason(url.searchParams.get("season"));
  const year = yearParam ? Number(yearParam) : current.year;
  const season = seasonParam ?? current.season;

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return NextResponse.json(
      { error: "yearは1900から2100の整数で指定してください。" },
      { status: 400 }
    );
  }

  try {
    const result = await fetchSeasonalAnime(year, season);
    const providerMap = await buildProviderMapForItems(result.items);
    const enrichedItems = enrichWithStreamingProviders(result.items, providerMap);
    return NextResponse.json({
      year,
      season,
      generatedAt: new Date().toISOString(),
      ...result,
      items: enrichedItems,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "季節アニメの取得に失敗しました。"
      },
      { status: 502 }
    );
  }
}
