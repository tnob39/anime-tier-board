import { getTursoClient } from "./turso";
import type { AnimeItem } from "./types";

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";

export type StreamingProvider = {
  id: number;
  name: string;
  logoUrl: string | null;
};

export type StreamingProvidersJp = {
  flatrate: StreamingProvider[];
  providerLink?: string | null;
  tmdbId?: number;
  mediaType?: "tv" | "movie";
  updatedAt?: string;
};

type TmdbWatchProviderRaw = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

function normalizeProvider(provider: TmdbWatchProviderRaw): StreamingProvider {
  return {
    id: provider.provider_id,
    name: provider.provider_name,
    logoUrl: provider.logo_path ? `${TMDB_IMAGE_BASE}${provider.logo_path}` : null,
  };
}

function getTmdbHeaders(): Record<string, string> {
  const apiKey = process.env.TMDB_API_KEY;
  const bearerToken = process.env.TMDB_BEARER_TOKEN ?? process.env.TMDB_READ_ACCESS_TOKEN;

  if (!apiKey && !bearerToken) {
    throw new Error("Missing TMDB_API_KEY or TMDB_BEARER_TOKEN");
  }

  return bearerToken
    ? { Authorization: `Bearer ${bearerToken}`, accept: "application/json" }
    : { accept: "application/json" };
}

function buildTmdbUrl(path: string, params: Record<string, any> = {}) {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const apiKey = process.env.TMDB_API_KEY;
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  return url.toString();
}

async function tmdbFetch(path: string, params: Record<string, any> = {}) {
  const headers = getTmdbHeaders();
  const url = buildTmdbUrl(path, params);
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.status_message ?? `TMDb request failed: ${response.status}`);
  }
  return payload;
}

async function findTmdbAvailability(title: string, mediaType: "tv" | "movie") {
  const searchPath = mediaType === "tv" ? "/search/tv" : "/search/movie";
  const resultsKey = mediaType === "tv" ? "first_air_date" : "release_date";

  const search = await tmdbFetch(searchPath, {
    query: title,
    language: "ja-JP",
    include_adult: false,
    region: "JP",
  });

  const candidates = (search.results ?? []).filter((item: any) => item[resultsKey]);
  const sorted = [...candidates.length ? candidates : (search.results ?? [])].sort((a: any, b: any) => {
    const aVotes = a.vote_count ?? 0;
    const bVotes = b.vote_count ?? 0;
    const aDate = Date.parse(a.first_air_date ?? a.release_date ?? "") || 0;
    const bDate = Date.parse(b.first_air_date ?? b.release_date ?? "") || 0;
    return bVotes - aVotes || bDate - aDate;
  });
  const best = sorted[0];
  if (!best) return null;

  const providers = await tmdbFetch(`/${mediaType}/${best.id}/watch/providers`);
  const jp = providers.results?.JP ?? null;

  return {
    mediaType,
    tmdbId: best.id,
    title: best.name ?? best.title,
    flatrate: (jp?.flatrate ?? []).map(normalizeProvider),
    providerLink: jp?.link ?? null,
  };
}

