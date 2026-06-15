import type { AnimeStatusRecord } from "@/lib/statuses";

/**
 * 視聴中の作品一覧を返す。
 * updatedAt 降順でソート。
 */
export function selectCatchup(records: AnimeStatusRecord[]): AnimeStatusRecord[] {
  return records
    .filter((r) => r.status === "watching")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * favoriteLevel が設定されているか、空でない notes を持つ作品を
 * updatedAt 降順で limit 件返す。
 */
export function selectRecentRecords(
  records: AnimeStatusRecord[],
  limit = 5
): AnimeStatusRecord[] {
  return records
    .filter((r) => r.favoriteLevel != null || (r.notes != null && r.notes !== ""))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/**
 * 「もうすぐ配信」な作品を返す。
 * 条件: status が "watching" か "planned"、かつ次回エピソードが存在する（今後配信予定）。
 * updatedAt 降順で limit 件。
 */
export function selectComingSoon(
  records: AnimeStatusRecord[],
  limit = 8
): AnimeStatusRecord[] {
  return records
    .filter(
      (r) =>
        (r.status === "watching" || r.status === "planned") &&
        r.anime?.airing?.nextEpisode?.episode != null
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}