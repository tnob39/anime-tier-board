import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { getAnimePopularity } from "@/lib/anime-popularity";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { getCurrentAnimeSeason } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";
import type {
  AnimeItem,
  AnimeSourceName,
  AnimeStreamingPlatform,
  AnimeTitleSet,
  StreamingProvider,
  StreamingProvidersJp,
} from "@/lib/types";

// 人気度の正準実装は lib/anime-popularity.ts に一本化。既存 import（explore 等）の
// 互換のためここから re-export する。
export { getAnimePopularity };

/** E2E-only (non-production) home seasonal fixture env key. */
export const ATB_E2E_HOME_SEASONAL_FIXTURE_JSON = "ATB_E2E_HOME_SEASONAL_FIXTURE_JSON";

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

function fixtureError(detail: string): Error {
  return new Error(`${ATB_E2E_HOME_SEASONAL_FIXTURE_JSON}: ${detail}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseTitles(value: unknown, index: number): AnimeTitleSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fixtureError(`entry ${index} titles must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const titles: AnimeTitleSet = {};
  for (const key of ["native", "userPreferred", "romaji", "english"] as const) {
    if (raw[key] === undefined) continue;
    if (raw[key] !== null && typeof raw[key] !== "string") {
      throw fixtureError(`entry ${index} titles.${key} must be string or null`);
    }
    titles[key] = raw[key] as string | null;
  }
  return titles;
}

function parseStreamingPlatforms(
  value: unknown,
  index: number
): AnimeStreamingPlatform[] {
  if (!Array.isArray(value)) {
    throw fixtureError(`entry ${index} streamingPlatforms must be an array`);
  }
  return value.map((platform, pIndex) => {
    if (!platform || typeof platform !== "object" || Array.isArray(platform)) {
      throw fixtureError(`entry ${index} streamingPlatforms[${pIndex}] must be an object`);
    }
    const raw = platform as Record<string, unknown>;
    if (!isNonEmptyString(raw.name) || !isNonEmptyString(raw.url)) {
      throw fixtureError(
        `entry ${index} streamingPlatforms[${pIndex}] requires non-empty name and url`
      );
    }
    const parsed: AnimeStreamingPlatform = {
      name: raw.name,
      url: raw.url,
    };
    if (raw.source !== undefined) {
      if (typeof raw.source !== "string") {
        throw fixtureError(`entry ${index} streamingPlatforms[${pIndex}].source must be string`);
      }
      parsed.source = raw.source;
    }
    if (raw.region !== undefined) {
      if (raw.region !== null && typeof raw.region !== "string") {
        throw fixtureError(
          `entry ${index} streamingPlatforms[${pIndex}].region must be string or null`
        );
      }
      parsed.region = raw.region as string | null;
    }
    return parsed;
  });
}

function parseStreamingProvidersJp(
  value: unknown,
  index: number
): StreamingProvidersJp {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fixtureError(`entry ${index} streamingProvidersJp must be an object`);
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.flatrate)) {
    throw fixtureError(`entry ${index} streamingProvidersJp.flatrate must be an array`);
  }
  const flatrate: StreamingProvider[] = raw.flatrate.map((provider, pIndex) => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      throw fixtureError(
        `entry ${index} streamingProvidersJp.flatrate[${pIndex}] must be an object`
      );
    }
    const p = provider as Record<string, unknown>;
    if (typeof p.id !== "number" || !Number.isFinite(p.id)) {
      throw fixtureError(
        `entry ${index} streamingProvidersJp.flatrate[${pIndex}].id must be a number`
      );
    }
    if (!isNonEmptyString(p.name)) {
      throw fixtureError(
        `entry ${index} streamingProvidersJp.flatrate[${pIndex}].name must be a non-empty string`
      );
    }
    if (p.logoUrl !== null && typeof p.logoUrl !== "string") {
      throw fixtureError(
        `entry ${index} streamingProvidersJp.flatrate[${pIndex}].logoUrl must be string or null`
      );
    }
    return {
      id: p.id,
      name: p.name,
      logoUrl: p.logoUrl as string | null,
    };
  });

  const result: StreamingProvidersJp = { flatrate };
  if (raw.providerLink !== undefined) {
    if (raw.providerLink !== null && typeof raw.providerLink !== "string") {
      throw fixtureError(
        `entry ${index} streamingProvidersJp.providerLink must be string or null`
      );
    }
    result.providerLink = raw.providerLink as string | null;
  }
  return result;
}

function parseFixtureItem(entry: unknown, index: number): AnimeItem {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw fixtureError(`entry ${index} must be a non-null object`);
  }
  const raw = entry as Record<string, unknown>;

  if (!isNonEmptyString(raw.id)) {
    throw fixtureError(`entry ${index} id must be a non-empty string`);
  }
  if (raw.source !== "anilist" && raw.source !== "jikan") {
    throw fixtureError(`entry ${index} source must be "anilist" or "jikan"`);
  }
  if (!isNonEmptyString(raw.title)) {
    throw fixtureError(`entry ${index} title must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.imageUrl)) {
    throw fixtureError(`entry ${index} imageUrl must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.proxiedImageUrl)) {
    throw fixtureError(`entry ${index} proxiedImageUrl must be a non-empty string`);
  }
  if (!isNonEmptyString(raw.siteUrl)) {
    throw fixtureError(`entry ${index} siteUrl must be a non-empty string`);
  }

  const item: AnimeItem = {
    id: raw.id,
    source: raw.source as AnimeSourceName,
    title: raw.title,
    titles: parseTitles(raw.titles, index),
    imageUrl: raw.imageUrl,
    proxiedImageUrl: raw.proxiedImageUrl,
    siteUrl: raw.siteUrl,
  };

  if (raw.streamingPlatforms !== undefined) {
    item.streamingPlatforms = parseStreamingPlatforms(raw.streamingPlatforms, index);
  }
  if (raw.streamingProvidersJp !== undefined) {
    item.streamingProvidersJp = parseStreamingProvidersJp(raw.streamingProvidersJp, index);
  }

  return item;
}

/** Non-production E2E fixture parser. Throws deterministic errors; never falls back. */
export function parseE2EHomeSeasonalFixtureJson(raw: string): AnimeItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fixtureError("malformed JSON");
  }
  if (!Array.isArray(parsed)) {
    throw fixtureError("expected a non-empty JSON array");
  }
  if (parsed.length === 0) {
    throw fixtureError("expected a non-empty JSON array");
  }
  return parsed.map((entry, index) => parseFixtureItem(entry, index));
}

/** explore と同じデータソース（fetchSeasonalAnime + 配信 enrich）で今期一覧を取得。 */
export async function fetchCurrentSeasonAnimeForHome(): Promise<AnimeItem[]> {
  // E2E-only: non-production + fixture env present → validate and return before any external call.
  if (process.env.NODE_ENV !== "production") {
    const fixtureRaw = process.env[ATB_E2E_HOME_SEASONAL_FIXTURE_JSON];
    if (fixtureRaw !== undefined) {
      return parseE2EHomeSeasonalFixtureJson(fixtureRaw);
    }
  }

  const { year, season } = getCurrentAnimeSeason();
  const result = await fetchSeasonalAnime(year, season);
  const { map: providerMap } = await buildProviderMapWithStats(result.items, {
    skipUncached: true,
    warmUncachedBudget: 5,
  });
  return enrichWithStreamingProviders(result.items, providerMap);
}
