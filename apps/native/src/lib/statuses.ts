import type { AnimeItem } from '@/lib/types';

export const VIEWING_STATUSES = ['planned', 'watching', 'completed', 'paused', 'dropped'] as const;

export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export type AnimeStatusRecord = {
  animeId: string;
  status: ViewingStatus;
  anime: AnimeItem | null;
  favoriteLevel: number | null;
  watchSlot: string | null;
  notes: string | null;
  watchedEpisodes: number | null;
  updatedAt: string;
};

export const STATUS_LABELS: Record<ViewingStatus, string> = {
  planned: '見たい',
  watching: '視聴中',
  completed: '完了',
  paused: '保留',
  dropped: '中止',
};

export function isViewingStatus(value: string): value is ViewingStatus {
  return VIEWING_STATUSES.includes(value as ViewingStatus);
}