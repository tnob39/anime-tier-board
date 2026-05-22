import type { AnimeItem, AnimeSeason } from "../types";
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
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  trending?: number | null;
  isAdult?: boolean | null;
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
        averageScore
        popularity
        favourites
        trending
        isAdult
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
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          page,
          perPage: PER_PAGE,
          season,
          seasonYear: year
        }
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`AniList request failed: ${response.status}`);
    }

    const payload = (await response.json()) as AniListResponse;

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
        score: entry.averageScore,
        popularity: entry.popularity,
        reputation: {
          score: entry.averageScore,
          scoreMax: 100,
          popularity: entry.popularity,
          favourites: entry.favourites,
          trending: entry.trending
        }
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
