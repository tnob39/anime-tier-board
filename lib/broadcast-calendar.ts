import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

export const BROADCAST_WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export type BroadcastWeekday = (typeof BROADCAST_WEEKDAYS)[number];

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

/** ISO日時文字列から放映曜日（日本語1文字）を求める。 */
export function extractWeekdayLabel(value: string): BroadcastWeekday | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const labels: BroadcastWeekday[] = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[date.getDay()] ?? null;
}

/**
 * 放映曜日を決定する。`nextEpisode.airingAt` を最優先し、
 * 無ければ `broadcastDay` を正規化して fallback する。
 */
export function getBroadcastDayLabel(item: AnimeItem): BroadcastWeekday | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
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
  items: AnimeStatusRecord[]
): Record<BroadcastWeekday, AnimeStatusRecord[]> {
  const grouped = Object.fromEntries(
    BROADCAST_WEEKDAYS.map((day) => [day, [] as AnimeStatusRecord[]])
  ) as Record<BroadcastWeekday, AnimeStatusRecord[]>;

  for (const record of items) {
    if (!record.anime) {
      continue;
    }

    const day = getBroadcastDayLabel(record.anime);
    if (day && grouped[day]) {
      grouped[day].push(record);
    }
  }

  return grouped;
}
