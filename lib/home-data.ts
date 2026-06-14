import type { AnimeStatusRecord } from "@/lib/statuses";

/**
 * 配信済みの最新話数を返す。
 * - anime.airing?.nextEpisode?.episode が存在すれば その値 - 1（次回予定の前話＝配信済み最新）
 * - 無ければ anime.episodes（全話数）
 * - どちらも無ければ null
 */
export function latestAvailableEpisode(record: AnimeStatusRecord): number | null {
  const nextEp = record.anime?.airing?.nextEpisode?.episode;
  if (typeof nextEp === "number") {
    return nextEp - 1;
  }
  const total = record.anime?.episodes;
  if (typeof total === "number") {
    return total;
  }
  return null;
}

/**
 * 未視聴話数を返す。
 * latestAvailableEpisode が null なら 0。
 * watchedEpisodes は null を 0 として扱う。
 * 負にならないよう Math.max(0, ...) でガード。
 */
export function unwatchedCount(record: AnimeStatusRecord): number {
  const latest = latestAvailableEpisode(record);
  if (latest === null) return 0;
  const watched = record.watchedEpisodes ?? 0;
  return Math.max(0, latest - watched);
}

/**
 * 視聴中かつ未視聴話が残っている（キャッチアップが必要な）作品かどうか。
 */
export function isCatchup(record: AnimeStatusRecord): boolean {
  return record.status === "watching" && unwatchedCount(record) > 0;
}

/**
 * キャッチアップ対象の作品一覧を返す。
 * 未視聴数の多い順、同数なら updatedAt 新しい順にソート。
 */
export function selectCatchup(records: AnimeStatusRecord[]): AnimeStatusRecord[] {
  return records
    .filter(isCatchup)
    .sort((a, b) => {
      const diff = unwatchedCount(b) - unwatchedCount(a);
      if (diff !== 0) return diff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

/**
 * 視聴中の全作品の未視聴話数の合計を返す。
 */
export function totalUnwatched(records: AnimeStatusRecord[]): number {
  return records
    .filter((r) => r.status === "watching")
    .reduce((sum, r) => sum + unwatchedCount(r), 0);
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
 * 条件: status が "watching" か "planned"、未視聴数が 0、かつ次回エピソードが存在する（今後配信予定）。
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
        unwatchedCount(r) === 0 &&
        r.anime?.airing?.nextEpisode?.episode != null
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
