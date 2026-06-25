import { fetchSeasonalAnime } from "@/lib/anime-sources";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { getCurrentAnimeSeason } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";

export function getAnimePopularity(item: AnimeItem): number {
  // Jikan(MAL)の popularity は「人気順位」(値が小さいほど人気)で、
  // AniList の popularity(会員数、値が大きいほど人気)と方向が逆。
  // members は両ソースとも「会員数=値が大きいほど人気」で意味が揃っているため、
  // Jikan ソースの場合は popularity を使わず members を優先する。
  if (item.source === "jikan") {
    return item.reputation?.members ?? 0;
  }

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