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

const SEASON_ORDER: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

/** 現在シーズンの次のシーズン（年越し含む）を返す。 */
export function getNextAnimeSeason(date = new Date()): {
  season: AnimeSeason;
  year: number;
} {
  const current = getCurrentAnimeSeason(date);
  const currentIndex = SEASON_ORDER.indexOf(current.season);
  const nextIndex = (currentIndex + 1) % SEASON_ORDER.length;
  const nextYear = nextIndex === 0 ? current.year + 1 : current.year;

  return { season: SEASON_ORDER[nextIndex], year: nextYear };
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

export function seasonLabelJa(season: AnimeSeason, year: number): string {
  const labels: Record<AnimeSeason, string> = {
    WINTER: "冬",
    SPRING: "春",
    SUMMER: "夏",
    FALL: "秋"
  };

  return `${year}${labels[season]}`;
}
