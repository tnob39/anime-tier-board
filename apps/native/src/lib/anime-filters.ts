import type { AnimeItem } from '@/lib/types';

export type FilterAnimeItemsOptions = {
  hideMovies: boolean;
  hideRerunCandidates: boolean;
  seasonYear: number;
  onlyInstantWatch?: boolean;
};

export function filterAnimeItems(items: AnimeItem[], options: FilterAnimeItemsOptions): AnimeItem[] {
  return items.filter((item) => {
    if (options.hideMovies && isMovie(item)) {
      return false;
    }

    if (options.hideRerunCandidates && isRerunCandidate(item, options.seasonYear)) {
      return false;
    }

    if (options.onlyInstantWatch && !hasInstantWatch(item)) {
      return false;
    }

    return true;
  });
}

function hasInstantWatch(item: AnimeItem): boolean {
  const flatrate = item.streamingProvidersJp?.flatrate;
  if (Array.isArray(flatrate) && flatrate.length > 0) {
    return true;
  }

  if (item.streamingPlatforms?.some((platform) => platform.url && platform.name)) {
    return true;
  }

  return (item.streamingEpisodes ?? []).some((episode) => Boolean(episode.url));
}

function isMovie(item: AnimeItem): boolean {
  return normalizeFormat(item.format) === 'MOVIE';
}

function isRerunCandidate(item: AnimeItem, selectedYear: number): boolean {
  if (item.isRebroadcast) {
    return true;
  }

  const format = normalizeFormat(item.format);
  if (!['TV', 'TV_SHORT', 'ONA', 'SPECIAL'].includes(format)) {
    return false;
  }

  const originalYear = getOriginalStartYear(item);
  return typeof originalYear === 'number' && originalYear < selectedYear;
}

function getOriginalStartYear(item: AnimeItem): number | null {
  if (item.airing?.startDate) {
    const parsed = new Date(item.airing.startDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getUTCFullYear();
    }
  }

  return item.seasonYear ?? null;
}

function normalizeFormat(format?: string | null): string {
  return format?.trim().replace(/\s+/g, '_').toUpperCase() ?? '';
}