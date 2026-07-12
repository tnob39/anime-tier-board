import {
  BROADCAST_WEEKDAYS,
  groupItemsByBroadcastDay,
  type BroadcastAiringState,
  type BroadcastWeekday
} from "./broadcast-calendar.ts";
import type { HomeAnimeSnapshot } from "./home-next-action-candidates";
import type { AnimeStatusRecord, ViewingStatus } from "./statuses";
import type { AnimeItem } from "./types";

export type HomeWeekItem = {
  anime: AnimeItem;
  status: Extract<ViewingStatus, "watching" | "planned">;
  watchedEpisodes: number | null;
  weekday: BroadcastWeekday;
  state: BroadcastAiringState;
  startLabel: string | null;
  updatedAt: string;
};

export type BuildHomeWeekOptions = {
  now: Date;
  seasonal: HomeAnimeSnapshot;
};

export function buildHomeWeek(
  records: readonly AnimeStatusRecord[],
  options: BuildHomeWeekOptions
): HomeWeekItem[] {
  if (!Number.isFinite(options.now.getTime())) {
    throw new RangeError("now must be a finite Date");
  }

  const seasonalAiringById = indexSeasonalAiring(options.seasonal);
  const prepared: AnimeStatusRecord[] = [];

  for (const record of records) {
    if (record.status !== "watching" && record.status !== "planned") {
      continue;
    }
    if (record.anime === null) {
      continue;
    }

    const seasonalAiring = seasonalAiringById.get(record.animeId);
    if (seasonalAiring !== undefined) {
      prepared.push({
        ...record,
        anime: { ...record.anime, airing: seasonalAiring }
      });
    } else {
      prepared.push(record);
    }
  }

  const grouped = groupItemsByBroadcastDay(prepared, options.now);
  const result: HomeWeekItem[] = [];

  for (const weekday of BROADCAST_WEEKDAYS) {
    const items = grouped[weekday]
      .map((entry): HomeWeekItem => ({
        anime: entry.record.anime as AnimeItem,
        status: entry.record.status as Extract<ViewingStatus, "watching" | "planned">,
        watchedEpisodes: entry.record.watchedEpisodes,
        weekday,
        state: entry.state,
        startLabel: entry.startLabel,
        updatedAt: entry.record.updatedAt
      }))
      .sort(compareHomeWeekItems);

    for (const item of items) {
      result.push(item);
    }
  }

  return result;
}

function indexSeasonalAiring(
  seasonal: HomeAnimeSnapshot
): Map<string, NonNullable<AnimeItem["airing"]>> {
  const map = new Map<string, NonNullable<AnimeItem["airing"]>>();
  if (seasonal.freshness === "unavailable" || seasonal.items === null) {
    return map;
  }

  const seen = new Set<string>();
  for (const item of seasonal.items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    if (item.airing != null) {
      map.set(item.id, item.airing);
    }
  }
  return map;
}

function compareHomeWeekItems(a: HomeWeekItem, b: HomeWeekItem): number {
  if (a.state !== b.state) {
    return a.state === "airing" ? -1 : 1;
  }

  const aAt = a.anime.airing?.nextEpisode?.airingAt ?? "";
  const bAt = b.anime.airing?.nextEpisode?.airingAt ?? "";
  if (aAt < bAt) {
    return -1;
  }
  if (aAt > bAt) {
    return 1;
  }

  const aId = a.anime.id;
  const bId = b.anime.id;
  if (aId < bId) {
    return -1;
  }
  if (aId > bId) {
    return 1;
  }

  if (a.updatedAt > b.updatedAt) {
    return -1;
  }
  if (a.updatedAt < b.updatedAt) {
    return 1;
  }

  return 0;
}
