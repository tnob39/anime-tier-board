import { createHomeAnimeSnapshotSource } from "./home-anime-snapshot-source.ts";
import {
  buildNextActionCandidates,
  type HomeAnimeSnapshot
} from "./home-next-action-candidates.ts";
import {
  rankNextActions,
  type HomeNextAction
} from "./home-next-actions.ts";
import { buildHomeWeek, type HomeWeekItem } from "./home-week.ts";
import type { AnimeStatusRecord } from "./statuses.ts";
import type { AnimeItem } from "./types.ts";

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

export type HomeFreshness = {
  statuses: "fresh" | "stale";
  seasonal: "fresh" | "stale" | "unavailable";
  streaming: "fresh" | "stale" | "unavailable";
};

export type HomeResponse = {
  generatedAt: string;
  freshness: HomeFreshness;
  nextActions: HomeNextAction[];
  week: HomeWeekItem[];
};

export type HomeApiDependencies = {
  listStatuses: (userId: string) => Promise<AnimeStatusRecord[]>;
  getSeasonalSnapshot: () => Promise<HomeAnimeSnapshot>;
  getStreamingSnapshot: () => Promise<HomeAnimeSnapshot>;
  now: () => Date;
  statusesCache: Map<string, AnimeStatusRecord[]>;
};

export type HomeApi = {
  getHome: (userId: string) => Promise<HomeResponse>;
};

const productionStatusesCache = new Map<string, AnimeStatusRecord[]>();

let productionSeasonalSource: ReturnType<
  typeof createHomeAnimeSnapshotSource
> | null = null;
let productionStreamingSource: ReturnType<
  typeof createHomeAnimeSnapshotSource
> | null = null;

async function loadCurrentSeasonItems(): Promise<readonly AnimeItem[]> {
  const { fetchSeasonalAnime } = await import("./anime-sources/index.ts");
  const { getCurrentAnimeSeason } = await import("./season.ts");
  const { year, season } = getCurrentAnimeSeason();
  const result = await fetchSeasonalAnime(year, season);
  return result.items;
}

async function loadCurrentSeasonStreamingItems(): Promise<readonly AnimeItem[]> {
  const { fetchSeasonalAnime } = await import("./anime-sources/index.ts");
  const { getCurrentAnimeSeason } = await import("./season.ts");
  const {
    buildProviderMapWithStats,
    enrichWithStreamingProviders
  } = await import("./streaming-providers.ts");

  const { year, season } = getCurrentAnimeSeason();
  const result = await fetchSeasonalAnime(year, season);
  const { map: providerMap } = await buildProviderMapWithStats(result.items, {
    skipUncached: true,
    warmUncachedBudget: 5
  });
  return enrichWithStreamingProviders(result.items, providerMap);
}

function getProductionSeasonalSource() {
  if (productionSeasonalSource === null) {
    productionSeasonalSource = createHomeAnimeSnapshotSource({
      ttlMs: SNAPSHOT_TTL_MS,
      now: () => Date.now(),
      load: loadCurrentSeasonItems
    });
  }
  return productionSeasonalSource;
}

function getProductionStreamingSource() {
  if (productionStreamingSource === null) {
    productionStreamingSource = createHomeAnimeSnapshotSource({
      ttlMs: SNAPSHOT_TTL_MS,
      now: () => Date.now(),
      load: loadCurrentSeasonStreamingItems
    });
  }
  return productionStreamingSource;
}

async function defaultListStatuses(userId: string): Promise<AnimeStatusRecord[]> {
  const { listStatuses } = await import("./statuses.ts");
  return listStatuses(userId);
}

function resolveDependencies(
  overrides: Partial<HomeApiDependencies> = {}
): HomeApiDependencies {
  return {
    listStatuses: overrides.listStatuses ?? defaultListStatuses,
    getSeasonalSnapshot:
      overrides.getSeasonalSnapshot ??
      (() => getProductionSeasonalSource().getSnapshot()),
    getStreamingSnapshot:
      overrides.getStreamingSnapshot ??
      (() => getProductionStreamingSource().getSnapshot()),
    now: overrides.now ?? (() => new Date()),
    statusesCache: overrides.statusesCache ?? productionStatusesCache
  };
}

/**
 * Factory/injected seam for focused tests. Production uses module-level
 * statuses fallback cache and independent seasonal/streaming snapshot sources.
 */
export function createHomeApi(
  overrides: Partial<HomeApiDependencies> = {}
): HomeApi {
  const deps = resolveDependencies(overrides);

  return {
    async getHome(userId: string): Promise<HomeResponse> {
      const now = deps.now();

      let records: AnimeStatusRecord[];
      let statusesFreshness: HomeFreshness["statuses"];

      try {
        records = await deps.listStatuses(userId);
        deps.statusesCache.set(userId, records.slice());
        statusesFreshness = "fresh";
      } catch (error) {
        const cached = deps.statusesCache.get(userId);
        if (cached !== undefined) {
          records = cached.slice();
          statusesFreshness = "stale";
        } else {
          throw error;
        }
      }

      const [seasonal, streaming] = await Promise.all([
        deps.getSeasonalSnapshot(),
        deps.getStreamingSnapshot()
      ]);

      const candidates = buildNextActionCandidates(records, {
        now,
        seasonal,
        streaming
      });
      const nextActions = rankNextActions(candidates, { now });
      const week = buildHomeWeek(records, { now, seasonal });

      return {
        generatedAt: now.toISOString(),
        freshness: {
          statuses: statusesFreshness,
          seasonal: seasonal.freshness,
          streaming: streaming.freshness
        },
        nextActions,
        week
      };
    }
  };
}

const productionHomeApi = createHomeApi();

export async function getHome(userId: string): Promise<HomeResponse> {
  return productionHomeApi.getHome(userId);
}
