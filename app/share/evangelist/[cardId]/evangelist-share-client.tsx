"use client";

import { Eye, Play } from "lucide-react";
import Link from "next/link";
import type { EvangelistCardResponse } from "@/lib/evangelist-cards";
import { SEASON_LABELS, type AnimeSeason } from "@/lib/types";

export function EvangelistShareClient({
  initialCard,
  isAuthenticated
}: {
  initialCard: EvangelistCardResponse;
  isAuthenticated: boolean;
}) {
  const subtitle = formatAnimeSubtitle(initialCard.anime.meta);
  const authorLabel = initialCard.authorName ?? "ユーザー";

  return (
    <main className="app-main evangelist-share-main">
      <article className="evangelist-share-card">
        <div className="evangelist-share-hero">
          {initialCard.anime.imageUrl ? (
            <img src={initialCard.anime.imageUrl} alt={initialCard.anime.title} />
          ) : (
            <div className="evangelist-share-hero-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="evangelist-share-body">
          <h1>{initialCard.anime.title}</h1>
          {subtitle ? <p className="evangelist-share-subtitle">{subtitle}</p> : null}

          <section className="evangelist-share-recommendation" aria-label="おすすめコメント">
            <div className="evangelist-share-author">
              {initialCard.authorImage ? (
                <img src={initialCard.authorImage} alt="" loading="lazy" />
              ) : (
                <span className="evangelist-share-author-fallback" aria-hidden="true">
                  {authorLabel.slice(0, 1)}
                </span>
              )}
              <strong>{authorLabel} のおすすめ</strong>
            </div>
            <blockquote>「{initialCard.comment}」</blockquote>
          </section>

          {initialCard.anime.providers.length ? (
            <section className="evangelist-share-providers" aria-label="配信サービス">
              {initialCard.anime.providers.map((provider) => (
                <a
                  key={`${provider.name}-${provider.url}`}
                  className="evangelist-provider-button"
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Play size={18} aria-hidden="true" />
                  <span>{provider.name} で見る</span>
                  <span className="sr-only">（新しいタブで開きます）</span>
                </a>
              ))}
            </section>
          ) : null}

          <p className="evangelist-share-views">
            <Eye size={16} aria-hidden="true" />
            <span>{initialCard.viewCount}人が見ました</span>
          </p>
        </div>

        {!isAuthenticated ? (
          <footer className="evangelist-share-cta">
            <p>あなたもアニメボードを作る？</p>
            <Link className="command-button emphasis-button" href="/">
              無料で始める →
            </Link>
          </footer>
        ) : null}
      </article>
    </main>
  );
}

function formatAnimeSubtitle(
  meta: EvangelistCardResponse["anime"]["meta"]
): string | null {
  if (!meta) {
    return null;
  }

  const parts: string[] = [];

  if (meta.seasonYear) {
    parts.push(`${meta.seasonYear}年`);
  }

  if (meta.season && meta.season in SEASON_LABELS) {
    parts.push(SEASON_LABELS[meta.season as AnimeSeason]);
  }

  if (meta.genres?.length) {
    parts.push(meta.genres.join("・"));
  }

  return parts.length ? parts.join(" / ") : null;
}