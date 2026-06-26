import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { getAnimePopularity } from "@/lib/anime-popularity";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { getCurrentAnimeSeason } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";

// 人気度の正準実装は lib/anime-popularity.ts に一本化。既存 import（explore 等）の
// 互換のためここから re-export する。
export { getAnimePopularity };

/** 未登録の今季アニメをTierの「人気順」と同じ基準で上位 limit 件返す。 */
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
