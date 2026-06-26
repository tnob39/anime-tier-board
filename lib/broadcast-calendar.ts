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

export type BroadcastAiringState = "airing" | "upcoming";

export type BroadcastEntry = {
  record: AnimeStatusRecord;
  /** airing=放送中（次回が約1週間以内） / upcoming=これから放送（8日以降） */
  state: BroadcastAiringState;
  /** upcoming のときの放送開始日ラベル（JST, 例 "4/10"）。不明なら null */
  startLabel: string | null;
};

/** ISO日時を JST の "M/D" に整形する（放送開始日の表示用）。 */
export function formatBroadcastStartLabel(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
}

/**
 * 作品の放映曜日と放送状態（airing/upcoming）を判定する。
 * `nextEpisode.airingAt` を最優先し、無ければ `broadcastDay` にフォールバックする。
 * - 次回放送が「今後ほぼ1週間以内」 → airing（放送中）
 * - 次回放送が8日以降（来期作品の初回放送など） → upcoming（これから放送、薄め表示用）
 * - 曜日が判定できない / 次回放送が過去に取り残された陳腐データ → null（非表示）
 *
 * 注: 週内の特定日ではなく「放送中か」で判定するため、水曜放送の作品が木〜日にも
 * 同じ曜日（水）に表示され続ける（次回が来週水曜でも放送中なら表示）。
 */
function classifyBroadcast(
  item: AnimeItem,
  now: Date
): { weekday: BroadcastWeekday; state: BroadcastAiringState; startLabel: string | null } | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
    const weekday = extractWeekdayLabel(nextAiring);
    if (weekday) {
      if (isAiringSoon(nextAiring, now)) {
        return { weekday, state: "airing", startLabel: null };
      }
      const ms = new Date(nextAiring).getTime() - now.getTime();
      if (ms >= UPCOMING_AIRING_WINDOW_MS) {
        return { weekday, state: "upcoming", startLabel: formatBroadcastStartLabel(nextAiring) };
      }
      return null;
    }
  }

  const broadcastDay = normalizeBroadcastDay(item.airing?.broadcastDay);
  if (broadcastDay && BROADCAST_WEEKDAYS.includes(broadcastDay as BroadcastWeekday)) {
    return { weekday: broadcastDay as BroadcastWeekday, state: "airing", startLabel: null };
  }

  return null;
}

/**
 * 保存済み status の `airing` スナップショットは陳腐化する（次回放送日が過去になる）ため、
 * 取得済みの今期データ（seasonalItems）から最新 `airing` を引いて差し替える。
 * カレンダー判定（groupItemsByBroadcastDay）の前に適用することで、放送中の作品が
 * 「次回放送が過去」と誤判定されてレーンから消えるのを防ぐ。追加のネットワーク取得は不要。
 *
 * ホーム（app/home-client.tsx）と視聴管理リスト（app/watchlist/watchlist-client.tsx）の
 * 両方が同じカレンダーを描画するため、上書きロジックはここに一本化する。
 */
export function withFreshAiring(
  records: AnimeStatusRecord[],
  seasonalItems: AnimeItem[]
): AnimeStatusRecord[] {
  const airingById = new Map<string, NonNullable<AnimeItem["airing"]>>();
  for (const seasonal of seasonalItems) {
    if (seasonal.airing) {
      airingById.set(seasonal.id, seasonal.airing);
    }
  }

  return records.map((record) => {
    const freshAiring = airingById.get(record.animeId);
    if (!freshAiring || !record.anime) {
      return record;
    }
    return { ...record, anime: { ...record.anime, airing: freshAiring } };
  });
}

/**
 * 視聴記録を曜日（月→日）ごとにグルーピングする。
 * `anime` を持たない記録・曜日不明の記録は除外する。
 * 各曜日レーン内は「放送中（airing）→ これから放送（upcoming）」の順に並べ、
 * upcoming 同士は放送開始が早い順にする。
 */
export function groupItemsByBroadcastDay(
  items: AnimeStatusRecord[],
  now: Date = new Date()
): Record<BroadcastWeekday, BroadcastEntry[]> {
  const grouped = Object.fromEntries(
    BROADCAST_WEEKDAYS.map((day) => [day, [] as BroadcastEntry[]])
  ) as Record<BroadcastWeekday, BroadcastEntry[]>;

  for (const record of items) {
    if (!record.anime) {
      continue;
    }

    const classified = classifyBroadcast(record.anime, now);
    if (classified && grouped[classified.weekday]) {
      grouped[classified.weekday].push({
        record,
        state: classified.state,
        startLabel: classified.startLabel
      });
    }
  }

  for (const day of BROADCAST_WEEKDAYS) {
    grouped[day].sort((a, b) => {
      if (a.state !== b.state) {
        return a.state === "airing" ? -1 : 1;
      }
      const aAt = a.record.anime?.airing?.nextEpisode?.airingAt ?? "";
      const bAt = b.record.anime?.airing?.nextEpisode?.airingAt ?? "";
      return aAt.localeCompare(bAt);
    });
  }

  return grouped;
}
