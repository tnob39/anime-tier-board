import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { listStatuses } from "@/lib/statuses";
import type { Metadata } from "next";
import { WatchlistClient } from "./watchlist-client";

export const metadata: Metadata = {
  title: "視聴管理リスト — numanie"
};

export default async function WatchlistPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  // 放映カレンダーの airing 鮮度化に今期データを使う（ホームと共通の withFreshAiring）。
  // 取得失敗時は空配列にフォールバックし、保存済みスナップショットのまま描画する。
  const [items, seasonalAnime] = await Promise.all([
    listStatuses(userId),
    fetchCurrentSeasonAnimeForHome().catch(() => [])
  ]);

  return <WatchlistClient initialItems={items} initialSeasonalAnime={seasonalAnime} />;
}
