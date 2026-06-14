export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export type AnimeSourceName = 'anilist' | 'jikan';

export type AnimeTitleSet = {
  native?: string | null;
  userPreferred?: string | null;
  romaji?: string | null;
  english?: string | null;
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
};

export type AnimeStreamingEpisode = {
  title?: string | null;
  site?: string | null;
  url: string;
};

export type AnimeStreamingPlatform = {
  name: string;
  url: string;
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

export type AnimeStudio = {
  id?: string | number | null;
  name: string;
};

export type AnimeVoiceActor = {
  id?: string | number | null;
  name: string;
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
};

export const SEASONS: AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export const SEASON_LABELS: Record<AnimeSeason, string> = {
  WINTER: '冬',
  SPRING: '春',
  SUMMER: '夏',
  FALL: '秋',
};