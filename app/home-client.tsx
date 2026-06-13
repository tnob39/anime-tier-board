"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import CardLane, { type LaneCardData } from "@/components/CardLane";
import type { AnimeStatusRecord } from "@/lib/statuses";

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function toCardData(record: AnimeStatusRecord): LaneCardData | null {
  if (!record.anime) return null;
  return {
    id: record.animeId,
    title: record.anime.title,
    coverImage: record.anime.proxiedImageUrl || record.anime.imageUrl || null,
    statusVariant: record.status as LaneCardData["statusVariant"],
  };
}

export function HomeClient({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
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
        .map(toCardData)
        .filter((x): x is LaneCardData => x !== null),
    [initialItems, todayJa]
  );

  const watchingItems = useMemo(
    () =>
      initialItems
        .filter((item) => item.status === "watching")
        .map(toCardData)
        .filter((x): x is LaneCardData => x !== null),
    [initialItems]
  );

  const plannedItems = useMemo(
    () =>
      initialItems
        .filter((item) => item.status === "planned")
        .slice(0, 8)
        .map(toCardData)
        .filter((x): x is LaneCardData => x !== null),
    [initialItems]
  );

  if (watchingItems.length === 0 && plannedItems.length === 0) {
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

  function handleCardClick() {
    router.push("/watchlist");
  }

  return (
    <main className="app-main">
      {tonightItems.length > 0 && (
        <CardLane
          heading="今夜放映"
          count={tonightItems.length}
          items={tonightItems}
          onCardClick={handleCardClick}
          className="card-lane--today"
        />
      )}
      {watchingItems.length > 0 && (
        <CardLane
          heading="視聴中"
          count={watchingItems.length}
          items={watchingItems}
          onCardClick={handleCardClick}
        />
      )}
      {plannedItems.length > 0 && (
        <CardLane
          heading="見たい"
          count={plannedItems.length}
          items={plannedItems}
          onCardClick={handleCardClick}
        />
      )}
    </main>
  );
}
