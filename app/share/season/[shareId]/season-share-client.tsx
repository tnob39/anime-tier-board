"use client";

import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { ShareCardCTA } from "@/components/ShareCardCTA";
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
                    <img src={anime.proxiedImageUrl} alt={anime.title} loading="lazy" />
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
                          <span className="sr-only">（新しいタブで開きます）</span>
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

      <ShareCardCTA
        headline="あなたも今期の沼をまとめて共有しよう"
        buttonLabel="自分のシェアカードを作る"
        href="/lab/promote?from=season-share"
      />
    </main>
  );
}
