"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import HomeAddSection, { type SeasonScope } from "@/components/HomeAddSection";
import { WeeklyBroadcastCalendar } from "@/components/WeeklyBroadcastCalendar";
import { BROADCAST_WEEKDAYS, groupItemsByBroadcastDay } from "@/lib/broadcast-calendar";
import { selectUnregisteredSeasonalAnime } from "@/lib/home-seasonal-add";
import { getNextAnimeSeason } from "@/lib/season";
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
  const [seasonScope, setSeasonScope] = useState<SeasonScope>("current");
  const [nextSeasonAnime, setNextSeasonAnime] = useState<AnimeItem[] | null>(null);
  const [nextSeasonLoading, setNextSeasonLoading] = useState(false);
  const [nextSeasonError, setNextSeasonError] = useState<string | null>(null);
  const [removingPlannedId, setRemovingPlannedId] = useState<string | null>(null);
  useSeasonalPrefetch(initialSeasonalAnime);

  // Prefetch targets from home broadcast-calendar card taps (and general nav)
  // Ensures tapping cards has destination and /tier data paths warmed.
  useEffect(() => {
    router.prefetch("/watchlist");
    router.prefetch("/tier");
  }, [router]);

  useEffect(() => {
    setIsOnboardingDismissed(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true");
    setHasCheckedOnboarding(true);
  }, []);

  const addSectionItems = useMemo(
    () =>
      selectUnregisteredSeasonalAnime(
        seasonScope === "current" ? initialSeasonalAnime : nextSeasonAnime ?? [],
        items,
        // ホームでは「もっと見る」で段階的に表示するため、ここでは絞り込まず
        // 未登録の今期/来期作品をまとめて渡す（実際の表示件数はHomeAddSection側で制御）。
        200
      ),
    [initialSeasonalAnime, nextSeasonAnime, seasonScope, items]
  );

  const handleSelectSeasonScope = useCallback(
    (scope: SeasonScope) => {
      setSeasonScope(scope);

      if (scope !== "next" || nextSeasonAnime !== null || nextSeasonLoading) {
        return;
      }

      setNextSeasonLoading(true);
      setNextSeasonError(null);

      const { year, season } = getNextAnimeSeason();
      fetch(`/api/anime/seasonal?year=${year}&season=${season}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as { items?: AnimeItem[]; error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? "来期アニメの取得に失敗しました。");
          }
          setNextSeasonAnime(payload.items ?? []);
        })
        .catch((error: unknown) => {
          // nextSeasonAnime は null のままにする。「来期」を再度選ぶとガード
          // (nextSeasonAnime !== null) に引っかからず再フェッチできる。
          setNextSeasonError(error instanceof Error ? error.message : "来期アニメの取得に失敗しました。");
        })
        .finally(() => setNextSeasonLoading(false));
    },
    [nextSeasonAnime, nextSeasonLoading]
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

  const handleRemovePlanned = useCallback(
    async (record: AnimeStatusRecord) => {
      const previousItems = items;
      setRemovingPlannedId(record.animeId);
      setItems((current) => current.filter((item) => item.animeId !== record.animeId));

      try {
        const response = await fetch(`/api/statuses?animeId=${encodeURIComponent(record.animeId)}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          throw new Error("見たいの解除に失敗しました。");
        }
      } catch {
        setItems(previousItems);
      } finally {
        setRemovingPlannedId(null);
      }
    },
    [items]
  );

  const addSection = (
    <HomeAddSection
      items={addSectionItems}
      onQuickStatus={handleQuickStatus}
      seasonScope={seasonScope}
      onSelectSeasonScope={handleSelectSeasonScope}
      loading={seasonScope === "next" && nextSeasonLoading}
      error={seasonScope === "next" ? nextSeasonError : null}
    />
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
  const plannedItems = useMemo(
    () => visibleItems.filter((item) => item.status === "planned"),
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
      <h1 className="sr-only">ホーム</h1>
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
      {plannedItems.length > 0 ? (
        <HomePlannedManager
          items={plannedItems}
          removingId={removingPlannedId}
          onRemove={handleRemovePlanned}
        />
      ) : null}
    </main>
  );
}

type HomePlannedManagerProps = {
  items: AnimeStatusRecord[];
  removingId: string | null;
  onRemove: (record: AnimeStatusRecord) => void;
};

function HomePlannedManager({ items, removingId, onRemove }: HomePlannedManagerProps) {
  return (
    <section className="home-planned-manager" aria-labelledby="home-planned-manager-title">
      <div className="home-planned-manager-header">
        <h2 className="watchlist-broadcast-lanes-heading" id="home-planned-manager-title">
          見たい
        </h2>
        <p className="home-planned-manager-note">追加した作品はここから解除できます。</p>
      </div>
      <ul className="home-planned-manager-list" role="list">
        {items.map((record) => {
          const title = record.anime?.title ?? record.animeId;
          const isRemoving = removingId === record.animeId;

          return (
            <li key={record.animeId} className="home-planned-manager-row">
              <span className="home-planned-manager-title">{title}</span>
              <button
                type="button"
                className="home-planned-manager-remove"
                onClick={() => onRemove(record)}
                disabled={isRemoving}
                aria-label={`${title}を見たいから解除`}
              >
                {isRemoving ? "解除中" : "解除"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
      <h1 className="sr-only">ホーム</h1>
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
