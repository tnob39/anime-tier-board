import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { isOwnerEmail } from "@/lib/owner";
import { listStatuses } from "@/lib/statuses";
import type { Metadata } from "next";
import { WatchlistSwitch } from "./watchlist-switch";

export const metadata: Metadata = {
  title: "視聴管理リスト — numanie"
};

export default async function WatchlistPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  // V2（Codex/Grok）実機比較はオーナー本人にのみ露出。一般ユーザーは常に通常版。
  const canPreview = isOwnerEmail(session?.user?.email);

  // 放映カレンダーの airing 鮮度化に今期データを使う（ホームと共通の withFreshAiring）。
  // 取得失敗時は空配列にフォールバックし、保存済みスナップショットのまま描画する。
  const [items, seasonalAnime] = await Promise.all([
    listStatuses(userId),
    fetchCurrentSeasonAnimeForHome().catch(() => [])
  ]);

  return (
    <WatchlistSwitch
      initialItems={items}
      initialSeasonalAnime={seasonalAnime}
      canPreview={canPreview}
    />
  );
}
