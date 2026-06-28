"use client";

import Link from "next/link";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { AnimeStatusRecord } from "@/lib/statuses";
import { getStreamingProviders } from "@/lib/streaming-services";

export function SeasonShareClient({
  label,
  comment,
  items
}: {
  label: string;
  comment: string | null;
  items: AnimeStatusRecord[];
}) {
  return (
    <main className="season-share-page">
      <header className="season-share-header">
        <p className="season-share-kicker">期まとめ布教</p>
        <h1>{label} のアニメ</h1>
        {comment ? <p>{comment}</p> : null}
      </header>

      {items.length ? (
        <div className="season-share-grid">
          {items.map((item) => {
            const anime = item.anime!;
            const providers = getStreamingProviders(anime);
            return (
              <article className="season-share-card" key={item.animeId}>
                <a href={anime.siteUrl} target="_blank" rel="noreferrer">
                  {anime.proxiedImageUrl ? (
                    <img src={anime.proxiedImageUrl} alt="" />
                  ) : (
                    <AnimeCardPlaceholder title={anime.title} />
                  )}
                </a>
                <div className="season-share-card-body">
                  <h2>{anime.title}</h2>
                  {providers.length ? (
                    <div className="season-share-providers" aria-label="配信サービス">
                      {providers.map((provider) => (
                        <a
                          key={`${provider.name}-${provider.url}`}
                          href={provider.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {provider.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="season-share-empty">この期の対象作品はまだありません。</p>
      )}

      <footer className="season-share-footer">
        <p>あなたも今期のアニメをまとめて布教しませんか？</p>
        <Link className="command-button emphasis-button" href="/">
          numanie で作る
        </Link>
      </footer>
    </main>
  );
}
