import type {
  AnimeItem,
  AnimeSeason,
  AniListFailureOutcome,
  AniListOutcome,
  JikanOutcome,
  SeasonalAnimeResult,
  SeasonalCutoffRegime,
  SeasonalFreshness,
  SeasonalServePath,
  SeasonalTelemetryEvent
} from "../types.ts";
import { SEASONS } from "../types.ts";
import {
  ANILIST_ATTEMPT_BUDGET_MS,
  fetchAniListSeasonalAnime
} from "./anilist.ts";
import {
  JIKAN_ATTEMPT_BUDGET_MS,
  JIKAN_CUTOFF_MS,
  fetchJikanSeasonalAnime
} from "./jikan.ts";

/** Inclusive start of post-cutoff regime (SSOT §1). Re-exported from Jikan client. */
export { JIKAN_CUTOFF_MS };

export const FRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ATTEMPT_BUDGET_MS = ANILIST_ATTEMPT_BUDGET_MS;

type CacheEntry = {
  fetchedAtMs: number;
  result: Omit<SeasonalAnimeResult, "cached" | "freshness" | "servePath">;
};

export type SeasonalFetchDeps = {
  now: () => number;
  fetch: typeof fetch;
  onTelemetry: (event: SeasonalTelemetryEvent) => void;
  /** Inter-page delay for Jikan (default 350). Tests may set 0. */
  jikanPageDelayMs?: number;
};

export type SeasonalAnimeSource = {
  fetchSeasonalAnime: (
    year: number,
    season: AnimeSeason
  ) => Promise<SeasonalAnimeResult>;
  fetchYearlyAnime: (year: number) => Promise<SeasonalAnimeResult>;
  /** Test seam: clear in-memory catalog cache. */
  clearCache: () => void;
};

const defaultDeps: SeasonalFetchDeps = {
  now: () => Date.now(),
  fetch: globalThis.fetch.bind(globalThis),
  onTelemetry: () => {}
};

const defaultSource = createSeasonalAnimeSource();

export async function fetchYearlyAnime(year: number): Promise<SeasonalAnimeResult> {
  return defaultSource.fetchYearlyAnime(year);
}

export async function fetchSeasonalAnime(
  year: number,
  season: AnimeSeason
): Promise<SeasonalAnimeResult> {
  return defaultSource.fetchSeasonalAnime(year, season);
}

/**
 * Injectable factory: clock, fetch, and telemetry seams for tests and future wiring.
 * One frozen request_time per public call drives cutoff and freshness decisions.
 */
