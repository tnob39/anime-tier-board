"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

export type SeasonScope = "current" | "next";

type HomeAddSectionProps = {
  items: AnimeItem[];
  onQuickStatus: (anime: AnimeItem, status: ViewingStatus) => Promise<void>;
  seasonScope: SeasonScope;
  onSelectSeasonScope: (scope: SeasonScope) => void;
  loading?: boolean;
  error?: string | null;
};

const PAGE_SIZE = 8;

const SEASON_SCOPE_HEADING: Record<SeasonScope, string> = {
  current: "今期から追加",
  next: "来期から追加",
};

export default function HomeAddSection({
  items,
  onQuickStatus,
  seasonScope,
  onSelectSeasonScope,
  loading = false,
  error = null,
}: HomeAddSectionProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<ViewingStatus | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // 今期/来期を切り替えたら表示件数をリセットする
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [seasonScope]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  async function handleStatus(anime: AnimeItem, status: ViewingStatus) {
    setSavingId(anime.id);
    setSavingStatus(status);
    try {
      await onQuickStatus(anime, status);
    } finally {
      setSavingId(null);
      setSavingStatus(null);
    }
  }

  return (
    <section className="anime-list-section home-add-section">
      <div className="anime-list-header">
        <h2 className="anime-list-heading">{SEASON_SCOPE_HEADING[seasonScope]}</h2>
        <Link href="/explore" className="home-add-more-link">
          もっと
        </Link>
      </div>

      <div className="home-add-season-toggle" role="group" aria-label="表示するシーズン">
        <button
          type="button"
          className={`home-add-season-toggle-btn ${seasonScope === "current" ? "is-active" : ""}`}
          onClick={() => onSelectSeasonScope("current")}
        >
          今期
        </button>
        <button
          type="button"
          className={`home-add-season-toggle-btn ${seasonScope === "next" ? "is-active" : ""}`}
          onClick={() => onSelectSeasonScope("next")}
        >
          来期
        </button>
      </div>

      {loading ? (
        <p className="home-add-status-note">
          <Loader2 className="spin" size={14} /> 来期のアニメを読み込み中…
        </p>
      ) : error ? (
        <p className="home-add-status-note home-add-status-note--error">{error}</p>
      ) : items.length === 0 ? (
        <p className="home-add-status-note">追加できる作品が見つかりませんでした。</p>
      ) : (
        <ul className="home-add-list" role="list">
          {visibleItems.map((item) => {
            const isSaving = savingId === item.id;
            const coverImage = item.proxiedImageUrl || item.imageUrl || null;
            const meta = item.streamingProvidersJp?.flatrate?.[0]?.name ?? null;

            return (
              <li key={item.id} className="home-add-row">
                <div className="home-add-poster">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt={item.title}
                      width={42}
                      height={56}
                      className="home-add-img"
                      unoptimized
                    />
                  ) : (
                    <AnimeCardPlaceholder title={item.title} className="home-add-placeholder" />
                  )}
                </div>
                <div className="home-add-body">
                  <p className="home-add-title">{item.title}</p>
                  {meta ? <p className="home-add-meta">{meta}</p> : null}
                </div>
                <div className="home-add-actions">
                  <button
                    className="home-add-btn home-add-btn--planned"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleStatus(item, "planned")}
                  >
                    {isSaving && savingStatus === "planned" ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      "見たい"
                    )}
                  </button>
                  {seasonScope === "current" ? (
                    <button
                      className="home-add-btn home-add-btn--watching"
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleStatus(item, "watching")}
                    >
                      {isSaving && savingStatus === "watching" ? (
                        <Loader2 className="spin" size={14} />
                      ) : (
                        "視聴中"
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <button
          type="button"
          className="home-add-load-more"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          もっと見る（残り{items.length - visibleCount}件）
        </button>
      ) : null}
    </section>
  );
}