export async function fetchAndSaveStreamingProviders(
  title: string,
  fallbackTitles: string[] = []
): Promise<StreamingProvidersJp | null> {
  const titlesToTry = [title, ...fallbackTitles].filter(
    (t, i, arr) => Boolean(t?.trim()) && arr.indexOf(t) === i
  );

  let best = null;
  for (const t of titlesToTry) {
    const [tv, movie] = await Promise.all([
      findTmdbAvailability(t, "tv").catch(() => null),
      findTmdbAvailability(t, "movie").catch(() => null),
    ]);
    // Prefer result with actual JP flatrate; TV wins over movie for ties
    const candidate =
      (tv?.flatrate?.length ? tv : null) ??
      (movie?.flatrate?.length ? movie : null) ??
      tv ??
      movie;
    if (candidate?.flatrate?.length) {
      best = candidate;
      break;
    }
    if (candidate && !best) {
      best = candidate;
    }
  }
  if (!best) return null;

  const client = getTursoClient();
  await ensureStreamingProvidersTable(client);

  const data = {
    tmdb_id: best.tmdbId,
    anime_title: title,
    media_type: best.mediaType,
    jp_flatrate: JSON.stringify(best.flatrate),
    provider_link: best.providerLink,
    updated_at: new Date().toISOString(),
  };

  await client.execute({
    sql: `INSERT INTO anime_streaming_providers (tmdb_id, anime_title, media_type, jp_flatrate, provider_link, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            anime_title=excluded.anime_title,
            media_type=excluded.media_type,
            jp_flatrate=excluded.jp_flatrate,
            provider_link=excluded.provider_link,
            updated_at=excluded.updated_at`,
    args: [data.tmdb_id, data.anime_title, data.media_type, data.jp_flatrate, data.provider_link, data.updated_at],
  });

  return {
    flatrate: best.flatrate,
    providerLink: best.providerLink,
    tmdbId: best.tmdbId,
    mediaType: best.mediaType,
    updatedAt: data.updated_at,
  };
}

async function ensureStreamingProvidersTable(client: any) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS anime_streaming_providers (
      tmdb_id INTEGER PRIMARY KEY,
      anime_title TEXT,
      media_type TEXT,
      jp_flatrate TEXT,
      provider_link TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  // migrate: add anime_title column if missing
  await client
    .execute("ALTER TABLE anime_streaming_providers ADD COLUMN anime_title TEXT")
    .catch(() => undefined);
}

export async function getStreamingProvidersByTmdbId(tmdbId: number): Promise<StreamingProvidersJp | null> {
  const client = getTursoClient();
  await ensureStreamingProvidersTable(client);

  const result = await client.execute({
    sql: "SELECT * FROM anime_streaming_providers WHERE tmdb_id = ?",
    args: [tmdbId],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    flatrate: JSON.parse((row.jp_flatrate as string) ?? "[]"),
    providerLink: row.provider_link as string | null,
    tmdbId: row.tmdb_id as number,
    mediaType: row.media_type as "tv" | "movie" | undefined,
    updatedAt: row.updated_at as string,
  };
}

async function getCachedProvidersByTitles(
  client: any,
  titles: string[]
): Promise<Map<string, StreamingProvidersJp>> {
  const map = new Map<string, StreamingProvidersJp>();
  if (!titles.length) return map;

  const placeholders = titles.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `SELECT anime_title, jp_flatrate, provider_link, tmdb_id, media_type, updated_at
          FROM anime_streaming_providers
          WHERE anime_title IN (${placeholders})`,
    args: titles,
  });

  for (const row of result.rows) {
    const t = row.anime_title as string | null;
    if (!t) continue;
    map.set(t, {
      flatrate: JSON.parse((row.jp_flatrate as string) ?? "[]"),
      providerLink: row.provider_link as string | null,
      tmdbId: row.tmdb_id as number,
      mediaType: row.media_type as "tv" | "movie" | undefined,
      updatedAt: row.updated_at as string,
    });
  }

  return map;
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_API_KEY || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_ACCESS_TOKEN);
}

// 「第2期」「Season 2」「3クール」「-Second Season-」などを除去してベースタイトルを返す。
// 変化なければ null を返す。debug エンドポイントからも利用可。
export function stripSeasonQualifierForDebug(title: string): string | null {
  return stripSeasonQualifier(title);
}

function stripSeasonQualifier(title: string): string | null {
  const patterns = [
    /[\s　]+第\d+期\s*$/,
    /[\s　]+\d+クール\s*$/,
    /[\s　]+Season[\s　]+\d+\s*$/i,
    /[\s　]+Part[\s　]+\d+\s*$/i,
    /[\s　]+\d+(st|nd|rd|th)[\s　]+Season\s*$/i,
    /[\s　]+(Second|Third|Fourth|Fifth|Sixth)[\s　]+Season\s*$/i,
    /[\s　]+-\s*(Second|Third|Fourth|Fifth|Sixth|2nd|3rd|4th|5th)[\s　]+Season\s*-\s*$/i,
  ];
  let result = title;
  for (const p of patterns) result = result.replace(p, "").trim();
  return result !== title ? result : null;
}

