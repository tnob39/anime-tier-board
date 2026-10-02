import type { AnimeSeason } from "./types";

/** Quarter-start instants are 00:00 Asia/Tokyo. Japan has no DST. */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const MIN_SEASON_YEAR = 1900;
export const MAX_SEASON_YEAR = 2100;

export const ANIME_SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export const SEASON_NAME_JA: Record<AnimeSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋"
};

export const SEASON_PATH_SLUG: Record<AnimeSeason, string> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall"
};

export type SeasonRef = {
  year: number;
  season: AnimeSeason;
};

export type JstDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const SEASON_BY_MONTH: AnimeSeason[] = [
  "WINTER",
  "WINTER",
  "WINTER",
  "SPRING",
  "SPRING",
  "SPRING",
  "SUMMER",
  "SUMMER",
  "SUMMER",
  "FALL",
  "FALL",
  "FALL"
];

function isAnimeSeason(value: string): value is AnimeSeason {
  return (
    value === "WINTER" ||
    value === "SPRING" ||
    value === "SUMMER" ||
    value === "FALL"
  );
}

/**
 * Convert an instant to JST calendar parts without using the host timezone.
 * Adds the fixed +09:00 offset, then reads UTC getters on that shifted instant.
 */
export function getJstDateParts(date: Date): JstDateParts {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
    second: jst.getUTCSeconds(),
    millisecond: jst.getUTCMilliseconds()
  };
}

/** Instant of `year-month-day 00:00:00.000 JST` as a UTC Date. */
export function jstStartUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - JST_OFFSET_MS);
}

export function seasonStartUtc(ref: SeasonRef): Date {
  switch (ref.season) {
    case "WINTER":
      return jstStartUtc(ref.year, 1, 1);
    case "SPRING":
      return jstStartUtc(ref.year, 4, 1);
    case "SUMMER":
      return jstStartUtc(ref.year, 7, 1);
    case "FALL":
      return jstStartUtc(ref.year, 10, 1);
  }
}

export function getCurrentAnimeSeason(date = new Date()): SeasonRef {
  const { year, month } = getJstDateParts(date);
  return { season: SEASON_BY_MONTH[month - 1], year };
}

export function seasonIndex(season: AnimeSeason): number {
  return ANIME_SEASONS.indexOf(season);
}

export function shiftSeason(ref: SeasonRef, delta: number): SeasonRef {
  const raw = seasonIndex(ref.season) + delta;
  const cycle = ((raw % ANIME_SEASONS.length) + ANIME_SEASONS.length) % ANIME_SEASONS.length;
  const yearDelta = Math.floor(raw / ANIME_SEASONS.length);
  return {
    year: ref.year + yearDelta,
    season: ANIME_SEASONS[cycle]
  };
}

export function previousSeason(ref: SeasonRef): SeasonRef {
  return shiftSeason(ref, -1);
}

export function nextSeason(ref: SeasonRef): SeasonRef {
  return shiftSeason(ref, 1);
}

/** Previous quarter of the current season at `date` (year wrap included). */
export function getPreviousAnimeSeason(date = new Date()): SeasonRef {
  return previousSeason(getCurrentAnimeSeason(date));
}

/** Next quarter of the current season at `date` (year wrap included). */
export function getNextAnimeSeason(date = new Date()): SeasonRef {
  return nextSeason(getCurrentAnimeSeason(date));
}

export function equalSeasonRef(a: SeasonRef, b: SeasonRef): boolean {
  return a.year === b.year && a.season === b.season;
}

export function isSeasonYearInRange(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_SEASON_YEAR && year <= MAX_SEASON_YEAR;
}

export function parseSeasonYear(value: unknown): number | null {
  if (typeof value === "number") {
    return isSeasonYearInRange(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const year = Number(trimmed);
  return isSeasonYearInRange(year) ? year : null;
}

export function normalizeSeason(value: string | null | undefined): AnimeSeason | null {
  if (value == null) {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return isAnimeSeason(upper) ? upper : null;
}

export function parseSeasonRef(input: {
  year?: unknown;
  season?: unknown;
}): SeasonRef | null {
  const year = parseSeasonYear(input.year ?? null);
  const season =
    typeof input.season === "string" || input.season == null
      ? normalizeSeason(input.season ?? null)
      : null;
  if (year == null || season == null) {
    return null;
  }
  return { year, season };
}

export function parseSeasonPathParts(yearParam: string, seasonParam: string): SeasonRef | null {
  const year = parseSeasonYear(yearParam);
  const season = normalizeSeason(seasonParam);
  if (year == null || season == null) {
    return null;
  }
  if (seasonParam !== SEASON_PATH_SLUG[season]) {
    return null;
  }
  return { year, season };
}

export function seasonLabelJa(season: AnimeSeason, year: number): string {
  return `${year}${SEASON_NAME_JA[season]}`;
}

export function seasonHeadingJa(ref: SeasonRef): string {
  return `${ref.year}年${SEASON_NAME_JA[ref.season]}`;
}

export function currentSeasonLabelJa(ref: SeasonRef): string {
  return `今期（${seasonHeadingJa(ref)}）`;
}

export function selectedSeasonLabelJa(ref: SeasonRef): string {
  return `選択中の期（${seasonHeadingJa(ref)}）`;
}

export function autoDetectedSeasonLabelJa(ref: SeasonRef): string {
  return `現在（${seasonHeadingJa(ref)}）`;
}

export function contextKindLabelJa(ref: SeasonRef, now = new Date()): string {
  const current = getCurrentAnimeSeason(now);
  return equalSeasonRef(ref, current) ? currentSeasonLabelJa(ref) : selectedSeasonLabelJa(ref);
}

export function listSeasonSelectorYears(options?: {
  now?: Date;
  selectedYear?: number;
  startYear?: number;
  endYear?: number;
}): number[] {
  const now = options?.now ?? new Date();
  const currentYear = getCurrentAnimeSeason(now).year;
  const start = options?.startYear ?? 1990;
  const end = options?.endYear ?? currentYear + 1;
  const years: number[] = [];
  for (let year = end; year >= start; year -= 1) {
    if (isSeasonYearInRange(year)) {
      years.push(year);
    }
  }
  const selected = options?.selectedYear;
  if (selected != null && isSeasonYearInRange(selected) && !years.includes(selected)) {
    years.push(selected);
    years.sort((a, b) => b - a);
  }
  return years;
}

export function listCompactSeasonSelectorYears(now = new Date(), selectedYear?: number): number[] {
  const currentYear = getCurrentAnimeSeason(now).year;
  const start = currentYear - 3;
  const years = Array.from({ length: 8 }, (_, index) => start + index).filter(isSeasonYearInRange);
  if (selectedYear != null && isSeasonYearInRange(selectedYear) && !years.includes(selectedYear)) {
    years.push(selectedYear);
    years.sort((a, b) => a - b);
  }
  return years;
}
