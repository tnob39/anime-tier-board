import type { AnimeStatusRecord } from "./statuses";
import type { AnimeItem, StreamingProvider } from "./types";
import type { NextActionCandidate } from "./home-next-actions";

export type HomeAnimeSnapshot =
  | { freshness: "fresh" | "stale"; items: readonly AnimeItem[] }
  | { freshness: "unavailable"; items: null };

export type BuildNextActionCandidatesOptions = {
  now: Date;
  seasonal: HomeAnimeSnapshot;
  streaming: HomeAnimeSnapshot;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildNextActionCandidates(
  records: readonly AnimeStatusRecord[],
  options: BuildNextActionCandidatesOptions
): NextActionCandidate[] {
  const nowMs = options.now.getTime();
  const nowValid = Number.isFinite(nowMs);

  const seasonalById = indexSnapshotItems(options.seasonal);
  const streamingById = indexSnapshotItems(options.streaming);

  const results: NextActionCandidate[] = [];

  for (const record of records) {
    const seasonalItem = seasonalById.get(record.animeId);
    const streamingItem = streamingById.get(record.animeId);

    let candidateRecord: AnimeStatusRecord = record;
    if (seasonalItem !== undefined && record.anime !== null) {
      candidateRecord = {
        ...record,
        anime: { ...record.anime, ...seasonalItem }
      };
    }

    const animeForDerivation = seasonalItem ?? record.anime;
    const latestAvailableEpisode = deriveLatestAvailableEpisode(
      animeForDerivation,
      nowMs,
      nowValid
    );

    let availabilityConfidence: NextActionCandidate["availabilityConfidence"];
    if (latestAvailableEpisode === null) {
      availabilityConfidence = "unknown";
    } else if (seasonalItem !== undefined) {
      availabilityConfidence =
        options.seasonal.freshness === "fresh" ? "confirmed" : "estimated";
    } else {
      availabilityConfidence = "estimated";
    }

    const likelyNewEpisodeThisWeek = deriveLikelyNewEpisodeThisWeek(
      animeForDerivation,
      nowMs,
      nowValid
    );

    const provider = selectProvider(streamingItem);

    results.push({
      record: candidateRecord,
      latestAvailableEpisode,
      availabilityConfidence,
      provider,
      likelyNewEpisodeThisWeek
    });
  }

  return results;
}

function indexSnapshotItems(snapshot: HomeAnimeSnapshot): Map<string, AnimeItem> {
  const map = new Map<string, AnimeItem>();
  if (snapshot.freshness === "unavailable" || snapshot.items === null) {
    return map;
  }
  for (const item of snapshot.items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return map;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseInstantMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function deriveLatestAvailableEpisode(
  anime: AnimeItem | null | undefined,
  nowMs: number,
  nowValid: boolean
): number | null {
  if (!anime || !nowValid) {
    return null;
  }

  let maxEpisode: number | null = null;

  const recent = anime.airing?.recentEpisodes;
  if (Array.isArray(recent)) {
    for (const entry of recent) {
      if (!isPositiveInteger(entry.episode)) {
        continue;
      }
      const airingAtMs = parseInstantMs(entry.airingAt);
      if (airingAtMs === null || airingAtMs > nowMs) {
        continue;
      }
      if (maxEpisode === null || entry.episode > maxEpisode) {
        maxEpisode = entry.episode;
      }
    }
  }

  const nextEpisode = anime.airing?.nextEpisode;
  if (nextEpisode && isPositiveInteger(nextEpisode.episode)) {
    const airingAtMs = parseInstantMs(nextEpisode.airingAt);
    if (airingAtMs !== null && airingAtMs > nowMs) {
      const derived = nextEpisode.episode - 1;
      if (Number.isInteger(derived) && derived >= 0) {
        if (maxEpisode === null || derived > maxEpisode) {
          maxEpisode = derived;
        }
      }
    }
  }

  return maxEpisode;
}

function deriveLikelyNewEpisodeThisWeek(
  anime: AnimeItem | null | undefined,
  nowMs: number,
  nowValid: boolean
): boolean {
  if (!anime || !nowValid) {
    return false;
  }

  const recent = anime.airing?.recentEpisodes;
  if (!Array.isArray(recent)) {
    return false;
  }

  const lowerBoundMs = nowMs - WEEK_MS;
  for (const entry of recent) {
    if (!isPositiveInteger(entry.episode)) {
      continue;
    }
    const airingAtMs = parseInstantMs(entry.airingAt);
    if (airingAtMs === null) {
      continue;
    }
    if (airingAtMs >= lowerBoundMs && airingAtMs <= nowMs) {
      return true;
    }
  }

  return false;
}

function isValidProvider(provider: StreamingProvider): boolean {
  return Number.isFinite(provider.id) && Number.isInteger(provider.id);
}

function compareProviders(a: StreamingProvider, b: StreamingProvider): number {
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  const aLogo = a.logoUrl ?? "";
  const bLogo = b.logoUrl ?? "";
  if (aLogo < bLogo) {
    return -1;
  }
  if (aLogo > bLogo) {
    return 1;
  }
  return 0;
}

function selectProvider(item: AnimeItem | undefined): StreamingProvider | null {
  if (!item) {
    return null;
  }
  const flatrate = item.streamingProvidersJp?.flatrate;
  if (!Array.isArray(flatrate) || flatrate.length === 0) {
    return null;
  }

  const valid: StreamingProvider[] = [];
  for (const provider of flatrate) {
    if (isValidProvider(provider)) {
      valid.push(provider);
    }
  }
  if (valid.length === 0) {
    return null;
  }

  const sorted = valid.slice().sort(compareProviders);
  return sorted[0] ?? null;
}
