"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import AnimeList, { type AnimeListItem } from "@/components/AnimeList";
import type { AnimeStatusRecord } from "@/lib/statuses";

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function toListItem(record: AnimeStatusRecord): AnimeListItem | null {
  if (!record.anime) return null;
  return {
    id: record.animeId,
    title: record.anime.title,
    coverImage: record.anime.proxiedImageUrl || record.anime.imageUrl || null,
    statusVariant: record.status as AnimeListItem["statusVariant"],
  };
}

/**
 * シンプルモードのホーム（ライト層「つん」向け）。
 * 主役は「今/今週どうするか」の視聴サポート。
 * 現状は今夜放映 / 視聴中 / 見たい の縦リスト3段。
 * 案 S1/S2 の確定後にこの中身を差し替える。
 */
export function HomeSimple({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const router = useRouter();
  const todayJa = WEEKDAYS_JA[new Date().getDay()];

  const tonightItems = useMemo(
    () =>
      initialItems
        .filter(
          (item) =>
            item.status === "watching" &&
            item.anime?.airing?.broadcastDay?.includes(todayJa)
        )
        .map(toListItem)
        .filter((x): x is AnimeListItem => x !== null),
    [initialItems, todayJa]
  );

  const watchingItems = useMemo(
    () =>
      initialItems
        .filter((item) => item.status === "watching")
        .map(toListItem)
        .filter((x): x is AnimeListItem => x !== null),
    [initialItems]
  );

  const plannedItems = useMemo(
    () =>
      initialItems
        .filter((item) => item.status === "planned")
        .slice(0, 8)
        .map(toListItem)
        .filter((x): x is AnimeListItem => x !== null),
    [initialItems]
  );

  if (watchingItems.length === 0 && plannedItems.length === 0) {
    return <HomeEmptyGuide />;
  }

  function handleCardClick() {
    router.push("/watchlist");
  }

  return (
    <main className="app-main home-main">
      <AnimeList
        heading="今夜放映"
        count={tonightItems.length}
        items={tonightItems}
        onItemClick={handleCardClick}
        className="anime-list-section--today"
      />
      <AnimeList
        heading="視聴中"
        count={watchingItems.length}
        items={watchingItems}
        onItemClick={handleCardClick}
      />
      <AnimeList
        heading="見たい"
        count={plannedItems.length}
        items={plannedItems}
        onItemClick={handleCardClick}
      />
    </main>
  );
}

/** ログイン済み・未登録ユーザー向けのインラインガイド（モード共通）。 */
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
