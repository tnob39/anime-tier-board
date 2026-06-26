import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

export const BROADCAST_WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export type BroadcastWeekday = (typeof BROADCAST_WEEKDAYS)[number];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * 「放送中」とみなす次回放送までの上限。放送中の週次作品は次回が常に約7日以内に
 * あるため、8日(=7日+1日の余裕)以内なら放送中と判定する。放送直後に nextAiringEpisode が
 * 約7日後へ繰り上がっても放送曜日に表示し続けられる。来期作品の初回放送(数週間先)は除外される。
 */
const UPCOMING_AIRING_WINDOW_MS = 8 * DAY_MS;

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

/**
 * 次回放送 `airingAt` が「今後ほぼ1週間以内」かを判定する。
 * 放送中の週次作品は次回が常に約7日以内にあるため真になり、来期作品の
 * 初回放送（数週間先）は偽になる。「曜日が一致するだけの来期作品」を
 * 今週のカレンダーに混在させないためのガード。
 */
export function isAiringSoon(airingAtISO: string, now: Date = new Date()): boolean {
  const date = new Date(airingAtISO);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const ms = date.getTime() - now.getTime();
  // 直前に放送済み（AniList の繰り上げ遅延）でも消えないよう、過去側に1日の余裕を持たせる。
  return ms >= -DAY_MS && ms < UPCOMING_AIRING_WINDOW_MS;
}

/**
 * 放映曜日を決定する。`nextEpisode.airingAt` を最優先し、無ければ `broadcastDay` に
 * フォールバックする。次回放送が「今後ほぼ1週間以内」(=放送中)の作品のみを、その回の
 * 曜日に配置する。来期作品の初回放送（数週間先）は `null` を返して除外する。
 *
 * 注: 週内の特定日ではなく「放送中か」で判定するため、水曜放送の作品が木〜日にも
 * 同じ曜日（水）に表示され続ける（次回が来週水曜でも放送中なら表示）。
 */
export function getBroadcastDayLabel(item: AnimeItem, now: Date = new Date()): BroadcastWeekday | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
    if (!isAiringSoon(nextAiring, now)) {
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
