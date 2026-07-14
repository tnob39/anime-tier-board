"use client";

import { ExternalLink, Mic2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem, AnimeVoiceActor } from "@/lib/types";

type ActorGroup = {
  key: string;
  name: string;
  nativeName: string | null;
  imageUrl: string | null;
  siteUrl: string | null;
  works: Array<{
    anime: AnimeItem;
    status: ViewingStatus;
    favoriteLevel: number | null;
    characterName: string | null;
    characterRole: string | null;
  }>;
};

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function VoiceActorsClient({ statuses }: { statuses: AnimeStatusRecord[] }) {
  const [query, setQuery] = useState("");
  const actors = useMemo(() => buildActorGroups(statuses), [statuses]);
  const filteredActors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actors;
    return actors.filter((actor) => {
      return (
        actor.name.toLowerCase().includes(normalized) ||
        actor.nativeName?.toLowerCase().includes(normalized) ||
        actor.works.some((work) => work.anime.title.toLowerCase().includes(normalized))
      );
    });
  }, [actors, query]);

  return (
    <main className="app-main voice-main">
      <header className="voice-header">
        <div>
          <p className="eyebrow">声優から探す</p>
          <h1>声優別の参加作品</h1>
          <p>{actors.length}人の声優を保存済み作品から集計</p>
        </div>
        <Link className="command-button" href="/">
          ボードに戻る
        </Link>
      </header>

      <section className="voice-search">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="声優名・作品名で検索"
          aria-label="声優名・作品名で検索"
        />
      </section>

      {filteredActors.length ? (
        <section className="voice-grid" aria-label="声優一覧">
          {filteredActors.map((actor) => (
            <article key={actor.key} className="voice-card">
              <div className="voice-profile">
                {actor.imageUrl ? (
                  <img src={actor.imageUrl} alt={actor.name} loading="lazy" />
                ) : (
                  <div className="voice-avatar">
                    <Mic2 size={22} />
                  </div>
                )}
                <div>
                  <h2>{actor.name}</h2>
                  {actor.nativeName ? <span>{actor.nativeName}</span> : null}
                  {actor.siteUrl ? (
                    <a href={actor.siteUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      詳細
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="voice-work-list">
                {actor.works.map((work) => (
                  <div key={`${actor.key}:${work.anime.id}:${work.characterName ?? ""}`} className="voice-work">
                    {work.anime.proxiedImageUrl ? (
                      <img src={work.anime.proxiedImageUrl} alt={work.anime.title} loading="lazy" />
                    ) : (
                      <AnimeCardPlaceholder title={work.anime.title} />
                    )}
                    <div>
                      <strong>{work.anime.title}</strong>
                      <span>{statusLabels[work.status]}</span>
                      {work.characterName ? (
                        <p>
                          {work.characterName}
                          {work.characterRole ? ` / ${work.characterRole}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="watchlist-empty">
          <h2>声優情報がまだありません</h2>
          <p>声優情報を含む作品をStatus保存すると、このページに表示されます。</p>
        </section>
      )}
    </main>
  );
}

function buildActorGroups(statuses: AnimeStatusRecord[]): ActorGroup[] {
  const groups = new Map<string, ActorGroup>();

  for (const record of statuses) {
    if (!record.anime?.voiceActors?.length) {
      continue;
    }

    for (const actor of record.anime.voiceActors) {
      const key = getActorKey(actor);
      const group =
        groups.get(key) ??
        {
          key,
          name: actor.name,
          nativeName: actor.nativeName ?? null,
          imageUrl: actor.imageUrl ?? null,
          siteUrl: actor.siteUrl ?? null,
          works: []
        };

      group.works.push({
        anime: record.anime,
        status: record.status,
        favoriteLevel: record.favoriteLevel,
        characterName: actor.characterName ?? null,
        characterRole: actor.characterRole ?? null
      });
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      works: group.works.sort((a, b) => {
        return (b.favoriteLevel ?? 0) - (a.favoriteLevel ?? 0) || a.anime.title.localeCompare(b.anime.title, "ja");
      })
    }))
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name, "ja"));
}

function getActorKey(actor: AnimeVoiceActor) {
  return String(actor.id ?? actor.siteUrl ?? actor.name).toLowerCase();
}
