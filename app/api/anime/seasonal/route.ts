import { NextResponse } from "next/server";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { getCurrentAnimeSeason, normalizeSeason } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";

export const dynamic = "force-dynamic";

export const GET = withApiRoute("anime.seasonal.GET", async (request: Request) => {
  const url = new URL(request.url);
  const current = getCurrentAnimeSeason();
  const yearParam = url.searchParams.get("year");
  const seasonParam = normalizeSeason(url.searchParams.get("season"));
  const year = yearParam ? Number(yearParam) : current.year;
  const season = seasonParam ?? current.season;

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new AppError({
      message: "yearは1900から2100の整数で指定してください。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  let result;
  try {
    result = await fetchSeasonalAnime(year, season);
  } catch (error) {
    throw new AppError({
      message:
        error instanceof Error ? error.message : "季節アニメの取得に失敗しました。",
      status: 502,
      code: "UPSTREAM",
      expose: true,
    });
  }

  // DB キャッシュにあるものだけ付与。TMDb 呼び出しはここでは行わない（タイムアウト回避）
  const { map: providerMap } = await buildProviderMapWithStats(result.items, { skipUncached: true });
  const enrichedItems = enrichWithStreamingProviders(result.items, providerMap);

  return NextResponse.json({
    year,
    season,
    generatedAt: new Date().toISOString(),
    ...result,
    items: enrichedItems,
  });
});