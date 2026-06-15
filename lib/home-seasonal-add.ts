import { fetchSeasonalAnime } from "@/lib/anime-sources";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { getCurrentAnimeSeason } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";

export function getAnimePopularity(item: AnimeItem): number {
  return item.popularity ?? item.reputation?.members ?? item.reputation?.popularity ?? 0;
}

/** 未登録の今期アニメを人気順で上位 limit 件返す。 */
export function selectUnregisteredSeasonalAnime(
  seasonalItems: AnimeItem[],
  statuses: AnimeStatusRecord[],
  limit = 8
): AnimeItem[] {
  const registeredIds = new Set(statuses.map((record) => record.animeId));

  return [...seasonalItems]
    .filter((item) => !registeredIds.has(item.id))
    .sort((a, b) => getAnimePopularity(b) - getAnimePopularity(a) || a.title.localeCompare(b.title, "ja"))
    .slice(0, limit);
}

/** explore と同じデータソース（fetchSeasonalAnime + 配信 enrich）で今期一覧を取得。 */
export async function fetchCurrentSeasonAnimeForHome(): Promise<AnimeItem[]> {
  const { year, season } = getCurrentAnimeSeason();
  const result = await fetchSeasonalAnime(year, season);
  const { map: providerMap } = await buildProviderMapWithStats(result.items, {
    skipUncached: true,
  });
  return enrichWithStreamingProviders(result.items, providerMap);
}