import type { AnimeItem } from "@/lib/types";

/**
 * 作品の「人気度」を表す単一指標。Tierの人気順ソート（compareByPublicReputation）と
 * ホーム今期追加 / explore の並び替えで同一基準を使うための正準関数。
 *
 * - AniList系: reputation.members（実視聴者数）を優先
 * - Jikan系: reputation.popularity は順位（小さいほど人気）なので逆数換算
 * - reputation 欠落時 / popularity 欠落時は item.popularity にフォールバック
 *
 * 以前は TierBoardApp の getAudienceValue と home-seasonal-add の getAnimePopularity に
 * 二重実装され、reputation 欠落作品でフォールバックが食い違っていた。ここに一本化する。
 */
export function getAnimePopularity(item: AnimeItem): number {
  const reputation = item.reputation;

  if (!reputation) {
    return item.popularity ?? 0;
  }

  if (typeof reputation.members === "number") {
    return reputation.members;
  }

  if (item.source === "jikan" && typeof reputation.popularity === "number") {
    return 1_000_000 / Math.max(1, reputation.popularity);
  }

  return reputation.popularity ?? item.popularity ?? 0;
}
