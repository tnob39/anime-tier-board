import type { AnimeAiringInfo, AnimeItem, AnimeSeason } from "../types";
import { pickDisplayTitle, proxiedImageUrl } from "./shared";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const PER_PAGE = 50;
const MAX_PAGES = 5;

type AniListMedia = {
  id: number;
  title: {
    native?: string | null;
    userPreferred?: string | null;
    romaji?: string | null;
    english?: string | null;
  };
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  } | null;
  siteUrl?: string | null;
  format?: string | null;
  season?: AnimeSeason | null;
  seasonYear?: number | null;
  episodes?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  trending?: number | null;
  genres?: string[] | null;
  studios?: {
    nodes?: Array<{
      id?: number | null;
      name?: string | null;
      siteUrl?: string | null;
      isAnimationStudio?: boolean | null;
    }>;
  } | null;
  characters?: {
    edges?: Array<{
      role?: string | null;
      node?: {
        name?: {
          full?: string | null;
          native?: string | null;
          userPreferred?: string | null;
        } | null;
      } | null;
      voiceActors?: Array<{
        id?: number | null;
        name?: {
          full?: string | null;
          native?: string | null;
          userPreferred?: string | null;
        } | null;
        languageV2?: string | null;
        image?: {
          large?: string | null;
          medium?: string | null;
        } | null;
        siteUrl?: string | null;
      }>;
    }>;
  } | null;
  isAdult?: boolean | null;
  startDate?: AniListDate | null;
  nextAiringEpisode?: {
    airingAt?: number | null;
    timeUntilAiring?: number | null;
    episode?: number | null;
  } | null;
  airingSchedule?: {
    nodes?: Array<{
      airingAt?: number | null;
      episode?: number | null;
    }>;
  } | null;
  streamingEpisodes?: Array<{
    title?: string | null;
    site?: string | null;
    url?: string | null;
  }>;
};

type AniListDate = {
  year?: number | null;
  month?: number | null;
  day?: number | null;
};

type AniListPage = {
  pageInfo?: {
    hasNextPage?: boolean;
  };
  media?: AniListMedia[];
};

type AniListResponse = {
  data?: {
    Page?: AniListPage;
  };
  errors?: Array<{ message?: string }>;
};

const query = `
  query SeasonalAnime($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        sort: [POPULARITY_DESC]
        isAdult: false
      ) {
        id
        title {
          native
          userPreferred
          romaji
          english
        }
        coverImage {
          extraLarge
          large
          medium
        }
        siteUrl
        format
        season
        seasonYear
        episodes
        averageScore
        popularity
        favourites
        trending
        genres
        studios {
          nodes {
            id
            name
            siteUrl
            isAnimationStudio
          }
        }
        characters(perPage: 12) {
          edges {
            role
            node {
              name {
                full
                native
                userPreferred
              }
            }
            voiceActors(language: JAPANESE) {
              id
              name {
                full
                native
                userPreferred
              }
              languageV2
              image {
                large
                medium
              }
              siteUrl
            }
          }
        }
        isAdult
        startDate {
          year
          month
          day
        }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
        airingSchedule(notYetAired: false, perPage: 3) {
          nodes {
            airingAt
            episode
          }
        }
        streamingEpisodes {
          title
          site
          url
        }
      }
    }
  }
`;

const safeQuery = `
  query SeasonalAnime($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        sort: [POPULARITY_DESC]
        isAdult: false
      ) {
        id
        title {
          native
          userPreferred
          romaji
          english
        }
        coverImage {
          extraLarge
          large
          medium
        }
        siteUrl
        format
        season
        seasonYear
        episodes
        averageScore
        popularity
        favourites
        trending
        genres
        isAdult
        startDate {
          year
          month
          day
        }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
        airingSchedule(notYetAired: false, perPage: 3) {
          nodes {
            airingAt
            episode
          }
        }
        streamingEpisodes {
          title
          site
          url
        }
      }
    }
  }
`;

