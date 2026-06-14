import type { AnimeSeason } from '@/lib/types';

export function getCurrentAnimeSeason(date = new Date()): {
  season: AnimeSeason;
  year: number;
} {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jstDate.getUTCMonth() + 1;
  const year = jstDate.getUTCFullYear();

  if (month <= 3) {
    return { season: 'WINTER', year };
  }

  if (month <= 6) {
    return { season: 'SPRING', year };
  }

  if (month <= 9) {
    return { season: 'SUMMER', year };
  }

  return { season: 'FALL', year };
}