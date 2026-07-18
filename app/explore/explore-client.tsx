"use client";

import { ExternalLink, Loader2, PlayCircle, Plus, Search, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { track } from "@/lib/analytics";
import { filterAnimeItems } from "@/lib/anime-filters";
import { getAnimePopularity as getPopularity } from "@/lib/home-seasonal-add";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import { STREAMING_SERVICES } from "@/lib/streaming-services";
import type { UserSubscription } from "@/lib/subscriptions";
import type { AnimeItem } from "@/lib/types";

type SeasonalApiResponse = {
  year: number;
  items: AnimeItem[];
  warning?: string;
  error?: string;
};

type SortMode = "fit" | "popularity" | "score";

const PAGE_SIZE = 50;

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function ExploreClient({
  initialStatuses,
  initialSubscriptions
}: {
  initialStatuses: AnimeStatusRecord[];
  initialSubscriptions: UserSubscription[];
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [sortMode, setSortMode] = useState<SortMode>("fit");
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ViewingStatus>>(() =>
    Object.fromEntries(initialStatuses.map((record) => [record.animeId, record.status]))
  );
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const [onlyInstantWatch, setOnlyInstantWatch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const subscribedProviderIds = useMemo(
    () =>
      initialSubscriptions.flatMap((subscription) => {
        const service = STREAMING_SERVICES.find((item) => item.id === subscription.serviceId);
        return service?.tmdbProviderIds ?? [];
      }),
    [initialSubscriptions]
  );
  const hasSubscriptions = subscribedProviderIds.length > 0;
  const preferences = useMemo(() => buildPreferences(initialStatuses), [initialStatuses]);
  const yearOptions = useMemo(() => {
    const start = 1990;
    return Array.from({ length: currentYear - start + 1 }, (_, index) => currentYear - index);
  }, [currentYear]);

  const genreOptions = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const it of items) {
      for (const g of it.genres ?? []) {
        countMap.set(g, (countMap.get(g) ?? 0) + 1);
      }
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [items]);

  const filteredItems = useMemo(
    () =>
      filterAnimeItems(items, {
        hideMovies,
        hideRerunCandidates,
        seasonYear: year,
        onlyInstantWatch,
        subscribedProviderIds
      }),
    [hideMovies, hideRerunCandidates, items, year, onlyInstantWatch, subscribedProviderIds]
  );

  const searchFilteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeGenres = selectedGenres;
    if (!q && activeGenres.length === 0) {
      return filteredItems;
    }
    return filteredItems.filter((item) => {
      if (q) {
        const t = item.title?.toLowerCase() ?? "";
        const n = item.titles?.native?.toLowerCase() ?? "";
        const r = item.titles?.romaji?.toLowerCase() ?? "";
        const e = item.titles?.english?.toLowerCase() ?? "";
        if (!t.includes(q) && !n.includes(q) && !r.includes(q) && !e.includes(q)) {
          return false;
        }
      }
      if (activeGenres.length > 0) {
        const gs = item.genres ?? [];
        if (!activeGenres.some((g) => gs.includes(g))) {
          return false;
        }
      }
      return true;
    });
  }, [filteredItems, searchQuery, selectedGenres]);

  const rankedItems = useMemo(
    () => rankItems(searchFilteredItems, preferences, statusMap, sortMode),
    [searchFilteredItems, preferences, statusMap, sortMode]
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleItems = rankedItems.slice(0, visibleCount);
  const hasMoreItems = rankedItems.length > visibleCount;

  // 新しい年代を取得した時・並び替えを変えた時・検索/ジャンルが変わった時は表示件数をリセットする
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items, sortMode, searchQuery, selectedGenres]);

  async function loadYear() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/anime/seasonal?year=${year}&season=all`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as SeasonalApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "作品の取得に失敗しました。");
      }

      setItems(payload.items);
      setMessage(payload.warning ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品の取得に失敗しました。");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // 画面を開いた直後、および年代を変更した時に自動で結果を取得する（「さがす」を押すまで空画面になるのを防ぐ）
  useEffect(() => {
    void loadYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

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

  function toggleGenre(genre: string) {
    setSelectedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    );
  }

  function clearSearchAndGenres() {
    setSearchQuery("");
    setSelectedGenres([]);
  }

  return (
    <main className="app-main explore-main">
      <header className="explore-header">
        <div>
          <p className="eyebrow">過去作品探索</p>
          <h1>年代を選んで作品をさがす</h1>
          <p>選んだ年の作品を、人気・評価・あなたの好みで並べます。</p>
        </div>
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
        <div className="explore-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchQuery.trim()) {
                track({ name: "search", query_type: "explore" });
              }
            }}
            placeholder="タイトルで検索"
            aria-label="タイトルで検索"
          />
        </div>
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
              aria-pressed={sortMode === value}
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
            title={
              hasSubscriptions
                ? "加入中サービスで見られる作品に絞り込む"
                : "配信のある作品に絞り込む（サブスクを登録すると加入中サービスで絞り込めます）"
            }
          >
            {hasSubscriptions ? "今すぐ見放題（加入中）" : "今すぐ見放題"}
          </button>
        </div>
        {genreOptions.length > 0 ? (
          <div className="filter-chip-group" aria-label="ジャンルで絞り込み">
            {genreOptions.map((genre) => (
              <button
                key={genre}
                className={selectedGenres.includes(genre) ? "filter-chip is-active" : "filter-chip"}
                type="button"
                onClick={() => toggleGenre(genre)}
                aria-pressed={selectedGenres.includes(genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        ) : null}
        {searchQuery || selectedGenres.length > 0 ? (
          <button
            type="button"
            className="filter-chip"
            onClick={clearSearchAndGenres}
          >
            クリア
          </button>
        ) : null}
        {onlyInstantWatch && !hasSubscriptions ? (
          <p className="explore-instant-watch-hint">
            サブスクを登録すると、加入中サービスで見られる作品だけに絞り込めます。{" "}
            <Link href="/dashboard?section=subscriptions">サブスクを登録する →</Link>
          </p>
        ) : null}
        <button
          className="command-button emphasis-button"
          type="button"
          onClick={() => void loadYear()}
          disabled={loading}
        >
          {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          <span>さがす</span>
        </button>
      </section>

      {message ? (
        <div className="notice warning" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}

      {rankedItems.length ? (
        <section className="explore-grid" aria-label="作品候補">
          {visibleItems.map((entry, index) => (
            <article key={entry.item.id} className="explore-card">
              {entry.item.proxiedImageUrl ? (
                <img src={entry.item.proxiedImageUrl} alt={entry.item.title} loading="lazy" />
              ) : (
                <AnimeCardPlaceholder title={entry.item.title} />
              )}
              <div className="explore-card-body">
                <div className="explore-rank">#{index + 1}</div>
                <h2>{entry.item.title}</h2>
                <div className="explore-badges">
                  <span>
                    <TrendingUp size={13} aria-hidden="true" />
                    {formatNumber(entry.item.popularity ?? entry.item.reputation?.popularity)}
                  </span>
                  <span>
                    <Star size={13} fill="currentColor" aria-hidden="true" />
                    {formatScore(entry.item)}
                  </span>
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
                        <Loader2 className="spin" size={16} aria-hidden="true" />
                      ) : (
                        <Plus size={16} aria-hidden="true" />
                      )}
                      <span>見たい</span>
                    </button>
                  )}
                  <a className="command-button" href={entry.item.siteUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} aria-hidden="true" />
                    詳細
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="watchlist-empty">
          <p>
            {items.length > 0
              ? "条件に一致する作品が見つかりませんでした。検索キーワードやフィルタを見直してください。"
              : "年代を選んで「さがす」を押すと、作品が表示されます。"}
          </p>
        </section>
      )}

      {hasMoreItems ? (
        <button
          type="button"
          className="explore-load-more"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          もっと見る（残り{rankedItems.length - visibleCount}件）
        </button>
      ) : null}
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
          <PlayCircle size={11} aria-hidden="true" />
          <span>{platform.name}</span>
          <span className="sr-only">（新しいタブで開きます）</span>
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

  if (item.streamingProvidersJp?.flatrate?.length) {
    const link = item.streamingProvidersJp.providerLink ?? "#";
    return item.streamingProvidersJp.flatrate
      .slice(0, 5)
      .map((provider) => ({ name: provider.name, url: link }));
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
    });
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