export type EnrichBuildStats = {
  attempted: number;
  failed: number;
  credentialsMissing: boolean;
};

export async function buildProviderMapWithStats(
  items: AnimeItem[],
  options?: { concurrency?: number; skipUncached?: boolean }
): Promise<{ map: Map<string, StreamingProvidersJp>; stats: EnrichBuildStats }> {
  const map = new Map<string, StreamingProvidersJp>();
  const credentialsMissing = !hasTmdbCredentials();
  if (credentialsMissing) {
    return {
      map,
      stats: { attempted: 0, failed: 0, credentialsMissing: true },
    };
  }

  const allTitles = items.flatMap((item) =>
    [item.title, item.titles?.romaji].filter((t): t is string => Boolean(t?.trim()))
  );
  let cached: Map<string, StreamingProvidersJp>;
  try {
    const client = getTursoClient();
    await ensureStreamingProvidersTable(client);
    cached = await getCachedProvidersByTitles(client, [...new Set(allTitles)]);
  } catch (error) {
    console.error("[streaming-providers] provider cache unavailable:", error);
    return {
      map,
      stats: { attempted: 0, failed: 0, credentialsMissing: false },
    };
  }

  const uncached: AnimeItem[] = [];
  for (const item of items) {
    const hit = cached.get(item.title) ?? (item.titles?.romaji ? cached.get(item.titles.romaji) : undefined);
    if (hit) {
      if (hit.flatrate.length > 0) {
        map.set(item.title, hit);
        if (item.titles?.romaji) map.set(item.titles.romaji, hit);
      }
    } else {
      uncached.push(item);
    }
  }

  // skipUncached: DB キャッシュのみ返す（タイムアウト回避、lazy fetch 向け）
  if (options?.skipUncached) {
    return { map, stats: { attempted: 0, failed: 0, credentialsMissing: false } };
  }

  let failed = 0;
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  for (let index = 0; index < uncached.length; index += concurrency) {
    const batch = uncached.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const baseTitle = stripSeasonQualifier(item.title);
          const baseRomaji = item.titles?.romaji ? stripSeasonQualifier(item.titles.romaji) : null;
          const fallbacks = [
            item.titles?.romaji,
            item.titles?.english,
            item.titles?.userPreferred,
            baseTitle,
            baseRomaji,
          ].filter((t): t is string => Boolean(t?.trim()) && t !== item.title);
          const providers = await fetchAndSaveStreamingProviders(item.title, fallbacks);
          return { item, providers };
        } catch {
          failed += 1;
          return { item, providers: null };
        }
      })
    );

    for (const { item, providers } of results) {
      if (!providers?.flatrate?.length) continue;
      const romajiKey = item.titles?.romaji?.trim();
      if (romajiKey) map.set(romajiKey, providers);
      map.set(item.title, providers);
    }
  }

  return {
    map,
    stats: {
      attempted: uncached.length,
      failed,
      credentialsMissing: false,
    },
  };
}

export async function buildProviderMapForItems(
  items: AnimeItem[],
  options?: { concurrency?: number }
): Promise<Map<string, StreamingProvidersJp>> {
  const { map } = await buildProviderMapWithStats(items, options);
  return map;
}

export function enrichWithStreamingProviders(
  items: AnimeItem[],
  providerMap: Map<string, StreamingProvidersJp>
): AnimeItem[] {
  return items.map((item) => {
    const key = item.titles?.romaji || item.title;
    const providers = providerMap.get(key) ?? providerMap.get(item.title);
    if (providers && providers.flatrate.length > 0) {
      return { ...item, streamingProvidersJp: providers };
    }
    return item;
  });
}
