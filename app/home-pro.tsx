"use client";

import type { AnimeStatusRecord } from "@/lib/statuses";
import { HomeSimple } from "./home-simple";

/**
 * プロモードのホーム（ヘビー層「ぬま」向け）。
 * 主役は「記録・進捗・評価」。
 *
 * ⚠️ 案未確定のためプレースホルダ。現状はシンプル版と同じ内容を表示する。
 * 案 P1（視聴進捗ダッシュ）/ P2（記録フィード）の確定後にここを差し替える。
 * - P2（記録フィード）は favoriteLevel / notes / updatedAt が既に揃っており低コストで実装可。
 * - P1（進捗バー・未視聴◯話）は「視聴済み話数」の DB フィールド新設が前提（未実装）。
 */
export function HomePro({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  return <HomeSimple initialItems={initialItems} />;
}
