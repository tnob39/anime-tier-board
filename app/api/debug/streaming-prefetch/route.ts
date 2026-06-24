import { NextResponse } from "next/server";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { devOnlyRouteGuard } from "@/lib/dev-only";
import { getCurrentAnimeSeason } from "@/lib/season";
import { buildProviderMapForItems } from "@/lib/streaming-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const blocked = devOnlyRouteGuard();
  if (blocked) return blocked;

  const { year, season } = getCurrentAnimeSeason();

  const seasonal = await fetchSeasonalAnime(year, season).catch(() => ({ items: [] }));
  const providerMap = await buildProviderMapForItems(seasonal.items, { concurrency: 3 });

  const results = seasonal.items.map((item) => {
    const hit = providerMap.get(item.title) ?? providerMap.get(item.titles?.romaji ?? "");
    return {
      title: item.title,
      providers: hit?.flatrate?.map((p) => p.name) ?? [],
    };
  });

  const withProviders = results.filter((r) => r.providers.length > 0);

  return NextResponse.json({
    total: results.length,
    withProviders: withProviders.length,
    results,
  });
}
