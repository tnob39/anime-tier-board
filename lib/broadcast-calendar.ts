import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

export const BROADCAST_WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export type BroadcastWeekday = (typeof BROADCAST_WEEKDAYS)[number];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * broadcastDay の文字列（英語曜日など）を日本語1文字に正規化する。
 * 認識できない値はそのまま返す（カレンダー判定と表示用テキストで共有）。
 */
export function normalizeBroadcastDay(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  const days: Record<string, string> = {
    monday: "月",
    mondays: "月",
    tuesday: "火",
    tuesdays: "火",
    wednesday: "水",
    wednesdays: "水",
    thursday: "木",
    thursdays: "木",
    friday: "金",
    fridays: "金",
    saturday: "土",
    saturdays: "土",
    sunday: "日",
    sundays: "日"
  };

  return days[normalized] ?? value;
}

/**
 * ISO日時文字列から放映曜日（日本語1文字）をJST基準で求める。
 * 実行環境のローカルタイムゾーンに依存しないよう、JSTへオフセットしてから
 * `getUTCDay()` で曜日を取り出す（`getDay()` は環境依存のため使わない）。
 */
export function extractWeekdayLabel(value: string): BroadcastWeekday | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);
  const labels: BroadcastWeekday[] = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[jstDate.getUTCDay()] ?? null;
}

/** `now`（JST基準）の曜日（日本語1文字）を求める。「今日」のハイライト等に使う。 */
export function getTodayBroadcastWeekday(now: Date = new Date()): BroadcastWeekday {
  return extractWeekdayLabel(now.toISOString()) as BroadcastWeekday;
}

/** `now`(JST)を含む週の月曜0:00(JST)〜次の月曜0:00(JST)の範囲を返す。 */
function getCurrentBroadcastWeekRange(now: Date): { start: Date; end: Date } {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const daysSinceMonday = (jstNow.getUTCDay() + 6) % 7; // 月=0, 火=1, ..., 日=6
  const jstMidnight = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  const mondayJstMidnight = jstMidnight - daysSinceMonday * 24 * 60 * 60 * 1000;
  const start = new Date(mondayJstMidnight - JST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + WEEK_MS) };
}

/**
 * `airingAt` が `now` を含む放映週（月曜始まり、JST基準）に収まっているかを判定する。
 * 来期作品の初回放送日のように数週先の日付を、曜日が一致するだけで「今週」に
 * 混在させないために使う。
 */
export function isWithinCurrentBroadcastWeek(airingAtISO: string, now: Date = new Date()): boolean {
  const date = new Date(airingAtISO);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const { start, end } = getCurrentBroadcastWeekRange(now);
  return date >= start && date < end;
}

/**
 * 放映曜日を決定する。`nextEpisode.airingAt` を最優先し、
 * 無ければ `broadcastDay` を正規化して fallback する。
 * `nextEpisode.airingAt` が今週の範囲外（来期作品の初回放送日など）の場合は
 * 「今週の放映」としては扱わない（`null` を返す）。
 */
export function getBroadcastDayLabel(item: AnimeItem, now: Date = new Date()): BroadcastWeekday | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
    if (!isWithinCurrentBroadcastWeek(nextAiring, now)) {
      return null;
    }

    const weekday = extractWeekdayLabel(nextAiring);
    if (weekday) {
      return weekday;
    }
  }

  const broadcastDay = normalizeBroadcastDay(item.airing?.broadcastDay);
  if (broadcastDay && BROADCAST_WEEKDAYS.includes(broadcastDay as BroadcastWeekday)) {
    return broadcastDay as BroadcastWeekday;
  }

  return null;
}

/**
 * 視聴記録を曜日（月→日）ごとにグルーピングする。
 * `anime` を持たない記録・曜日不明の記録は除外する。
 */
export function groupItemsByBroadcastDay(
  items: AnimeStatusRecord[],
  now: Date = new Date()
): Record<BroadcastWeekday, AnimeStatusRecord[]> {
  const grouped = Object.fromEntries(
    BROADCAST_WEEKDAYS.map((day) => [day, [] as AnimeStatusRecord[]])
  ) as Record<BroadcastWeekday, AnimeStatusRecord[]>;

  for (const record of items) {
    if (!record.anime) {
      continue;
    }

    const day = getBroadcastDayLabel(record.anime, now);
    if (day && grouped[day]) {
      grouped[day].push(record);
    }
  }

  return grouped;
}
