import { getCurrentAnimeSeason } from "@/lib/season";
import type { AnimeItem, AnimeSeason, AnimeSourceName } from "@/lib/types";

const CACHE_TTL_MS = 10 * 60 * 1000;

export type SeasonalAnimeClientResponse = {
  year: number;
  season: AnimeSeason;
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
  enrichWarning?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: SeasonalAnimeClientResponse;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SeasonalAnimeClientResponse>>();

export function seasonalAnimeCacheKey(year: number, season: AnimeSeason): string {
  return `${year}:${season}`;
}

function readCache(key: string): SeasonalAnimeClientResponse | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) {
      cache.delete(key);
    }
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: SeasonalAnimeClientResponse): void {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
}

/** SSR やホーム取得済みデータをクライアントキャッシュへ投入（再取得を避ける）。 */
export function seedSeasonalAnimeCache(
  year: number,
  season: AnimeSeason,
  items: AnimeItem[],
  source: AnimeSourceName = "anilist"
): void {
  const key = seasonalAnimeCacheKey(year, season);
  if (readCache(key)) {
    return;
  }

  writeCache(key, {
    year,
    season,
    items,
    source,
    cached: true,
  });
}

async function requestSeasonalAnime(
  year: number,
  season: AnimeSeason
): Promise<SeasonalAnimeClientResponse> {
  const response = await fetch(`/api/anime/seasonal?year=${year}&season=${season}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as SeasonalAnimeClientResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "季節アニメの取得に失敗しました。");
  }

  const data: SeasonalAnimeClientResponse = {
    year: payload.year ?? year,
    season: payload.season ?? season,
    items: payload.items,
    source: payload.source,
    cached: payload.cached,
    warning: payload.warning,
    enrichWarning: payload.enrichWarning,
  };

  writeCache(seasonalAnimeCacheKey(year, season), data);
  return data;
}

/** キャッシュ優先で今期アニメを取得。進行中リクエストは dedupe する。 */
export function fetchSeasonalAnimeClient(
  year: number,
  season: AnimeSeason
): Promise<SeasonalAnimeClientResponse> {
  const key = seasonalAnimeCacheKey(year, season);
  const cached = readCache(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const request = requestSeasonalAnime(year, season).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
}

function scheduleIdle(task: () => void): void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => task(), { timeout: 3000 });
    return;
  }
  setTimeout(task, 0);
}

/** 非ブロッキングで今期アニメを先読み（キャッシュが無い場合のみ）。 */
export function prefetchSeasonalAnime(year: number, season: AnimeSeason): void {
  const key = seasonalAnimeCacheKey(year, season);
  if (readCache(key) || inflight.has(key)) {
    return;
  }

  scheduleIdle(() => {
    void fetchSeasonalAnimeClient(year, season).catch(() => {
      // 先読み失敗はサイレント。Tier 側で従来どおり再取得する。
    });
  });
}

export function prefetchCurrentSeasonAnime(): void {
  const { year, season } = getCurrentAnimeSeason();
  prefetchSeasonalAnime(year, season);
}