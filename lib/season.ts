import type { AnimeSeason } from "./types";

export function getCurrentAnimeSeason(date = new Date()): {
  season: AnimeSeason;
  year: number;
} {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jstDate.getUTCMonth() + 1;
  const year = jstDate.getUTCFullYear();

  if (month <= 3) {
    return { season: "WINTER", year };
  }

  if (month <= 6) {
    return { season: "SPRING", year };
  }

  if (month <= 9) {
    return { season: "SUMMER", year };
  }

  return { season: "FALL", year };
}

export function normalizeSeason(value: string | null): AnimeSeason | null {
  const upper = value?.toUpperCase();

  if (
    upper === "WINTER" ||
    upper === "SPRING" ||
    upper === "SUMMER" ||
    upper === "FALL"
  ) {
    return upper;
  }

  return null;
}