export async function fetchAniListSeasonalAnime(
  year: number,
  season: AnimeSeason
): Promise<AnimeItem[]> {
  const items: AnimeItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchAniListPage({
      page,
      perPage: PER_PAGE,
      season,
      seasonYear: year
    });

    if (payload.errors?.length) {
      throw new Error(
        payload.errors.map((error) => error.message).filter(Boolean).join(", ") ||
          "AniList returned an error"
      );
    }

    const pageData = payload.data?.Page;
    const media = pageData?.media ?? [];

    for (const entry of media) {
      if (entry.isAdult) {
        continue;
      }

      const imageUrl =
        entry.coverImage?.extraLarge ??
        entry.coverImage?.large ??
        entry.coverImage?.medium;

      if (!imageUrl) {
        continue;
      }

      const titles = {
        native: entry.title.native,
        userPreferred: entry.title.userPreferred,
        romaji: entry.title.romaji,
        english: entry.title.english
      };

      const streamingEpisodes = (entry.streamingEpisodes ?? [])
        .filter((episode) => Boolean(episode.url))
        .map((episode) => ({
          title: episode.title,
          site: episode.site,
          url: episode.url as string
        }));

      items.push({
        id: `anilist-${entry.id}`,
        source: "anilist",
        title: pickDisplayTitle(titles),
        titles,
        imageUrl,
        proxiedImageUrl: proxiedImageUrl(imageUrl),
        siteUrl: entry.siteUrl ?? `https://anilist.co/anime/${entry.id}`,
        format: entry.format,
        season: entry.season,
        seasonYear: entry.seasonYear,
        episodes: entry.episodes,
        score: entry.averageScore,
        popularity: entry.popularity,
        reputation: {
          score: entry.averageScore,
          scoreMax: 100,
          popularity: entry.popularity,
          favourites: entry.favourites,
          trending: entry.trending
        },
        genres: cleanStringList(entry.genres),
        studios: (entry.studios?.nodes ?? [])
          .filter((studio) => studio.isAnimationStudio !== false)
          .map((studio) => ({
            id: studio.id,
            name: studio.name?.trim() ?? "",
            siteUrl: studio.siteUrl
          }))
          .filter((studio) => studio.name.length > 0),
        voiceActors: formatAniListVoiceActors(entry.characters),
        airing: {
          startDate: formatAniListDate(entry.startDate),
          courEstimate: estimateCour(entry.episodes),
          broadcastDay: deriveBroadcastDay(entry.nextAiringEpisode?.airingAt),
          nextEpisode: formatAniListNextEpisode(entry.nextAiringEpisode),
          recentEpisodes: (entry.airingSchedule?.nodes ?? [])
            .filter(
              (node) =>
                typeof node.episode === "number" &&
                typeof node.airingAt === "number"
            )
            .map((node) => ({
              episode: node.episode as number,
              airingAt: formatUnixSeconds(node.airingAt as number)
            }))
        },
        isRebroadcast: isLikelyRebroadcast(entry),
        streamingEpisodes,
        streamingPlatforms: normalizeStreamingPlatforms(streamingEpisodes)
      });
    }

    if (!pageData?.pageInfo?.hasNextPage || media.length === 0) {
      break;
    }
  }

  if (items.length === 0) {
    throw new Error("AniList returned no seasonal anime");
  }

  return dedupeById(items);
}

function normalizeStreamingPlatforms(
  episodes: Array<{ title?: string | null; site?: string | null; url: string }>
) {
  const platforms = new Map<string, { name: string; url: string; source: "anilist" }>();

  for (const episode of episodes) {
    const name = normalizePlatformName(episode.site ?? inferPlatformName(episode.url));
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (!platforms.has(key)) {
      platforms.set(key, {
        name,
        url: episode.url,
        source: "anilist"
      });
    }
  }

  return Array.from(platforms.values()).slice(0, 5);
}

function normalizePlatformName(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/\s*-\s*Watch\s*$/i, "")
    .replace(/\s+streaming$/i, "")
    .trim();
}

function inferPlatformName(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const [name] = host.split(".");
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
  } catch {
    return null;
  }
}

