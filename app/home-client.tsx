"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import HomeAddSection from "@/components/HomeAddSection";
import { WeeklyBroadcastCalendar } from "@/components/WeeklyBroadcastCalendar";
import { BROADCAST_WEEKDAYS, groupItemsByBroadcastDay } from "@/lib/broadcast-calendar";
import { selectUnregisteredSeasonalAnime } from "@/lib/home-seasonal-add";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

type HomeClientProps = {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
};

/**
 * ホームのクライアントエントリ（方針③ N1c）。
 * ログイン済みホームは「今週の放映カレンダー」を中心に構成する。
 * ステータス変更の楽観更新はここで一元管理し、今期から追加 ↔ 視聴中/見たい の反映を担う。
 */
export function HomeClient({ initialItems, initialSeasonalAnime }: HomeClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  useSeasonalPrefetch(initialSeasonalAnime);

  const addSectionItems = useMemo(
    () => selectUnregisteredSeasonalAnime(initialSeasonalAnime, items),
    [initialSeasonalAnime, items]
  );

  const handleQuickStatus = useCallback(
    async (anime: AnimeItem, status: ViewingStatus) => {
      const previousItems = items;
      const optimisticRecord: AnimeStatusRecord = {
        animeId: anime.id,
        status,
        anime,
        favoriteLevel: null,
        watchSlot: null,
        notes: null,
        watchRhythm: null,
        watchedEpisodes: null,
        updatedAt: new Date().toISOString(),
      };

      setItems((current) => [
        optimisticRecord,
        ...current.filter((record) => record.animeId !== anime.id),
      ]);

      try {
        const response = await fetch("/api/statuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ animeId: anime.id, status, anime }),
        });

        if (!response.ok) {
          throw new Error("ステータスの保存に失敗しました。");
        }
      } catch {
        setItems(previousItems);
      }
    },
    [items]
  );

  const addSection = (
    <HomeAddSection items={addSectionItems} onQuickStatus={handleQuickStatus} />
  );

  const visibleItems = items.filter((item) => item.anime);
  const calendarItems = useMemo(
    () => visibleItems.filter((item) => item.status === "watching" || item.status === "planned"),
    [visibleItems]
  );
  const grouped = useMemo(() => groupItemsByBroadcastDay(calendarItems), [calendarItems]);
  const hasCalendar = BROADCAST_WEEKDAYS.some((day) => grouped[day].length > 0);

  if (visibleItems.length === 0) {
    return <HomeEmptyGuide />;
  }

  return (
    <main className="app-main home-main">
      {hasCalendar ? (
        <WeeklyBroadcastCalendar grouped={grouped} onItemClick={() => router.push("/watchlist")} />
      ) : (
        <section className="home-calendar-empty">
          <h2 className="watchlist-broadcast-lanes-heading">今週の放映カレンダー</h2>
          <p className="home-calendar-empty-note">
            今週の放映予定がまだありません。今期のアニメから「視聴中」「見たい」を追加すると、ここに曜日別で表示されます。
          </p>
        </section>
      )}
      {addSection}
    </main>
  );
}

/** ログイン済み・未登録ユーザー向けのインラインガイド。 */
export function HomeEmptyGuide() {
  return (
    <main className="app-main">
      <div className="home-guide">
        <p className="home-guide-step-label">STEP 1 / 3</p>
        <h2 className="home-guide-title">まずはアニメを探してみよう</h2>
        <p className="home-guide-body">
          気になる作品に「見たい」や「視聴中」をつけると、ここに表示されます。
        </p>
        <div className="home-guide-hints">
          <span>📋 今期アニメを一覧表示</span>
          <span>✅ ステータスで管理</span>
          <span>⭐ Tier表で評価</span>
        </div>
        <Link href="/explore" className="command-button emphasis-button">
          作品を探す
        </Link>
      </div>
    </main>
  );
}
