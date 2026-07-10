import { getCurrentAnimeSeason } from "./season";
import type { AnimeSeason } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** JST カレンダー日付（年・月1-12・日）を返す。season.ts と同じ換算。 */
function getJstYmd(date: Date): { year: number; month: number; day: number } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
  };
}

/** 今期シーズンの最終日（JST カレンダー）。 */
function getSeasonEndYmd(
  year: number,
  season: AnimeSeason
): { year: number; month: number; day: number } {
  switch (season) {
    case "WINTER":
      return { year, month: 3, day: 31 };
    case "SPRING":
      return { year, month: 6, day: 30 };
    case "SUMMER":
      return { year, month: 9, day: 30 };
    case "FALL":
      return { year, month: 12, day: 31 };
  }
}

/**
 * 今期アニメシーズンの最終 28 日以内なら true。
 * seasons: Jan–Mar / Apr–Jun / Jul–Sep / Oct–Dec（JST）。
 */
export function isSeasonEndWindow(now: Date): boolean {
  const { season, year } = getCurrentAnimeSeason(now);
  const today = getJstYmd(now);
  const end = getSeasonEndYmd(year, season);

  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  const dayDiff = Math.floor((endUtc - todayUtc) / MS_PER_DAY);

  // 最終日 = 0、その 27 日前 = 27 → 計 28 日
  return dayDiff >= 0 && dayDiff < 28;
}

/** カレンダー月の 1〜7 日（JST）なら true。 */
export function isMonthStartWindow(now: Date): boolean {
  const { day } = getJstYmd(now);
  return day >= 1 && day <= 7;
}

/** 今期 Tier プロンプトの dismiss キー（シーズン中有効）。 */
export function tierDismissStorageKey(now: Date): string {
  const { season, year } = getCurrentAnimeSeason(now);
  return `numanie:ctx-tier-dismissed:${year}-${season}`;
}

/** サブスク見直しカードの dismiss キー（当月中有効）。 */
export function subscDismissStorageKey(now: Date): string {
  const { year, month } = getJstYmd(now);
  const mm = String(month).padStart(2, "0");
  return `numanie:ctx-subsc-dismissed:${year}-${mm}`;
}

export function shouldShowTierPromptCard(now: Date, dismissed: boolean): boolean {
  return !dismissed && isSeasonEndWindow(now);
}

export function shouldShowSubscReviewCard(now: Date, dismissed: boolean): boolean {
  return !dismissed && isMonthStartWindow(now);
}
