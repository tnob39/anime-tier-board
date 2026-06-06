import type { AnimeItem, AnimeSeason } from "../types";
import { pickDisplayTitle, proxiedImageUrl } from "./shared";

const JIKAN_ENDPOINT = "https://api.jikan.moe/v4/seasons";
const MAX_PAGES = 5;

type JikanAnime = {
  mal_id: number;
  url?: string | null;
  images?: {
    webp?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
  };
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  titles?: Array<{
    type?: string | null;
    title?: string | null;
  }>;
  type?: string | null;
  episodes?: number | null;
  season?: string | null;
  year?: number | null;
  score?: number | null;
  scored_by?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  rank?: number | null;
  genres?: JikanNamedResource[];
  explicit_genres?: JikanNamedResource[];
  themes?: JikanNamedResource[];
  studios?: JikanNamedResource[];
  broadcast?: {
    day?: string | null;
    time?: string | null;
    timezone?: string | null;
    string?: string | null;
  } | null;
  aired?: {
    from?: string | null;
  } | null;
};

type JikanNamedResource = {
  mal_id?: number | null;
  name?: string | null;
  url?: string | null;
};

type JikanResponse = {
  data?: JikanAnime[];
  pagination?: {
    has_next_page?: boolean;
  };
};

const jikanSeasonMap: Record<AnimeSeason, string> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall"
};

export async function fetchJikanSeasonalAnime(
  year: number,
  season: AnimeSeason
): Promise<AnimeItem[]> {
  const items: AnimeItem[] = [];
  const seasonSlug = jikanSeasonMap[season];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${JIKAN_ENDPOINT}/${year}/${seasonSlug}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "25");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Jikan request failed: ${response.status}`);
    }

    const payload = (await response.json()) as JikanResponse;
    const data = payload.data ?? [];

    for (const entry of data) {
      const imageUrl =
        entry.images?.webp?.large_image_url ??
        entry.images?.webp?.image_url ??
        entry.images?.jpg?.large_image_url ??
        entry.images?.jpg?.image_url;

      if (!imageUrl) {
        continue;
      }

      const titles = {
        native:
          entry.title_japanese ??
          entry.titles?.find((title) => title.type === "Japanese")?.title,
        userPreferred: entry.title,
        romaji: entry.titles?.find((title) => title.type === "Default")?.title,
        english: entry.title_english
      };

      items.push({
        id: `jikan-${entry.mal_id}`,
        source: "jikan",
        title: pickDisplayTitle(titles),
        titles,
        imageUrl,
        proxiedImageUrl: proxiedImageUrl(imageUrl),
        siteUrl: entry.url ?? `https://myanimelist.net/anime/${entry.mal_id}`,
        format: entry.type,
        season: entry.season,
        seasonYear: entry.year,
        episodes: entry.episodes,
        score: entry.score,
        popularity: entry.popularity,
        reputation: {
          score: entry.score,
          scoreMax: 10,
          scoredBy: entry.scored_by,
          popularity: entry.popularity,
          members: entry.members,
          favourites: entry.favorites,
          rank: entry.rank
        },
        genres: cleanStringList([
          ...(entry.genres ?? []),
          ...(entry.explicit_genres ?? []),
          ...(entry.themes ?? [])
        ].map((genre) => genre.name)),
        studios: (entry.studios ?? [])
          .map((studio) => ({
            id: studio.mal_id,
            name: studio.name?.trim() ?? "",
            siteUrl: studio.url
          }))
          .filter((studio) => studio.name.length > 0),
        airing: {
          startDate: entry.aired?.from ?? null,
          broadcastDay: entry.broadcast?.day ?? null,
          broadcastTime: entry.broadcast?.time ?? null,
          broadcastTimezone: entry.broadcast?.timezone ?? null,
          broadcastText: entry.broadcast?.string ?? null,
          courEstimate: estimateCour(entry.episodes)
        },
        isRebroadcast: isLikelyRebroadcast(entry),
        streamingEpisodes: [],
        streamingPlatforms: []
      });
    }

    if (!payload.pagination?.has_next_page || data.length === 0) {
      break;
    }

    await sleep(350);
  }

  if (items.length === 0) {
    throw new Error("Jikan returned no seasonal anime");
  }

  return dedupeById(items);
}

function isLikelyRebroadcast(entry: JikanAnime): boolean {
  const combinedText = [
    entry.title,
    entry.title_english,
    entry.title_japanese,
    ...(entry.titles ?? []).map((title) => title.title),
    entry.broadcast?.string
  ]
    .filter(Boolean)
    .join(" ");

  return /再放送|再配信|rerun|rebroadcast|re-air/i.test(combinedText);
}

function cleanStringList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      continue;
    }

    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
