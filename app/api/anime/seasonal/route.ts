import { NextResponse } from "next/server";
import { fetchSeasonalAnime, fetchYearlyAnime } from "@/lib/anime-sources";
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
  const rawSeason = url.searchParams.get("season");
  const isYearScope = rawSeason?.toLowerCase() === "all";
  const seasonParam = isYearScope ? null : normalizeSeason(rawSeason);
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
    result = isYearScope
      ? await fetchYearlyAnime(year)
      : await fetchSeasonalAnime(year, season);
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
  const { map: providerMap, stats: enrichStats } = await buildProviderMapWithStats(result.items, { skipUncached: true });
  const enrichedItems = enrichWithStreamingProviders(result.items, providerMap);

  const enrichWarning =
    !enrichStats.credentialsMissing && enrichStats.failed > 0
      ? `配信情報の一部を取得できませんでした（${enrichStats.failed}件）。`
      : undefined;

  return NextResponse.json({
    year,
    season: isYearScope ? "ALL" : season,
    generatedAt: new Date().toISOString(),
    ...result,
    items: enrichedItems,
    enrichStats,
    ...(enrichWarning ? { enrichWarning } : {}),
  });
});