import { selectCatchup } from "@/lib/home-data";
import type { AnimeStatusRecord } from "@/lib/statuses";

/** 視聴中の作品数（PWAバッジ用）。 */
export function countCatchupBadge(records: AnimeStatusRecord[]): number {
  return selectCatchup(records).length;
}

export function updateAppBadge(count: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {});
  } else {
    navigator.clearAppBadge().catch(() => {});
  }
}