function isLikelyRebroadcast(entry: AniListMedia): boolean {
  const combinedText = [
    entry.title.native,
    entry.title.userPreferred,
    entry.title.romaji,
    entry.title.english,
    ...(entry.streamingEpisodes ?? []).flatMap((episode) => [episode.title, episode.site])
  ]
    .filter(Boolean)
    .join(" ");

  return /再放送|再配信|rerun|rebroadcast|re-air/i.test(combinedText);
}

async function fetchAniListPage(variables: {
  page: number;
  perPage: number;
  season: AnimeSeason;
  seasonYear: number;
}): Promise<AniListResponse> {
  try {
    return await requestAniListPage(query, variables);
  } catch (error) {
    if (error instanceof AniListHttpError && error.status === 400) {
      return requestAniListPage(safeQuery, variables);
    }

    throw error;
  }
}

async function requestAniListPage(
  queryText: string,
  variables: {
    page: number;
    perPage: number;
    season: AnimeSeason;
    seasonYear: number;
  }
): Promise<AniListResponse> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      query: queryText,
      variables
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AniListHttpError(response.status, detail);
  }

  return (await response.json()) as AniListResponse;
}

class AniListHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(
      `AniList request failed: ${status}${detail ? ` ${detail.slice(0, 240)}` : ""}`
    );
  }
}

function cleanStringList(values?: Array<string | null> | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      continue;
    }

    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }

  return result;
}

function formatAniListVoiceActors(
  characters?: AniListMedia["characters"]
): NonNullable<AnimeItem["voiceActors"]> {
  const seen = new Set<string>();
  const voiceActors: NonNullable<AnimeItem["voiceActors"]> = [];

  for (const edge of characters?.edges ?? []) {
    const characterName =
      edge.node?.name?.userPreferred ??
      edge.node?.name?.full ??
      edge.node?.name?.native ??
      null;

    for (const actor of edge.voiceActors ?? []) {
      const name =
        actor.name?.userPreferred ?? actor.name?.full ?? actor.name?.native ?? null;
      const trimmedName = name?.trim();

      if (!trimmedName) {
        continue;
      }

      const key = `${actor.id ?? trimmedName}:${characterName ?? ""}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      voiceActors.push({
        id: actor.id,
        name: trimmedName,
        nativeName: actor.name?.native,
        language: actor.languageV2,
        imageUrl: actor.image?.large ?? actor.image?.medium ?? null,
        siteUrl: actor.siteUrl,
        characterName,
        characterRole: edge.role
      });
    }
  }

  return voiceActors;
}

function formatAniListDate(date?: AniListDate | null): string | null {
  if (!date?.year || !date.month || !date.day) {
    return null;
  }

  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(
    date.day
  ).padStart(2, "0")}`;
}

function formatAniListNextEpisode(
  nextEpisode?: AniListMedia["nextAiringEpisode"]
): NonNullable<AnimeAiringInfo["nextEpisode"]> | null {
  if (
    !nextEpisode ||
    typeof nextEpisode.episode !== "number" ||
    typeof nextEpisode.airingAt !== "number"
  ) {
    return null;
  }

  return {
    episode: nextEpisode.episode,
    airingAt: formatUnixSeconds(nextEpisode.airingAt),
    timeUntilAiringSeconds: nextEpisode.timeUntilAiring
  };
}

function estimateCour(episodes?: number | null): string | null {
  if (typeof episodes !== "number" || episodes <= 0) {
    return null;
  }

  if (episodes <= 13) {
    return "1クール";
  }

  if (episodes <= 26) {
    return "2クール";
  }

  if (episodes <= 39) {
    return "3クール";
  }

  return "4クール以上";
}

function formatUnixSeconds(value: number): string {
  return new Date(value * 1000).toISOString();
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function deriveBroadcastDay(unixSeconds?: number | null): string | null {
  if (!unixSeconds) return null;
  const jstDate = new Date(unixSeconds * 1000 + JST_OFFSET_MS);
  return WEEKDAY_NAMES[jstDate.getUTCDay()];
}

function dedupeById(items: AnimeItem[]): AnimeItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}
