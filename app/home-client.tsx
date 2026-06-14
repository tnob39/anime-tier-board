"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import CardLane, { type LaneCardData } from "@/components/CardLane";
import { SurveyBanner } from "@/components/SurveyBanner";
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
        <SurveyBanner />
        <div className="home-empty">
          <p>アニメを登録して、視聴を管理しよう</p>
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
      <SurveyBanner />
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
