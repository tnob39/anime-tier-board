"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

type HomeAddSectionProps = {
  items: AnimeItem[];
  onQuickStatus: (anime: AnimeItem, status: ViewingStatus) => Promise<void>;
};

export default function HomeAddSection({ items, onQuickStatus }: HomeAddSectionProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<ViewingStatus | null>(null);

  if (items.length === 0) return null;

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
        <h2 className="anime-list-heading">今期から追加</h2>
        <Link href="/explore" className="home-add-more-link">
          もっと
        </Link>
      </div>
      <ul className="home-add-list" role="list">
        {items.map((item) => {
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
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}