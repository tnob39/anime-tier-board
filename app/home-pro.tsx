"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Star } from "lucide-react";
import AnimeList, { type AnimeListItem } from "@/components/AnimeList";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import {
  selectCatchup,
  selectRecentRecords,
  totalUnwatched,
  unwatchedCount,
} from "@/lib/home-data";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { HomeEmptyGuide } from "./home-simple";

// ──────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────

function toAnimeListItem(
  record: AnimeStatusRecord,
  opts: { meta?: string | null } = {}
): AnimeListItem | null {
  if (!record.anime) return null;
  return {
    id: record.animeId,
    title: record.anime.title,
    coverImage: record.anime.proxiedImageUrl || record.anime.imageUrl || null,
    statusVariant: "watching",
    meta: opts.meta ?? null,
  };
}

/** updatedAt (ISO文字列) を YYYY/MM/DD に変換 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10).replace(/-/g, "/");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// ──────────────────────────────────────────
// 進捗バー
// ──────────────────────────────────────────

function ProgressCard({ records }: { records: AnimeStatusRecord[] }) {
  const watchingRecords = records.filter((r) => r.status === "watching");
  const total = totalUnwatched(records);
  const watchingCount = watchingRecords.length;

  return (
    <div className="home-pro-progress">
      <div className="home-pro-progress-header">
        {total === 0 ? (
          <p className="home-pro-progress-caught">今期は追いつけています 🎉</p>
        ) : (
          <>
            <span className="home-pro-progress-unwatched">
              未視聴 <strong>{total}</strong> 話
            </span>
            <span className="home-pro-progress-tracking">
              追跡 {watchingCount} 本
            </span>
          </>
        )}
      </div>
      {watchingRecords.length > 0 && (
        <div className="home-pro-progress-bar" aria-label="視聴進捗バー">
          {watchingRecords.map((r) => {
            const behind = unwatchedCount(r) > 0;
            return (
              <div
                key={r.animeId}
                className={`home-pro-progress-seg ${behind ? "is-behind" : "is-caught"}`}
                title={`${r.anime?.title ?? r.animeId}${behind ? `（あと${unwatchedCount(r)}話）` : "（追いついた）"}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// 最近の記録フィード
// ──────────────────────────────────────────

function FeedRow({ record }: { record: AnimeStatusRecord }) {
  const anime = record.anime;
  const title = anime?.title ?? `#${record.animeId}`;
  const coverImage = anime?.proxiedImageUrl || anime?.imageUrl || null;
  const level = record.favoriteLevel ?? 0;
  const notes = record.notes?.trim() ?? "";
  const date = formatDate(record.updatedAt);

  return (
    <div className="home-pro-feed-row">
      {/* ポスター */}
      <div className="home-pro-feed-poster">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            width={46}
            height={62}
            className="home-pro-feed-img"
            unoptimized
          />
        ) : (
          <AnimeCardPlaceholder title={title} className="home-pro-feed-placeholder" />
        )}
      </div>

      {/* 本文 */}
      <div className="home-pro-feed-body">
        <p className="home-pro-feed-title">{title}</p>
        {level > 0 && (
          <div className="home-pro-feed-stars" aria-label={`星${level}`}>
            {Array.from({ length: level }).map((_, i) => (
              <Star key={i} size={13} fill="#f5b301" stroke="#f5b301" />
            ))}
          </div>
        )}
        {notes && <p className="home-pro-feed-notes">{notes}</p>}
      </div>

      {/* 日付 */}
      <span className="home-pro-feed-date">{date}</span>
    </div>
  );
}

function RecentFeed({ records }: { records: AnimeStatusRecord[] }) {
  if (records.length === 0) return null;

  return (
    <section className="anime-list-section">
      <div className="anime-list-header">
        <h2 className="anime-list-heading">最近の記録</h2>
        <Link href="/watchlist" className="home-pro-feed-all-link">
          すべて
        </Link>
      </div>
      <div className="home-pro-feed">
        {records.map((r) => (
          <FeedRow key={r.animeId} record={r} />
        ))}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────
// Tier リンクカード
// ──────────────────────────────────────────

function TierLinkCard() {
  return (
    <Link href="/tier" className="home-pro-tier-link">
      🏆 Tier表を見る・編集
    </Link>
  );
}

// ──────────────────────────────────────────
// HomePro（メインエクスポート）
// ──────────────────────────────────────────

export function HomePro({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const router = useRouter();

  const catchupItems = useMemo((): AnimeListItem[] => {
    return selectCatchup(initialItems)
      .map((r) =>
        toAnimeListItem(r, {
          meta: `あと${unwatchedCount(r)}話`,
        })
      )
      .filter((x): x is AnimeListItem => x !== null);
  }, [initialItems]);

  const recentRecords = useMemo(
    () => selectRecentRecords(initialItems, 5),
    [initialItems]
  );

  // 両方空なら空ガイド
  if (catchupItems.length === 0 && recentRecords.length === 0) {
    return <HomeEmptyGuide />;
  }

  function handleCatchupClick() {
    router.push("/watchlist");
  }

  return (
    <main className="app-main home-main">
      {/* 1. 進捗カード */}
      <ProgressCard records={initialItems} />

      {/* 3. 今すぐ見られる */}
      <AnimeList
        heading="今すぐ見られる"
        count={catchupItems.length}
        items={catchupItems}
        onItemClick={handleCatchupClick}
      />

      {/* 4. 最近の記録フィード */}
      <RecentFeed records={recentRecords} />

      {/* 5. Tier リンク */}
      <TierLinkCard />
    </main>
  );
}
