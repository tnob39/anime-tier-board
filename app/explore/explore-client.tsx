"use client";

import { ExternalLink, Loader2, PlayCircle, Plus, Search, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { track } from "@/lib/analytics";
import { filterAnimeItems } from "@/lib/anime-filters";
import { getAnimePopularity as getPopularity } from "@/lib/home-seasonal-add";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import {
  STREAMING_SERVICES,
  getMergedStreamingPlatforms,
  getStreamingPlatformOverflowCount,
  STREAMING_PLATFORM_VISIBLE_LIMIT
} from "@/lib/streaming-services";
import type { UserSubscription } from "@/lib/subscriptions";
import type { AnimeItem, SeasonalFreshness } from "@/lib/types";

type SeasonalApiResponse = {
  year: number;
  items: AnimeItem[];
  source?: string;
  freshness?: SeasonalFreshness | string;
  fetchedAt?: string;
  warning?: string;
  error?: string;
};

type SortMode = "fit" | "popularity" | "score";

type ExploreNotice = {
  text: string;
  role: "status" | "alert";
};

const PAGE_SIZE = 50;

const UNAVAILABLE_NOTICE_TEXT =
  "季節データを取得できませんでした。時間をおいて「さがす」を押してください。";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

/** Format ISO fetchedAt for ja-JP / Asia/Tokyo display. Returns null if unusable. */
export function formatSeasonalFetchedAtJa(fetchedAt: string): string | null {
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalBoolean(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "boolean";
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** titles.* values consumed by title search (toLowerCase). */
function isSafeTitles(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  for (const key of ["native", "userPreferred", "romaji", "english"] as const) {
    if (key in value && !isOptionalString(value[key])) {
      return false;
    }
  }
  return true;
}

/** studios[].name used by ranking / reason copy. */
function isSafeStudios(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry) || typeof entry.name !== "string") {
      return false;
    }
  }
  return true;
}

/** voiceActors[].name used by ranking / reason copy. */
function isSafeVoiceActors(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry) || typeof entry.name !== "string") {
      return false;
    }
  }
  return true;
}

/** streamingPlatforms name/url used by pills + instant-watch provider id map. */
function isSafeStreamingPlatforms(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.name !== "string" || typeof entry.url !== "string") {
      return false;
    }
  }
  return true;
}

/** streamingEpisodes url/site used by pills + instant-watch fallback. */
function isSafeStreamingEpisodes(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.url !== "string") {
      return false;
    }
    if ("site" in entry && !isOptionalString(entry.site)) {
      return false;
    }
    if ("title" in entry && !isOptionalString(entry.title)) {
      return false;
    }
  }
  return true;
}

/** streamingProvidersJp.flatrate / providerLink used by pills + filters. */
function isSafeStreamingProvidersJp(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (!Array.isArray(value.flatrate)) {
    return false;
  }
  for (const provider of value.flatrate) {
    if (!isPlainObject(provider)) {
      return false;
    }
    if (typeof provider.id !== "number" || !Number.isFinite(provider.id)) {
      return false;
    }
    if (typeof provider.name !== "string") {
      return false;
    }
    if ("logoUrl" in provider && provider.logoUrl !== null && typeof provider.logoUrl !== "string") {
      return false;
    }
  }
  if ("providerLink" in value && !isOptionalString(value.providerLink)) {
    return false;
  }
  return true;
}

/**
 * Safe shape gate for seasonal cards. Any null/non-object item, missing
 * required strings, or malformed nested values consumed by filters / ranking /
 * rendering makes the whole payload unavailable (no partial render / pageerror).
 */
function isSafeSeasonalItem(item: unknown): item is AnimeItem {
  if (!isPlainObject(item)) {
    return false;
  }
  for (const key of ["id", "title", "source", "imageUrl", "proxiedImageUrl", "siteUrl"] as const) {
    if (typeof item[key] !== "string") {
      return false;
    }
  }
  if (!isSafeTitles(item.titles)) {
    return false;
  }

  // Nested fields consumed by filters / ranking / rendering (when present).
  if (item.genres !== undefined && !isStringArray(item.genres)) {
    return false;
  }
  if ("format" in item && !isOptionalString(item.format)) {
    return false;
  }
  if (item.studios !== undefined && !isSafeStudios(item.studios)) {
    return false;
  }
  if (item.voiceActors !== undefined && !isSafeVoiceActors(item.voiceActors)) {
    return false;
  }
  if (item.streamingPlatforms !== undefined && !isSafeStreamingPlatforms(item.streamingPlatforms)) {
    return false;
  }
  if (item.streamingEpisodes !== undefined && !isSafeStreamingEpisodes(item.streamingEpisodes)) {
    return false;
  }
  if (item.streamingProvidersJp !== undefined && !isSafeStreamingProvidersJp(item.streamingProvidersJp)) {
    return false;
  }

  // Other scalars / nests actually read by explore sort / filter / badges.
  if ("score" in item && !isOptionalNumber(item.score)) {
    return false;
  }
  if ("popularity" in item && !isOptionalNumber(item.popularity)) {
    return false;
  }
  if ("seasonYear" in item && !isOptionalNumber(item.seasonYear)) {
    return false;
  }
  if ("isRebroadcast" in item && !isOptionalBoolean(item.isRebroadcast)) {
    return false;
  }
  if (item.reputation !== undefined && item.reputation !== null) {
    if (!isPlainObject(item.reputation)) {
      return false;
    }
    for (const key of ["score", "scoreMax", "popularity", "members"] as const) {
      if (key in item.reputation && !isOptionalNumber(item.reputation[key])) {
        return false;
      }
    }
  }
  if (item.airing !== undefined && item.airing !== null) {
    if (!isPlainObject(item.airing)) {
      return false;
    }
    if ("startDate" in item.airing && !isOptionalString(item.airing.startDate)) {
      return false;
    }
  }

  return true;
}

