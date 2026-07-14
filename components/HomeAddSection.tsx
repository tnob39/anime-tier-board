"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { track } from "@/lib/analytics";
import { isOwnerEmail } from "@/lib/owner";
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
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<ViewingStatus | null>(null);

  async function handleStatus(anime: AnimeItem, status: ViewingStatus) {
    track({ name: "home_card_tap", card_type: "add_section" });
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
    <section id="home-add-section" className="anime-list-section home-add-section">
      <div className="anime-list-header">
        <h2 className="anime-list-heading">{SEASON_SCOPE_HEADING[seasonScope]}</h2>
        {isOwner ? (
          <Link href="/explore" className="home-add-more-link">
            もっと
          </Link>
        ) : null}
      </div>

      <div className="home-add-season-toggle" role="group" aria-label="表示するシーズン">
        <button
          type="button"
          className={`home-add-season-toggle-btn ${seasonScope === "current" ? "is-active" : ""}`}
          onClick={() => onSelectSeasonScope("current")}
          aria-pressed={seasonScope === "current"}
        >
          今期
        </button>
        <button
          type="button"
          className={`home-add-season-toggle-btn ${seasonScope === "next" ? "is-active" : ""}`}
          onClick={() => onSelectSeasonScope("next")}
          aria-pressed={seasonScope === "next"}
        >
          来期
        </button>
      </div>

      {loading ? (
        <p className="home-add-status-note">
          <Loader2 className="spin" size={14} aria-hidden="true" /> 来期のアニメを読み込み中…
        </p>
      ) : error ? (
        <p className="home-add-status-note home-add-status-note--error" role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p className="home-add-status-note">追加できる作品が見つかりませんでした。</p>
      ) : (
        <div className="home-add-lane" role="list">
          {items.slice(0, 30).map((item) => {
            const isSaving = savingId === item.id;
            const coverImage = item.proxiedImageUrl || item.imageUrl || null;
            const provider = item.streamingProvidersJp?.flatrate?.[0] ?? null;

            return (
              <div key={item.id} className="home-add-card" role="listitem">
                <div className="home-add-card-poster">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt={item.title}
                      width={92}
                      height={130}
                      className="home-add-card-img"
                      unoptimized
                    />
                  ) : (
                    <AnimeCardPlaceholder title={item.title} className="home-add-card-placeholder" />
                  )}
                  {provider?.logoUrl ? (
                    <span className="card-provider-badge" title={provider.name}>
                      <img
                        src={provider.logoUrl}
                        alt={provider.name}
                        width={16}
                        height={16}
                        loading="lazy"
                      />
                    </span>
                  ) : null}
                </div>
                <p className="home-add-card-title">{item.title}</p>
                <div className="home-add-card-actions">
                  <button
                    className="home-add-card-btn home-add-card-btn--planned"
                    type="button"
                    disabled={isSaving}
                    aria-label={isSaving && savingStatus === "planned" ? "保存中" : "見たい"}
                    onClick={() => void handleStatus(item, "planned")}
                  >
                    {isSaving && savingStatus === "planned" ? (
                      <Loader2 className="spin" size={12} aria-hidden="true" />
                    ) : (
                      "見たい"
                    )}
                  </button>
                  {seasonScope === "current" ? (
                    <button
                      className="home-add-card-btn home-add-card-btn--watching"
                      type="button"
                      disabled={isSaving}
                      aria-label={isSaving && savingStatus === "watching" ? "保存中" : "視聴中"}
                      onClick={() => void handleStatus(item, "watching")}
                    >
                      {isSaving && savingStatus === "watching" ? (
                        <Loader2 className="spin" size={12} aria-hidden="true" />
                      ) : (
                        "視聴中"
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
