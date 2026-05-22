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
  season?: string | null;
  year?: number | null;
  score?: number | null;
  scored_by?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  rank?: number | null;
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
        }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
