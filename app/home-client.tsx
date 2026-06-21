"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

const ONBOARDING_DISMISSED_KEY = "anime-tier-board:onboarding:n2-dismissed";

/**
 * ホームのクライアントエントリ（方針③ N1c）。
 * ログイン済みホームは「今週の放映カレンダー」を中心に構成する。
 * ステータス変更の楽観更新はここで一元管理し、今期から追加 ↔ 視聴中/見たい の反映を担う。
 */
export function HomeClient({ initialItems, initialSeasonalAnime }: HomeClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  useSeasonalPrefetch(initialSeasonalAnime);

  useEffect(() => {
    setIsOnboardingDismissed(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true");
    setHasCheckedOnboarding(true);
  }, []);

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
  const handleDismissOnboarding = useCallback(() => {
    setIsOnboardingDismissed(true);
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  }, []);

  const visibleItems = items.filter((item) => item.anime);
  const calendarItems = useMemo(
    () => visibleItems.filter((item) => item.status === "watching" || item.status === "planned"),
    [visibleItems]
  );
  const grouped = useMemo(() => groupItemsByBroadcastDay(calendarItems), [calendarItems]);
  const hasCalendar = BROADCAST_WEEKDAYS.some((day) => grouped[day].length > 0);

  if (visibleItems.length === 0) {
    return (
      <HomeEmptyGuide
        addSection={addSection}
        showOnboarding={hasCheckedOnboarding && !isOnboardingDismissed}
        onDismiss={handleDismissOnboarding}
      />
    );
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
type HomeEmptyGuideProps = {
  addSection: ReactNode;
  showOnboarding: boolean;
  onDismiss: () => void;
};

export function HomeEmptyGuide({ addSection, showOnboarding, onDismiss }: HomeEmptyGuideProps) {
  return (
    <main className="app-main home-main">
      {showOnboarding ? (
        <section className="home-guide" aria-labelledby="home-guide-title">
        <p className="home-guide-step-label">STEP 1 / 3</p>
        <h2 className="home-guide-title" id="home-guide-title">
          まずは視聴中を1本だけ追加
        </h2>
        <p className="home-guide-body">
          今季の作品から気になる1本を「視聴中」にすると、ホームが今夜見るリストとして使えます。
        </p>
        <ol className="home-guide-hints">
          <li>下の「今季から追加」で作品を探す</li>
          <li>気になる作品を「視聴中」にする</li>
          <li>あとはホームで追いかける</li>
        </ol>
        <div className="home-guide-actions">
          <Link href="#home-add-section" className="command-button emphasis-button">
            今季の作品を見る
          </Link>
          <button className="command-button" type="button" onClick={onDismiss}>
            あとで
          </button>
        </div>
        </section>
      ) : null}
      <div id="home-add-section">{addSection}</div>
    </main>
  );
}
