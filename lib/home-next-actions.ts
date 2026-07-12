import type { AnimeStatusRecord, ViewingStatus } from "./statuses";
import type { AnimeItem, StreamingProvider } from "./types";

export type AvailabilityConfidence = "confirmed" | "estimated" | "unknown";

export type NextActionCandidate = {
  record: AnimeStatusRecord;
  latestAvailableEpisode: number | null;
  availabilityConfidence: AvailabilityConfidence;
  provider: StreamingProvider | null;
  likelyNewEpisodeThisWeek: boolean;
};

export type HomeNextAction = {
  anime: AnimeItem;
  status: ViewingStatus;
  watchedEpisodes: number | null;
  latestAvailableEpisode: number | null;
  unwatchedEpisodes: number | null;
  availabilityConfidence: AvailabilityConfidence;
  provider: StreamingProvider | null;
  reasonLabel: string;
  updatedAt: string;
};

export type RankNextActionsOptions = {
  now: Date;
  limit?: number;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const ELIGIBLE_STATUSES = new Set<ViewingStatus>(["watching", "planned", "paused"]);

type RankedEntry = {
  action: HomeNextAction;
  bucket: number;
  updatedAtMs: number;
  animeId: string;
};

export function rankNextActions(
  candidates: readonly NextActionCandidate[],
  options: RankNextActionsOptions
): HomeNextAction[] {
  const nowMs = options.now.getTime();
  const recentStartMs = nowMs - RECENT_WINDOW_MS;
  const limit = normalizeLimit(options.limit);

  const ranked: RankedEntry[] = [];

  for (const candidate of candidates) {
    const { record } = candidate;
    if (record.anime === null) {
      continue;
    }
    if (!ELIGIBLE_STATUSES.has(record.status)) {
      continue;
    }

    const watchedEpisodes = normalizeEpisodeCount(record.watchedEpisodes);
    const { latestAvailableEpisode, unwatchedEpisodes } = normalizeAvailability(
      candidate.availabilityConfidence,
      candidate.latestAvailableEpisode,
      watchedEpisodes
    );

    const bucket = assignBucket({
      status: record.status,
      availabilityConfidence: candidate.availabilityConfidence,
      unwatchedEpisodes,
      likelyNewEpisodeThisWeek: candidate.likelyNewEpisodeThisWeek,
      updatedAt: record.updatedAt,
      nowMs,
      recentStartMs
    });

    ranked.push({
      action: {
        anime: record.anime,
        status: record.status,
        watchedEpisodes,
        latestAvailableEpisode,
        unwatchedEpisodes,
        availabilityConfidence: candidate.availabilityConfidence,
        provider: candidate.provider,
        reasonLabel: reasonLabelForBucket(bucket, record.status, unwatchedEpisodes),
        updatedAt: record.updatedAt
      },
      bucket,
      updatedAtMs: parseUpdatedAtMs(record.updatedAt),
      animeId: record.animeId
    });
  }

  ranked.sort(compareRankedEntries);

  const actions: HomeNextAction[] = [];
  for (let i = 0; i < ranked.length && i < limit; i += 1) {
    actions.push(ranked[i].action);
  }
  return actions;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated < 0) {
    return 0;
  }
  if (truncated > MAX_LIMIT) {
    return MAX_LIMIT;
  }
  return truncated;
}

function normalizeEpisodeCount(value: number | null): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    return value;
  }
  return null;
}

function normalizeAvailability(
  confidence: AvailabilityConfidence,
  latestAvailableEpisode: number | null,
  watchedEpisodes: number | null
): {
  latestAvailableEpisode: number | null;
  unwatchedEpisodes: number | null;
} {
  if (confidence === "unknown") {
    return {
      latestAvailableEpisode: null,
      unwatchedEpisodes: null
    };
  }

  const normalizedLatest = normalizeEpisodeCount(latestAvailableEpisode);
  if (normalizedLatest === null || watchedEpisodes === null) {
    return {
      latestAvailableEpisode: normalizedLatest,
      unwatchedEpisodes: null
    };
  }

  return {
    latestAvailableEpisode: normalizedLatest,
    unwatchedEpisodes: Math.max(normalizedLatest - watchedEpisodes, 0)
  };
}

function assignBucket(input: {
  status: ViewingStatus;
  availabilityConfidence: AvailabilityConfidence;
  unwatchedEpisodes: number | null;
  likelyNewEpisodeThisWeek: boolean;
  updatedAt: string;
  nowMs: number;
  recentStartMs: number;
}): number {
  if (
    input.status === "watching" &&
    input.availabilityConfidence === "confirmed" &&
    input.unwatchedEpisodes !== null &&
    input.unwatchedEpisodes > 0
  ) {
    return 1;
  }

  if (input.likelyNewEpisodeThisWeek) {
    return 2;
  }

  if (isRecentWatching(input.status, input.updatedAt, input.nowMs, input.recentStartMs)) {
    return 3;
  }

  if (input.status === "planned") {
    return 4;
  }

  return 5;
}

function isRecentWatching(
  status: ViewingStatus,
  updatedAt: string,
  nowMs: number,
  recentStartMs: number
): boolean {
  if (status !== "watching") {
    return false;
  }
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }
  return updatedAtMs >= recentStartMs && updatedAtMs <= nowMs;
}

function reasonLabelForBucket(
  bucket: number,
  status: ViewingStatus,
  unwatchedEpisodes: number | null
): string {
  switch (bucket) {
    case 1:
      return `未記録のエピソードが${unwatchedEpisodes as number}話あります`;
    case 2:
      return "今週、新しいエピソードが配信された可能性があります";
    case 3:
      return "最近更新した視聴中の作品です";
    case 4:
      return "視聴予定に登録しています";
    case 5:
    default:
      if (status === "paused") {
        return "一時停止中の作品です";
      }
      return "視聴中の作品です";
  }
}

function parseUpdatedAtMs(updatedAt: string): number {
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function compareRankedEntries(a: RankedEntry, b: RankedEntry): number {
  if (a.bucket !== b.bucket) {
    return a.bucket - b.bucket;
  }
  if (a.updatedAtMs !== b.updatedAtMs) {
    return a.updatedAtMs > b.updatedAtMs ? -1 : 1;
  }
  if (a.animeId < b.animeId) {
    return -1;
  }
  if (a.animeId > b.animeId) {
    return 1;
  }
  return 0;
}
