import { getAnimeTmdbProviderIds } from "./subscription-stats";
import type { AnimeItem } from "./types";

export type FilterAnimeItemsOptions = {
  hideMovies: boolean;
  hideRerunCandidates: boolean;
  seasonYear: number;
  onlyInstantWatch?: boolean;
  /** 加入中サービスのTMDb providerId。指定があれば「今すぐ見放題」はこの中での視聴可否を見る */
  subscribedProviderIds?: number[];
};

export function filterAnimeItems(
  items: AnimeItem[],
  options: FilterAnimeItemsOptions
): AnimeItem[] {
  return items.filter((item) => {
    if (options.hideMovies && isMovie(item)) {
      return false;
    }

    if (options.hideRerunCandidates && isRerunCandidate(item, options.seasonYear)) {
      return false;
    }

    if (options.onlyInstantWatch && !hasInstantWatch(item, options.subscribedProviderIds)) {
      return false;
    }

    return true;
  });
}

function hasInstantWatch(item: AnimeItem, subscribedProviderIds?: number[]): boolean {
  if (subscribedProviderIds && subscribedProviderIds.length > 0) {
    const providerIds = getAnimeTmdbProviderIds(item);
    return providerIds.some((id) => subscribedProviderIds.includes(id));
  }

  const flatrate = item.streamingProvidersJp?.flatrate;
  return Array.isArray(flatrate) && flatrate.length > 0;
}

function isMovie(item: AnimeItem): boolean {
  return normalizeFormat(item.format) === "MOVIE";
}

function isRerunCandidate(item: AnimeItem, selectedYear: number): boolean {
  if (item.isRebroadcast) {
    return true;
  }

  const format = normalizeFormat(item.format);
  if (!["TV", "TV_SHORT", "ONA", "SPECIAL"].includes(format)) {
    return false;
  }

  const originalYear = getOriginalStartYear(item);
  return typeof originalYear === "number" && originalYear < selectedYear;
}

function getOriginalStartYear(item: AnimeItem): number | null {
  if (item.airing?.startDate) {
    const parsed = new Date(item.airing.startDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getUTCFullYear();
    }
  }

  return item.seasonYear ?? null;
}

function normalizeFormat(format?: string | null): string {
  return format?.trim().replace(/\s+/g, "_").toUpperCase() ?? "";
}