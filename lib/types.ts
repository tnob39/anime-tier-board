export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type AnimeSourceName = "anilist" | "jikan";

export type AnimeTitleSet = {
  native?: string | null;
  userPreferred?: string | null;
  romaji?: string | null;
  english?: string | null;
};

export type AnimeItem = {
  id: string;
  source: AnimeSourceName;
  title: string;
  titles: AnimeTitleSet;
  imageUrl: string;
  proxiedImageUrl: string;
  siteUrl: string;
  format?: string | null;
  season?: AnimeSeason | string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  score?: number | null;
  popularity?: number | null;
  reputation?: AnimeReputation | null;
  airing?: AnimeAiringInfo | null;
  streamingEpisodes?: AnimeStreamingEpisode[];
  streamingPlatforms?: AnimeStreamingPlatform[];
  streamingProvidersJp?: StreamingProvidersJp;
  isRebroadcast?: boolean | null;
  genres?: string[];
  studios?: AnimeStudio[];
  voiceActors?: AnimeVoiceActor[];
  /**
   * Snapshot-only entry (import/custom board). Not from the seasonal catalog.
   * Survives local reconciliation and is included in share item payloads.
   */
  snapshotOnly?: boolean;
  /**
   * Title is an explicit placeholder because the source metadata was uncertain.
   * Do not fuzzy-match or replace with a different catalog anime.
   */
  titleUncertain?: boolean;
};

export type AnimeStudio = {
  id?: string | number | null;
  name: string;
  siteUrl?: string | null;
};

export type AnimeVoiceActor = {
  id?: string | number | null;
  name: string;
  nativeName?: string | null;
  language?: string | null;
  imageUrl?: string | null;
  siteUrl?: string | null;
  characterName?: string | null;
  characterRole?: string | null;
};

export type AnimeReputation = {
  score?: number | null;
  scoreMax?: number | null;
  scoredBy?: number | null;
  popularity?: number | null;
  members?: number | null;
  favourites?: number | null;
  trending?: number | null;
  rank?: number | null;
};

export type AnimeAiringInfo = {
  startDate?: string | null;
  broadcastDay?: string | null;
  broadcastTime?: string | null;
  broadcastTimezone?: string | null;
  broadcastText?: string | null;
  courEstimate?: string | null;
  nextEpisode?: {
    episode: number;
    airingAt: string;
    timeUntilAiringSeconds?: number | null;
  } | null;
  recentEpisodes?: Array<{
    episode: number;
    airingAt: string;
  }>;
};

export type AnimeStreamingEpisode = {
  title?: string | null;
  site?: string | null;
  url: string;
};

export type AnimeStreamingPlatform = {
  name: string;
  url: string;
  source?: AnimeSourceName | "manual" | string;
  region?: string | null;
};

export type StreamingProvider = {
  id: number;
  name: string;
  logoUrl: string | null;
};

export type StreamingProvidersJp = {
  flatrate: StreamingProvider[];
  providerLink?: string | null;
};

export type SeasonalFreshness = "fresh" | "stale" | "unavailable";

export type SeasonalServePath =
  | "fresh_direct"
  | "stale_after_anilist_fail"
  | "live_anilist"
  | "live_jikan"
  | "unavailable";

export type AniListOutcome =
  | "success"
  | "timeout"
  | "transport"
  | "http_429"
  | "http_5xx"
  | "malformed"
  | "empty_results"
  | "skipped";

export type AniListFailureOutcome = Exclude<AniListOutcome, "success" | "skipped">;

export type JikanOutcome =
  | "success"
  | "error"
  | "skipped_pre_policy"
  | "skipped_post_cutoff"
  | "disabled";

export type SeasonalCutoffRegime = "pre" | "post";

/** Structured telemetry for one seasonal source return or throw (exactly one per call). */
export type SeasonalTelemetryEvent = {
  seasonal_key: string;
  source: AnimeSourceName | "cache" | "db_snapshot";
  freshness: SeasonalFreshness | "unusable";
  anilist_outcome: AniListOutcome;
  jikan_outcome: JikanOutcome;
  fetched_at: string;
  cutoff_regime: SeasonalCutoffRegime;
  serve_path: SeasonalServePath;
};

export type SeasonalAnimeResult = {
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
  freshness: SeasonalFreshness;
  servePath: SeasonalServePath;
  fetchedAt: string;
};

export const SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export const SEASON_LABELS: Record<AnimeSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋",
};
