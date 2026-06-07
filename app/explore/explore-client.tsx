"use client";

import { Compass, Loader2, PlayCircle, Plus, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { filterAnimeItems } from "@/lib/anime-filters";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem, AnimeSeason, AnimeSourceName } from "@/lib/types";

type SeasonalApiResponse = {
  year: number;
  season: AnimeSeason;
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
  error?: string;
};

type SortMode = "fit" | "popularity" | "score";

const seasonLabels: Record<AnimeSeason, string> = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋"
};

const seasons: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "保留",
  dropped: "中止"
};

export function ExploreClient({
  initialStatuses
}: {
  initialStatuses: AnimeStatusRecord[];
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 10);
  const [season, setSeason] = useState<AnimeSeason>("SPRING");
  const [sortMode, setSortMode] = useState<SortMode>("fit");
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ViewingStatus>>(() =>
    Object.fromEntries(initialStatuses.map((record) => [record.animeId, record.status]))
  );
  const [source, setSource] = useState<AnimeSourceName | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const [onlyInstantWatch, setOnlyInstantWatch] = useState(false);
  const preferences = useMemo(() => buildPreferences(initialStatuses), [initialStatuses]);
  const yearOptions = useMemo(() => {
    const start = 1990;
    return Array.from({ length: currentYear - start + 1 }, (_, index) => currentYear - index);
  }, [currentYear]);
  const filteredItems = useMemo(
    () =>
      filterAnimeItems(items, {
        hideMovies,
        hideRerunCandidates,
        seasonYear: year,
        onlyInstantWatch
      }),
    [hideMovies, hideRerunCandidates, items, year, onlyInstantWatch]
  );
  const rankedItems = useMemo(
    () => rankItems(filteredItems, preferences, statusMap, sortMode),
    [filteredItems, preferences, statusMap, sortMode]
  );

  async function loadSeason() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/anime/seasonal?year=${year}&season=${season}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as SeasonalApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "作品の取得に失敗しました。");
      }

      setItems(payload.items);
      setSource(payload.source);
      setMessage(payload.warning ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品の取得に失敗しました。");
      setItems([]);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }

  async function addToWatchlist(item: AnimeItem) {
    setSavingId(item.id);
    setMessage(null);

    try {
      const response = await fetch("/api/statuses", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ animeId: item.id, status: "planned", anime: item })
      });

      if (!response.ok) {
        throw new Error("視聴管理への追加に失敗しました。");
      }

      setStatusMap((current) => ({ ...current, [item.id]: "planned" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "視聴管理への追加に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="app-main explore-main">
      <header className="explore-header">
        <div>
          <p className="eyebrow">過去作品探索</p>
          <h1>次に見る候補を探す</h1>
          <p>選んだ年・期の作品を、人気・評価・あなたの好みで並べます。</p>
        </div>
        <Link className="command-button" href="/">
          ボードに戻る
        </Link>
      </header>

      <section className="explore-controls">
        <label className="field">
          <span>年代</span>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}年
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>期</span>
          <select value={season} onChange={(event) => setSeason(event.target.value as AnimeSeason)}>
            {seasons.map((option) => (
              <option key={option} value={option}>
                {seasonLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="explore-sort-tabs" aria-label="ランキング種別">
          {[
            ["fit", "おすすめ"],
            ["popularity", "人気"],
            ["score", "評価"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={sortMode === value ? "status-chip is-active" : "status-chip"}
              type="button"
              onClick={() => setSortMode(value as SortMode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-chip-group" aria-label="表示フィルター">
          <button
            className={hideMovies ? "filter-chip is-active" : "filter-chip"}
            type="button"
            onClick={() => setHideMovies((current) => !current)}
            aria-pressed={hideMovies}
          >
            映画OFF
          </button>
          <button
            className={hideRerunCandidates ? "filter-chip is-active" : "filter-chip"}
            type="button"
            onClick={() => setHideRerunCandidates((current) => !current)}
            aria-pressed={hideRerunCandidates}
          >
            旧作OFF
          </button>
          <button
            className={onlyInstantWatch ? "filter-chip is-active" : "filter-chip"}
            type="button"
            onClick={() => setOnlyInstantWatch((current) => !current)}
            aria-pressed={onlyInstantWatch}
          >
            今すぐ見放題
          </button>
        </div>
        <button
          className="command-button emphasis-button"
          type="button"
          onClick={() => void loadSeason()}
          disabled={loading}
        >
          {loading ? <Loader2 className="spin" size={18} /> : <Compass size={18} />}
          <span>探す</span>
        </button>
      </section>

      {message ? <div className="notice warning">{message}</div> : null}
      {source ? (
        <p className="explore-source">データ元: {source === "anilist" ? "AniList" : "Jikan"}</p>
      ) : null}

      {rankedItems.length ? (
        <section className="explore-grid" aria-label="作品候補">
          {rankedItems.map((entry, index) => (
            <article key={entry.item.id} className="explore-card">
              <img src={entry.item.proxiedImageUrl} alt={entry.item.title} />
              <div className="explore-card-body">
                <div className="explore-rank">#{index + 1}</div>
                <h2>{entry.item.title}</h2>
                <div className="explore-badges">
                  <span>
                    <TrendingUp size={13} />
                    {formatNumber(entry.item.popularity ?? entry.item.reputation?.popularity)}
                  </span>
                  <span>
                    <Star size={13} fill="currentColor" />
                    {formatScore(entry.item)}
                  </span>
                  <span>Fit {entry.fitScore}</span>
                </div>
                <StreamingPlatformPills item={entry.item} />
                <p>{entry.reason}</p>
                <div className="explore-actions">
                  {statusMap[entry.item.id] ? (
                    <span className="watchlist-info-pill">{statusLabels[statusMap[entry.item.id]]}</span>
                  ) : (
                    <button
                      className="command-button"
                      type="button"
                      onClick={() => void addToWatchlist(entry.item)}
                      disabled={savingId === entry.item.id}
                    >
                      {savingId === entry.item.id ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      <span>見たい</span>
                    </button>
                  )}
                  <a className="command-button" href={entry.item.siteUrl} target="_blank" rel="noreferrer">
                    詳細
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="watchlist-empty">
          <h2>年代と期を選んで探索</h2>
          <p>90年代から現在まで、選んだシーズンの作品を取得してランキングします。</p>
        </section>
      )}
    </main>
  );
}

function StreamingPlatformPills({ item }: { item: AnimeItem }) {
  const platforms = getStreamingPlatforms(item);
  const visiblePlatforms = platforms.slice(0, 2);
  const remainingCount = Math.max(0, platforms.length - visiblePlatforms.length);

  if (!visiblePlatforms.length) {
    return null;
  }

  return (
    <div className="streaming-links explore-streaming-links">
      {visiblePlatforms.map((platform) => (
        <a
          key={`${platform.name}:${platform.url}`}
          href={platform.url}
          target="_blank"
          rel="noreferrer"
        >
          <PlayCircle size={11} />
          <span>{platform.name}</span>
        </a>
      ))}
      {remainingCount ? <span className="streaming-more">+{remainingCount}</span> : null}
    </div>
  );
}

function getStreamingPlatforms(item: AnimeItem) {
  if (item.streamingPlatforms?.length) {
    return item.streamingPlatforms.filter((platform) => platform.url && platform.name);
  }

  const platforms = new Map<string, { name: string; url: string }>();
  for (const episode of item.streamingEpisodes ?? []) {
    if (!episode.url) {
      continue;
    }

    const name = episode.site?.trim() || getHostLabel(episode.url);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (!platforms.has(key)) {
      platforms.set(key, { name, url: episode.url });
    }
  }

  return Array.from(platforms.values()).slice(0, 5);
}

function getHostLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const [label] = host.split(".");
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
  } catch {
    return null;
  }
}

function buildPreferences(records: AnimeStatusRecord[]) {
  const genres = new Map<string, number>();
  const studios = new Map<string, number>();
  const actors = new Map<string, number>();

  for (const record of records) {
    if (record.status === "dropped") {
      continue;
    }

    const weight =
      record.favoriteLevel ??
      (record.status === "completed" || record.status === "watching" ? 3 : 0.5);

    for (const genre of record.anime?.genres ?? []) {
      addWeight(genres, genre, weight);
    }
    for (const studio of record.anime?.studios ?? []) {
      addWeight(studios, studio.name, weight);
    }
    for (const actor of record.anime?.voiceActors ?? []) {
      addWeight(actors, actor.name, weight);
    }
  }

  return { genres, studios, actors };
}

function rankItems(
  items: AnimeItem[],
  preferences: ReturnType<typeof buildPreferences>,
  statusMap: Record<string, ViewingStatus>,
  sortMode: SortMode
) {
  return items
    .map((item) => {
      const fitScore = getFitScore(item, preferences, statusMap[item.id]);
      return { item, fitScore, reason: getReason(item, preferences, fitScore) };
    })
    .sort((a, b) => {
      if (sortMode === "fit") {
        return b.fitScore - a.fitScore || getPopularity(b.item) - getPopularity(a.item);
      }
      if (sortMode === "score") {
        return getScore(b.item) - getScore(a.item) || getPopularity(b.item) - getPopularity(a.item);
      }
      return getPopularity(b.item) - getPopularity(a.item) || getScore(b.item) - getScore(a.item);
    })
    .slice(0, 50);
}

function getFitScore(
  item: AnimeItem,
  preferences: ReturnType<typeof buildPreferences>,
  currentStatus?: ViewingStatus
) {
  let score = 0;

  for (const genre of item.genres ?? []) {
    score += preferences.genres.get(genre) ?? 0;
  }
  for (const studio of item.studios ?? []) {
    score += (preferences.studios.get(studio.name) ?? 0) * 1.3;
  }
  for (const actor of item.voiceActors ?? []) {
    score += (preferences.actors.get(actor.name) ?? 0) * 0.8;
  }

  score += Math.min(10, getScore(item) / 10);
  score += Math.min(8, getPopularity(item) / 100000);

  if (currentStatus === "completed" || currentStatus === "dropped") {
    score -= 30;
  }

  return Math.max(0, Math.round(score));
}

function getReason(
  item: AnimeItem,
  preferences: ReturnType<typeof buildPreferences>,
  fitScore: number
) {
  const matchedGenre = item.genres?.find((genre) => preferences.genres.has(genre));
  const matchedStudio = item.studios?.find((studio) => preferences.studios.has(studio.name));
  const matchedActor = item.voiceActors?.find((actor) => preferences.actors.has(actor.name));

  if (matchedGenre) {
    return `よく見ているジャンル「${matchedGenre}」に近い候補です。`;
  }
  if (matchedStudio) {
    return `保存済み作品と同じ制作会社「${matchedStudio.name}」の候補です。`;
  }
  if (matchedActor) {
    return `気になる声優「${matchedActor.name}」が参加しています。`;
  }
  if (fitScore > 10) {
    return "評価と人気のバランスがよい候補です。";
  }
  return "この年代の代表候補としてチェックできます。";
}

function addWeight(map: Map<string, number>, key: string, weight: number) {
  const normalized = key.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + weight);
}

function getPopularity(item: AnimeItem) {
  return item.popularity ?? item.reputation?.members ?? item.reputation?.popularity ?? 0;
}

function getScore(item: AnimeItem) {
  const score = item.score ?? item.reputation?.score ?? 0;
  return item.reputation?.scoreMax === 10 ? score * 10 : score;
}

function formatScore(item: AnimeItem) {
  const score = getScore(item);
  return score ? String(Math.round(score)) : "-";
}

function formatNumber(value?: number | null) {
  if (!value) return "-";
  return new Intl.NumberFormat("ja-JP", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
