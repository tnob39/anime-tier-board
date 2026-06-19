import type { AnimeItem, AnimeSeason, SeasonalAnimeResult } from "../types";
import { SEASONS } from "../types";
import { fetchAniListSeasonalAnime } from "./anilist";
import { fetchJikanSeasonalAnime } from "./jikan";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  result: Omit<SeasonalAnimeResult, "cached">;
};

const cache = new Map<string, CacheEntry>();

export async function fetchYearlyAnime(year: number): Promise<SeasonalAnimeResult> {
  const cacheKey = `${year}:ALL`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      cached: true
    };
  }

  const settled = await Promise.allSettled(
    SEASONS.map((season) => fetchSeasonalAnime(year, season))
  );

  const fulfilled = settled.filter(
    (result): result is PromiseFulfilledResult<SeasonalAnimeResult> =>
      result.status === "fulfilled"
  );

  if (!fulfilled.length) {
    const reasons = settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => formatError(result.reason));
    throw new Error(`年単位の作品取得に失敗しました: ${reasons.join(" / ")}`);
  }

  const itemsById = new Map<string, AnimeItem>();
  for (const result of fulfilled) {
    for (const item of result.value.items) {
      itemsById.set(item.id, item);
    }
  }

  const warnings = fulfilled
    .map((result) => result.value.warning)
    .filter((warning): warning is string => Boolean(warning));

  const source = fulfilled.some((result) => result.value.source === "anilist")
    ? "anilist"
    : "jikan";

  return cacheAndReturn(cacheKey, {
    items: Array.from(itemsById.values()),
    source,
    ...(warnings.length ? { warning: warnings.join(" ") } : {})
  });
}

export async function fetchSeasonalAnime(
  year: number,
  season: AnimeSeason
): Promise<SeasonalAnimeResult> {
  const cacheKey = `${year}:${season}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      cached: true
    };
  }

  try {
    const items = await fetchAniListSeasonalAnime(year, season);
    return cacheAndReturn(cacheKey, {
      items,
      source: "anilist"
    });
  } catch (anilistError) {
    try {
      const items = await fetchJikanSeasonalAnime(year, season);
      return cacheAndReturn(cacheKey, {
        items,
        source: "jikan",
        warning: `AniListの取得に失敗したためJikanを使用しました: ${formatError(
          anilistError
        )}`
      });
    } catch (jikanError) {
      throw new Error(
        `AniListとJikanの取得に失敗しました。AniList: ${formatError(
          anilistError
        )} / Jikan: ${formatError(jikanError)}`
      );
    }
  }
}

function cacheAndReturn(
  cacheKey: string,
  result: Omit<SeasonalAnimeResult, "cached">
): SeasonalAnimeResult {
  const stableResult = {
    ...result,
    items: sortAnimeItems(result.items)
  };

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    result: stableResult
  });

  return {
    ...stableResult,
    cached: false
  };
}

function sortAnimeItems(items: AnimeItem[]): AnimeItem[] {
  return [...items].sort((a, b) => {
    const popularityA = a.popularity ?? 0;
    const popularityB = b.popularity ?? 0;

    if (popularityA !== popularityB) {
      return popularityB - popularityA;
    }

    return a.title.localeCompare(b.title, "ja");
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
