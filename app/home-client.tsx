"use client";

import { useUiMode } from "@/lib/ui-mode";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { HomeSimple } from "./home-simple";
import { HomePro } from "./home-pro";

/**
 * ホームのモード別ディスパッチャ。
 * UX_DIRECTION / PRODUCT_CONCEPT の結論「ホームの主役はモードで真逆」を受け、
 * シンプル（つん: 今/今週の視聴サポート）と プロ（ぬま: 記録・進捗・評価）を出し分ける。
 */
export function HomeClient({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const { mode } = useUiMode();

  if (mode === "pro") {
    return <HomePro initialItems={initialItems} />;
  }
  return <HomeSimple initialItems={initialItems} />;
}
