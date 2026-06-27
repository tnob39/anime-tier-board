import { getCurrentAnimeSeason, getNextAnimeSeason, normalizeSeason } from "@/lib/season";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { SEASON_LABELS } from "@/lib/types";

export type SeasonBucketKey = "current" | "next" | "other";

export type SeasonBucket = {
  key: SeasonBucketKey;
  label: string;
  hint: string | null;
  items: AnimeStatusRecord[];
};

/**
 * 視聴リストを「今期 / 来期 / その他」に振り分ける。
 * 今期=放送中シーズン、来期=次シーズンで、変わり目に向けて貯めた作品を別管理できるようにする。
 * 通常版(watchlist-client) と V2(Codex/Grok) で共有する単一実装。
 */
export function bucketBySeason(records: AnimeStatusRecord[]): SeasonBucket[] {
  const current = getCurrentAnimeSeason();
  const next = getNextAnimeSeason();
  const seasonText = (year: number, season: keyof typeof SEASON_LABELS) =>
    `${year}年${SEASON_LABELS[season]}`;

  const buckets: Record<SeasonBucketKey, AnimeStatusRecord[]> = {
    current: [],
    next: [],
    other: []
  };

  for (const record of records) {
    const season = normalizeSeason(record.anime?.season ?? null);
    const year = record.anime?.seasonYear ?? null;
    if (season === current.season && year === current.year) {
      buckets.current.push(record);
    } else if (season === next.season && year === next.year) {
      buckets.next.push(record);
    } else {
      buckets.other.push(record);
    }
  }

  return [
    {
      key: "current" as const,
      label: `今期（${seasonText(current.year, current.season)}）`,
      hint: null,
      items: buckets.current
    },
    {
      key: "next" as const,
      label: `来期（${seasonText(next.year, next.season)}）`,
      hint: "これから視聴予定",
      items: buckets.next
    },
    {
      key: "other" as const,
      label: "その他",
      hint: "継続クール・過去作など",
      items: buckets.other
    }
  ].filter((bucket) => bucket.items.length > 0);
}
