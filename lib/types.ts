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
  score?: number | null;
  popularity?: number | null;
  reputation?: AnimeReputation | null;
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

export type SeasonalAnimeResult = {
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
};

export const SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export const SEASON_LABELS: Record<AnimeSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋"
};
