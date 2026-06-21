import type { AnimeStatusRecord, ViewingStatus } from '@/lib/statuses';
import type { AnimeItem } from '@/lib/types';

export type SortMode = 'fit' | 'popularity' | 'score';

export type RankedExploreItem = {
  item: AnimeItem;
  fitScore: number;
  reason: string;
};

type Preferences = {
  genres: Map<string, number>;
  studios: Map<string, number>;
  actors: Map<string, number>;
};

export function buildPreferences(records: AnimeStatusRecord[]): Preferences {
  const genres = new Map<string, number>();
  const studios = new Map<string, number>();
  const actors = new Map<string, number>();

  for (const record of records) {
    if (record.status === 'dropped') {
      continue;
    }

    const weight =
      record.favoriteLevel ??
      (record.status === 'completed' || record.status === 'watching' ? 3 : 0.5);

    for (const genre of record.anime?.genres ?? []) {
      addWeight(genres, genre, weight);
    }
    for (const studio of record.anime?.studios ?? []) {
      addWeight(studios, studio.name, weight);
    }
    for (const actor of record.anime?.voiceActors ?? []) {
      addWeight(actors, actor.name, weight);
    }
  }

  return { genres, studios, actors };
}

export function rankItems(
  items: AnimeItem[],
  preferences: Preferences,
  statusMap: Record<string, ViewingStatus>,
  sortMode: SortMode
): RankedExploreItem[] {
  return items
    .map((item) => {
      const fitScore = getFitScore(item, preferences, statusMap[item.id]);
      return { item, fitScore, reason: getReason(item, preferences, fitScore) };
    })
    .sort((a, b) => {
      if (sortMode === 'fit') {
        return b.fitScore - a.fitScore || getPopularity(b.item) - getPopularity(a.item);
      }
      if (sortMode === 'score') {
        return getScore(b.item) - getScore(a.item) || getPopularity(b.item) - getPopularity(a.item);
      }
      return getPopularity(b.item) - getPopularity(a.item) || getScore(b.item) - getScore(a.item);
    })
    .slice(0, 50);
}

function getFitScore(
  item: AnimeItem,
  preferences: Preferences,
  currentStatus?: ViewingStatus
): number {
  let score = 0;

  for (const genre of item.genres ?? []) {
    score += preferences.genres.get(genre) ?? 0;
  }
  for (const studio of item.studios ?? []) {
    score += (preferences.studios.get(studio.name) ?? 0) * 1.3;
  }
  for (const actor of item.voiceActors ?? []) {
    score += (preferences.actors.get(actor.name) ?? 0) * 0.8;
  }

  score += Math.min(10, getScore(item) / 10);
  score += Math.min(8, getPopularity(item) / 100000);

  if (currentStatus === 'completed' || currentStatus === 'dropped') {
    score -= 30;
  }

  return Math.max(0, Math.round(score));
}

function getReason(item: AnimeItem, preferences: Preferences, fitScore: number): string {
  const matchedGenre = item.genres?.find((genre) => preferences.genres.has(genre));
  const matchedStudio = item.studios?.find((studio) => preferences.studios.has(studio.name));
  const matchedActor = item.voiceActors?.find((actor) => preferences.actors.has(actor.name));

  if (matchedGenre) {
    return `よく見ているジャンル「${matchedGenre}」に近い候補です。`;
  }
  if (matchedStudio) {
    return `保存済み作品と同じ制作会社「${matchedStudio.name}」の候補です。`;
  }
  if (matchedActor) {
    return `気になる声優「${matchedActor.name}」が参加しています。`;
  }
  if (fitScore > 10) {
    return '評価と人気のバランスがよい候補です。';
  }
  return 'この年代の代表候補としてチェックできます。';
}

function addWeight(map: Map<string, number>, key: string, weight: number) {
  const normalized = key.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + weight);
}

export function getPopularity(item: AnimeItem) {
  return item.popularity ?? item.reputation?.members ?? item.reputation?.popularity ?? 0;
}

export function getScore(item: AnimeItem) {
  const raw = item.score ?? item.reputation?.score ?? 0;
  if (!raw) {
    return 0;
  }

  const scoreMax =
    item.reputation?.scoreMax ??
    (item.source === 'jikan' ? 10 : 100);

  if (scoreMax <= 0) {
    return 0;
  }

  return (raw / scoreMax) * 100;
}

export function formatScore(item: AnimeItem) {
  const score = getScore(item);
  return score ? String(Math.round(score)) : '-';
}

export function formatNumber(value?: number | null) {
  if (!value) return '-';
  return new Intl.NumberFormat('ja-JP', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}