export function createSeasonalAnimeSource(
  partialDeps: Partial<SeasonalFetchDeps> = {}
): SeasonalAnimeSource {
  const deps: SeasonalFetchDeps = {
    now: partialDeps.now ?? defaultDeps.now,
    fetch: partialDeps.fetch ?? defaultDeps.fetch,
    onTelemetry: partialDeps.onTelemetry ?? defaultDeps.onTelemetry,
    jikanPageDelayMs: partialDeps.jikanPageDelayMs
  };

  const cache = new Map<string, CacheEntry>();

  async function fetchSeasonalAnime(
    year: number,
    season: AnimeSeason
  ): Promise<SeasonalAnimeResult> {
    const requestTimeMs = deps.now();
    const seasonalKey = `${year}:${season}`;
    return runSeasonalPolicy({
      cacheKey: seasonalKey,
      seasonalKey,
      requestTimeMs,
      loadLive: () => loadSeasonLive(year, season, requestTimeMs, seasonalKey)
    });
  }

  async function fetchYearlyAnime(year: number): Promise<SeasonalAnimeResult> {
    const requestTimeMs = deps.now();
    const seasonalKey = `${year}:ALL`;
    return runSeasonalPolicy({
      cacheKey: seasonalKey,
      seasonalKey,
      requestTimeMs,
      loadLive: () => loadYearLive(year, requestTimeMs, seasonalKey)
    });
  }

  async function runSeasonalPolicy(args: {
    cacheKey: string;
    seasonalKey: string;
    requestTimeMs: number;
    loadLive: () => Promise<LiveLoadResult>;
  }): Promise<SeasonalAnimeResult> {
    const { cacheKey, seasonalKey, requestTimeMs, loadLive } = args;
    const cutoffRegime = regimeFor(requestTimeMs);
    const cached = cache.get(cacheKey);
    const ageMs =
      cached != null ? requestTimeMs - cached.fetchedAtMs : Number.POSITIVE_INFINITY;

    // §3.1 / §5: fresh ≤24h may serve directly without upstream.
    if (cached && ageMs >= 0 && ageMs <= FRESH_MAX_AGE_MS) {
      return finishReturn({
        seasonalKey,
        requestTimeMs,
        cutoffRegime,
        body: {
          items: cached.result.items,
          source: cached.result.source,
          warning: cached.result.warning,
          fetchedAt: cached.result.fetchedAt,
          freshness: "fresh",
          servePath: "fresh_direct",
          cached: true
        },
        telemetrySource: "cache",
        anilistOutcome: "skipped",
        jikanOutcome:
          cutoffRegime === "pre" ? "skipped_pre_policy" : "skipped_post_cutoff"
      });
    }

    const staleEntry =
      cached && ageMs > FRESH_MAX_AGE_MS && ageMs <= STALE_MAX_AGE_MS
        ? cached
        : null;

    // age > 7d is unusable for catalog; treat as missing.
    // 24h < age ≤ 7d or missing: must attempt live path.

    let live: LiveLoadResult;
    try {
      live = await loadLive();
    } catch (error) {
      // loadLive should not throw for upstream failures; guard anyway.
      return finishThrow({
        seasonalKey,
        requestTimeMs,
        cutoffRegime,
        error: toError(error),
        anilistOutcome: "transport",
        jikanOutcome:
          cutoffRegime === "pre" ? "error" : "skipped_post_cutoff",
        staleEntry
      });
    }

    if (live.kind === "success") {
      const fetchedAt = new Date(requestTimeMs).toISOString();
      const stable = {
        items: sortAnimeItems(live.items),
        source: live.source,
        warning: live.warning,
        fetchedAt
      };
      cache.set(cacheKey, {
        fetchedAtMs: requestTimeMs,
        result: stable
      });
      return finishReturn({
        seasonalKey,
        requestTimeMs,
        cutoffRegime,
        body: {
          ...stable,
          freshness: "fresh",
          servePath: live.servePath,
          cached: false
        },
        telemetrySource: live.source,
        anilistOutcome: live.anilistOutcome,
        jikanOutcome: live.jikanOutcome
      });
    }

    // Live failed — stale serve only if 24h < age ≤ 7d (§3.1 step 4).
    if (staleEntry) {
      return finishReturn({
        seasonalKey,
        requestTimeMs,
        cutoffRegime,
        body: {
          items: staleEntry.result.items,
          source: staleEntry.result.source,
          warning: staleEntry.result.warning,
          fetchedAt: staleEntry.result.fetchedAt,
          freshness: "stale",
          servePath: "stale_after_anilist_fail",
          cached: true
        },
        telemetrySource: "cache",
        anilistOutcome: live.anilistOutcome,
        jikanOutcome: live.jikanOutcome
      });
    }

    return finishThrow({
      seasonalKey,
      requestTimeMs,
      cutoffRegime,
      error: live.error,
      anilistOutcome: live.anilistOutcome,
      jikanOutcome: live.jikanOutcome,
      staleEntry: null
    });
  }

  async function loadSeasonLive(
    year: number,
    season: AnimeSeason,
    requestTimeMs: number,
    _seasonalKey: string
  ): Promise<LiveLoadResult> {
    const cutoffRegime = regimeFor(requestTimeMs);
    const anilistDeadline = requestTimeMs + ATTEMPT_BUDGET_MS;

    const anilist = await fetchAniListSeasonalAnime(year, season, {
      fetchImpl: deps.fetch,
      now: deps.now,
      deadlineMs: anilistDeadline
    });

    if (anilist.ok) {
      return {
        kind: "success",
        items: anilist.items,
        source: "anilist",
        servePath: "live_anilist",
        anilistOutcome: "success",
        jikanOutcome:
          cutoffRegime === "pre" ? "skipped_pre_policy" : "skipped_post_cutoff"
      };
    }

    const anilistOutcome = anilist.outcome;
    const canFailover =
      cutoffRegime === "pre" && anilist.failoverEligible;

    if (!canFailover) {
      return {
        kind: "failure",
        error: anilist.error,
        anilistOutcome,
        jikanOutcome:
          cutoffRegime === "post" ? "skipped_post_cutoff" : "skipped_pre_policy"
      };
    }

    // Pre-cutoff fail-over: exactly one Jikan logical attempt.
    const jikanStarted = deps.now();
    const jikanDeadline = Math.min(
      jikanStarted + JIKAN_ATTEMPT_BUDGET_MS,
      // Still bound loosely; each attempt has its own 6s budget.
      jikanStarted + ATTEMPT_BUDGET_MS
    );

    const jikan = await fetchJikanSeasonalAnime(year, season, {
      fetchImpl: deps.fetch,
      now: deps.now,
      requestTimeMs,
      deadlineMs: jikanDeadline,
      pageDelayMs: deps.jikanPageDelayMs
    });

    if (jikan.ok) {
      return {
        kind: "success",
        items: jikan.items,
        source: "jikan",
        servePath: "live_jikan",
        anilistOutcome,
        jikanOutcome: "success",
        warning: `AniListの取得に失敗したためJikanを使用しました: ${anilist.error.message}`
      };
    }

    return {
      kind: "failure",
      error: new Error(
        `AniListとJikanの取得に失敗しました。AniList: ${anilist.error.message} / Jikan: ${jikan.error.message}`
      ),
      anilistOutcome,
      jikanOutcome: jikan.outcome === "disabled" ? "disabled" : "error"
    };
  }

  async function loadYearLive(
    year: number,
    requestTimeMs: number,
    _seasonalKey: string
  ): Promise<LiveLoadResult> {
    // Year aggregate uses the same seasonal policy per season (preserve merge/dedupe).
    // Nested seasonal calls would double-count telemetry and re-freeze time; inline instead.
    const cutoffRegime = regimeFor(requestTimeMs);
    const fetchedAt = new Date(requestTimeMs).toISOString();
    const settled = await Promise.allSettled(
      SEASONS.map(async (season) => {
        const live = await loadSeasonLive(
          year,
          season,
          requestTimeMs,
          `${year}:${season}`
        );
        if (live.kind !== "success") {
          throw live.error;
        }
        // Preserve prior behavior: successful season loads seed the season cache.
        cache.set(`${year}:${season}`, {
          fetchedAtMs: requestTimeMs,
          result: {
            items: sortAnimeItems(live.items),
            source: live.source,
            warning: live.warning,
            fetchedAt
          }
        });
        return live;
      })
    );

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Extract<LiveLoadResult, { kind: "success" }>> =>
        result.status === "fulfilled"
    );

    if (!fulfilled.length) {
      const reasons = settled
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => formatError(result.reason));
      // Approximate outcomes from first rejection path: attempt AniList-class failure.
      return {
        kind: "failure",
        error: new Error(`年単位の作品取得に失敗しました: ${reasons.join(" / ")}`),
        anilistOutcome: "transport",
        jikanOutcome:
          cutoffRegime === "pre" ? "error" : "skipped_post_cutoff"
      };
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

    const servePath =
      source === "anilist" ? "live_anilist" : "live_jikan";

    // Year aggregate telemetry: success if any season live-succeeded.
    const anyJikan = fulfilled.some((result) => result.value.source === "jikan");
    return {
      kind: "success",
      items: Array.from(itemsById.values()),
      source,
      servePath,
      anilistOutcome: source === "anilist" ? "success" : "transport",
      jikanOutcome: anyJikan
        ? "success"
        : cutoffRegime === "pre"
          ? "skipped_pre_policy"
          : "skipped_post_cutoff",
      warning: warnings.length ? warnings.join(" ") : undefined
    };
  }

  function finishReturn(args: {
    seasonalKey: string;
    requestTimeMs: number;
    cutoffRegime: SeasonalCutoffRegime;
    body: SeasonalAnimeResult;
    telemetrySource: SeasonalTelemetryEvent["source"];
    anilistOutcome: AniListOutcome;
    jikanOutcome: JikanOutcome;
  }): SeasonalAnimeResult {
    emitOnce({
      seasonal_key: args.seasonalKey,
      source: args.telemetrySource,
      freshness: args.body.freshness,
      anilist_outcome: args.anilistOutcome,
      jikan_outcome: args.jikanOutcome,
      fetched_at: args.body.fetchedAt,
      cutoff_regime: args.cutoffRegime,
      serve_path: args.body.servePath
    });
    return args.body;
  }

  function finishThrow(args: {
    seasonalKey: string;
    requestTimeMs: number;
    cutoffRegime: SeasonalCutoffRegime;
    error: Error;
    anilistOutcome: AniListOutcome;
    jikanOutcome: JikanOutcome;
    staleEntry: CacheEntry | null;
  }): never {
    emitOnce({
      seasonal_key: args.seasonalKey,
      source: "cache",
      freshness: "unavailable",
      anilist_outcome: args.anilistOutcome,
      jikan_outcome: args.jikanOutcome,
      fetched_at: new Date(args.requestTimeMs).toISOString(),
      cutoff_regime: args.cutoffRegime,
      serve_path: "unavailable"
    });
    throw args.error;
  }

  function emitOnce(event: SeasonalTelemetryEvent): void {
    deps.onTelemetry(event);
  }

  return {
    fetchSeasonalAnime,
    fetchYearlyAnime,
    clearCache: () => {
      cache.clear();
    }
  };
}

type LiveLoadResult =
  | {
      kind: "success";
      items: AnimeItem[];
      source: "anilist" | "jikan";
      servePath: Extract<SeasonalServePath, "live_anilist" | "live_jikan">;
      anilistOutcome: AniListOutcome;
      jikanOutcome: JikanOutcome;
      warning?: string;
    }
  | {
      kind: "failure";
      error: Error;
      anilistOutcome: AniListOutcome;
      jikanOutcome: JikanOutcome;
    };

function regimeFor(requestTimeMs: number): SeasonalCutoffRegime {
  return requestTimeMs >= JIKAN_CUTOFF_MS ? "post" : "pre";
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Keep type-only imports used for documentation / future exhaustiveness.
export type { AniListFailureOutcome, SeasonalFreshness };
