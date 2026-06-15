"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import AnimeList, { type AnimeListItem } from "@/components/AnimeList";
import { selectCatchup, selectComingSoon } from "@/lib/home-data";
import type { AnimeStatusRecord } from "@/lib/statuses";

/**
 * AnimeStatusRecord → AnimeListItem 変換ヘルパー。
 * meta は各セクションの用途に合わせて呼び元で渡す。
 */
function toAnimeListItem(
  record: AnimeStatusRecord,
  opts: {
    meta?: string | null;
    statusVariant?: AnimeListItem["statusVariant"];
  } = {}
): AnimeListItem | null {
  if (!record.anime) return null;
  return {
    id: record.animeId,
    title: record.anime.title,
    coverImage: record.anime.proxiedImageUrl || record.anime.imageUrl || null,
    statusVariant: opts.statusVariant,
    meta: opts.meta ?? null,
  };
}

/** 「視聴中」セクション用の meta 文字列を組み立てる。 */
function buildWatchingMeta(record: AnimeStatusRecord): string | null {
  return record.anime?.streamingProvidersJp?.flatrate?.[0]?.name ?? null;
}

/** 「これから配信」セクション用の meta 文字列を組み立てる。 */
function buildComingSoonMeta(record: AnimeStatusRecord): string | null {
  const broadcastDay = record.anime?.airing?.broadcastDay;
  if (!broadcastDay) return null;
  return `${broadcastDay}曜放映`;
}

/**
 * シンプルモードのホーム（ライト層「つん」向け）。
 * S3 案: 視聴中 / これから配信 / 見たい の3段構成。
 */
export function HomeSimple({
  initialItems,
  addSection,
}: {
  initialItems: AnimeStatusRecord[];
  addSection?: ReactNode;
}) {
  const router = useRouter();

  const watchingItems = useMemo((): AnimeListItem[] => {
    return selectCatchup(initialItems)
      .map((r) =>
        toAnimeListItem(r, {
          meta: buildWatchingMeta(r),
          statusVariant: "watching",
        })
      )
      .filter((x): x is AnimeListItem => x !== null);
  }, [initialItems]);

  const comingSoonItems = useMemo((): AnimeListItem[] => {
    return selectComingSoon(initialItems)
      .map((r) =>
        toAnimeListItem(r, {
          meta: buildComingSoonMeta(r),
        })
      )
      .filter((x): x is AnimeListItem => x !== null);
  }, [initialItems]);

  const plannedItems = useMemo((): AnimeListItem[] => {
    return initialItems
      .filter((r) => r.status === "planned")
      .slice(0, 8)
      .map((r) => toAnimeListItem(r, { statusVariant: "planned" }))
      .filter((x): x is AnimeListItem => x !== null);
  }, [initialItems]);

  if (
    watchingItems.length === 0 &&
    comingSoonItems.length === 0 &&
    plannedItems.length === 0 &&
    !addSection
  ) {
    return <HomeEmptyGuide />;
  }

  function handleCardClick() {
    router.push("/watchlist");
  }

  return (
    <main className="app-main home-main">
      <AnimeList
        heading="視聴中"
        count={watchingItems.length}
        items={watchingItems}
        onItemClick={handleCardClick}
      />
      {addSection}
      <AnimeList
        heading="これから配信"
        count={comingSoonItems.length}
        items={comingSoonItems}
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