/**
 * Consume success payload freshness/source/fetchedAt only — never infer age.
 * Malformed success payloads and non-OK responses normalize to unavailable.
 */
export function resolveSeasonalFreshnessView(args: {
  ok: boolean;
  payload: unknown;
}): {
  items: AnimeItem[];
  notice: ExploreNotice;
} {
  const unavailable = {
    items: [] as AnimeItem[],
    notice: {
      text: UNAVAILABLE_NOTICE_TEXT,
      role: "alert" as const
    }
  };

  if (!args.ok || args.payload == null || typeof args.payload !== "object") {
    return unavailable;
  }

  const payload = args.payload as SeasonalApiResponse;
  const freshness = payload.freshness;

  if (freshness === "unavailable") {
    return unavailable;
  }

  if (freshness !== "fresh" && freshness !== "stale") {
    return unavailable;
  }

  if (!Array.isArray(payload.items)) {
    return unavailable;
  }

  // One bad item → clear entire list (never hand partial/unsafe rows to the grid).
  if (!payload.items.every(isSafeSeasonalItem)) {
    return unavailable;
  }

  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  if (!source) {
    return unavailable;
  }

  const fetchedAtRaw = typeof payload.fetchedAt === "string" ? payload.fetchedAt : "";
  const formatted = formatSeasonalFetchedAtJa(fetchedAtRaw);
  if (!formatted) {
    return unavailable;
  }

  const items = payload.items;

  if (freshness === "fresh") {
    return {
      items,
      notice: {
        text: `最新の季節データです。データ元: ${source} / 最終取得: ${formatted}`,
        role: "status"
      }
    };
  }

  return {
    items,
    notice: {
      text: `データを更新できていません（キャッシュ表示・最大7日）。データ元: ${source} / 最終取得: ${formatted}`,
      role: "status"
    }
  };
}

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
  const [notice, setNotice] = useState<ExploreNotice | null>(null);
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
    setNotice(null);

    try {
      const response = await fetch(`/api/anime/seasonal?year=${year}&season=all`, {
        cache: "no-store"
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const resolved = resolveSeasonalFreshnessView({
        ok: response.ok,
        payload
      });
      setItems(resolved.items);
      setNotice(resolved.notice);
    } catch {
      // Network/transport failure — same unavailable UX; さがす is the only retry.
      setItems([]);
      setNotice({
        text: UNAVAILABLE_NOTICE_TEXT,
        role: "alert"
      });
    } finally {
      setLoading(false);
    }
  }

  // 開いた直後・年代を変更した直後に自動的に読み込む（「さがす」ボタンは手動再取得用に残す）
  useEffect(() => {
    void loadYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  async function addToWatchlist(item: AnimeItem) {
    setSavingId(item.id);
    setNotice(null);

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
      setNotice({
        text: error instanceof Error ? error.message : "視聴管理への追加に失敗しました。",
        role: "status"
      });
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

      {notice ? (
        <div
          className="notice warning"
          role={notice.role}
          aria-live={notice.role === "alert" ? "assertive" : "polite"}
        >
          {notice.text}
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
  const platforms = getMergedStreamingPlatforms(item);
  const visiblePlatforms = platforms.slice(0, STREAMING_PLATFORM_VISIBLE_LIMIT);
  const remainingCount = getStreamingPlatformOverflowCount(platforms.length);

  if (!visiblePlatforms.length) {
    return null;
  }

  return (
    <div className="streaming-links explore-streaming-links" aria-label="見放題">
      {visiblePlatforms.map((platform) =>
        platform.url ? (
          <a
            key={`${platform.name}:${platform.url}`}
            href={platform.url}
            target="_blank"
            rel="noreferrer"
            title={`${platform.name}で見放題`}
          >
            <PlayCircle size={11} aria-hidden="true" />
            <span>{platform.name}</span>
            <span className="sr-only">見放題（新しいタブで開きます）</span>
          </a>
        ) : (
          <span key={`${platform.name}:nolink`} title={`${platform.name}で見放題`}>
            <PlayCircle size={11} aria-hidden="true" />
            <span>{platform.name}</span>
          </span>
        )
      )}
      {remainingCount ? (
        <span className="streaming-more" title={`他${remainingCount}件の見放題`}>
          +{remainingCount}
        </span>
      ) : null}
    </div>
  );
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
