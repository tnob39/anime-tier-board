"use client";

import "./watchlist-v2-grok.css";
import {
  ExternalLink,
  Loader2,
  Megaphone,
  Minus,
  MoreVertical,
  Plus,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import StatusBottomSheet from "@/components/StatusBottomSheet";
import { track } from "@/lib/analytics";
import { isOwnerEmail } from "@/lib/owner";
import { bucketBySeason } from "@/lib/season-bucket";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import { matchServiceIdByProviderName } from "@/lib/streaming-services";
import type { AnimeItem } from "@/lib/types";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";

export const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止",
};

const watchSlotOptions = [
  "",
  "放送日に見る",
  "週末にまとめて見る",
  "配信されたら見る",
  "時間がある時に見る",
];

type FilterKey = "all" | "watching" | "planned" | "completed" | "unwatched";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "watching", label: "視聴中" },
  { key: "planned", label: "予定" },
  { key: "completed", label: "完了" },
  { key: "unwatched", label: "未視聴話あり" },
];

export function getStatusBadgeClass(status: ViewingStatus): string {
  if (status === "watching") return "watching";
  if (status === "completed") return "completed";
  if (status === "planned") return "planned";
  return "paused";
}

export function computeProgress(record: AnimeStatusRecord) {
  const a = record.anime;
  if (!a || !a.episodes) return null;
  const cur = record.watchedEpisodes ?? 0;
  const total = a.episodes;
  const pct = Math.max(0, Math.min(100, Math.round((cur / total) * 100)));
  return { cur, total, pct };
}

export function computeCatchUp(record: AnimeStatusRecord): { unwatched: number } | "caughtUp" | null {
  const anime = record.anime;
  if (record.status !== "watching" || !anime) return null;

  const nextEpisode = anime.airing?.nextEpisode;
  let airedCount: number | null = null;
  if (typeof nextEpisode?.episode === "number" && nextEpisode.episode >= 1) {
    airedCount = nextEpisode.episode - 1;
  } else if (
    typeof anime.episodes === "number"
    && anime.episodes >= 1
    && nextEpisode == null
  ) {
    airedCount = anime.episodes;
  }

  if (airedCount === null || airedCount < 1) return null;

  const watched = record.watchedEpisodes ?? 0;
  return watched >= airedCount ? "caughtUp" : { unwatched: airedCount - watched };
}

export type WatchlistEditor = {
  items: AnimeStatusRecord[];
  openSheet: (record: AnimeStatusRecord) => void;
  closeSheet: () => void;
  editing: AnimeStatusRecord | null;
  draftStatus: ViewingStatus;
  setDraftStatus: (v: ViewingStatus) => void;
  draftFavorite: number | null;
  setDraftFavorite: (v: number | null) => void;
  draftWatchSlot: string;
  setDraftWatchSlot: (v: string) => void;
  draftNotes: string;
  setDraftNotes: (v: string) => void;
  draftWatched: number;
  setDraftWatched: (v: number) => void;
  savingId: string | null;
  message: string | null;
  messageKind: "success" | "error";
  setMessage: (m: string | null) => void;
  setMessageKind: (k: "success" | "error") => void;
  shareUrl: string | null;
  shareOutcome: ShareOutcome;
  sharing: boolean;
  changeStatus: (record: AnimeStatusRecord, next: ViewingStatus) => void;
  saveTracking: (record: AnimeStatusRecord) => void;
  removeItem: (record: AnimeStatusRecord) => void;
  createShare: () => void;
  quickSetStatus: (anime: AnimeItem, status: ViewingStatus) => Promise<void>;
  patchRecord: (animeId: string, patch: Partial<AnimeStatusRecord>) => void;
};

export function useWatchlistV2Editor(initialItems: AnimeStatusRecord[]): WatchlistEditor {
  const [items, setItems] = useState<AnimeStatusRecord[]>(
    () => initialItems.filter((i) => i.anime)
  );

  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");

  // Edit sheet state
  const [editing, setEditing] = useState<AnimeStatusRecord | null>(null);
  const [draftStatus, setDraftStatus] = useState<ViewingStatus>("watching");
  const [draftFavorite, setDraftFavorite] = useState<number | null>(null);
  const [draftWatchSlot, setDraftWatchSlot] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftWatched, setDraftWatched] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  function openSheet(record: AnimeStatusRecord) {
    if (!record.anime) return;
    setEditing(record);
    setDraftStatus(record.status);
    setDraftFavorite(record.favoriteLevel);
    setDraftWatchSlot(record.watchSlot ?? "");
    setDraftNotes(record.notes ?? "");
    setDraftWatched(record.watchedEpisodes ?? 0);
    setMessage(null);
  }

  function closeSheet() {
    setEditing(null);
  }

  // Status change in sheet commits immediately
  const changeStatus = useCallback(
    async (record: AnimeStatusRecord, next: ViewingStatus) => {
      if (!record.anime || next === record.status) return;

      const prev = record;
      setItems((recs) =>
        recs.map((r) => (r.animeId === record.animeId ? { ...r, status: next } : r))
      );
      setSavingId(record.animeId);
      setDraftStatus(next);

      try {
        const res = await fetch("/api/statuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId: record.animeId,
            status: next,
            anime: record.anime,
          }),
        });
        if (!res.ok) throw new Error("ステータス保存に失敗しました。");
        track({
          name: "status_update",
          from: prev.status,
          to: next,
          source: "edit_sheet",
        });
      } catch (e) {
        setItems((recs) =>
          recs.map((r) => (r.animeId === record.animeId ? prev : r))
        );
        setDraftStatus(prev.status);
        setMessageKind("error");
        setMessage(e instanceof Error ? e.message : "ステータス保存に失敗しました。");
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const saveTracking = useCallback(
    async (record: AnimeStatusRecord) => {
      if (!record.anime) return;

      const current = record;
      const nextWatched =
        draftWatched < 0
          ? 0
          : record.anime.episodes != null
            ? Math.min(draftWatched, record.anime.episodes)
            : draftWatched;

      const nextRecord: AnimeStatusRecord = {
        ...record,
        favoriteLevel: draftFavorite,
        watchSlot: draftWatchSlot || null,
        notes: draftNotes || null,
        watchedEpisodes: nextWatched,
        status: draftStatus,
      };

      setItems((recs) =>
        recs.map((r) => (r.animeId === record.animeId ? nextRecord : r))
      );
      setSavingId(record.animeId);

      try {
        if (draftStatus !== current.status) {
          const sres = await fetch("/api/statuses", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              animeId: record.animeId,
              status: draftStatus,
              anime: record.anime,
            }),
          });
          if (!sres.ok) throw new Error("ステータス保存に失敗しました。");
        }

        const tres = await fetch("/api/watchlist", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId: record.animeId,
            favoriteLevel: draftFavorite,
            watchSlot: draftWatchSlot || null,
            notes: draftNotes || null,
            watchedEpisodes: nextWatched,
          }),
        });
        if (!tres.ok) throw new Error("視聴管理の保存に失敗しました。");

        if (nextWatched !== (current.watchedEpisodes ?? 0)) {
          track({ name: "episode_update", source: "edit_sheet" });
        }

        setMessageKind("success");
        setMessage("保存しました。");
        // keep sheet open with latest
        setEditing(nextRecord);
      } catch (e) {
        setItems((recs) =>
          recs.map((r) => (r.animeId === record.animeId ? current : r))
        );
        setMessageKind("error");
        setMessage(e instanceof Error ? e.message : "保存に失敗しました。");
      } finally {
        setSavingId(null);
      }
    },
    [draftStatus, draftFavorite, draftWatchSlot, draftNotes, draftWatched]
  );

  const removeItem = useCallback(
    async (record: AnimeStatusRecord) => {
      if (!record.anime) return;
      const confirmed = window.confirm(`「${record.anime.title}」を視聴リストから削除しますか？`);
      if (!confirmed) return;

      const prevItems = items;
      setItems((recs) => recs.filter((r) => r.animeId !== record.animeId));
      setSavingId(record.animeId);
      closeSheet();

      try {
        const res = await fetch(
          `/api/statuses?animeId=${encodeURIComponent(record.animeId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("削除に失敗しました。");
        setMessageKind("success");
        setMessage(`「${record.anime.title}」を削除しました。`);
      } catch (e) {
        setItems(prevItems);
        setMessageKind("error");
        setMessage(e instanceof Error ? e.message : "削除に失敗しました。");
      } finally {
        setSavingId(null);
      }
    },
    [items]
  );

  const createShare = useCallback(async () => {
    setSharing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/watchlist/shares", { method: "POST" });
      const payload = (await res.json()) as { shareId?: string; error?: string };
      if (!res.ok || !payload.shareId) {
        throw new Error(payload.error ?? "共有URLの作成に失敗しました。");
      }
      track({ name: "watchlist_share_create" });
      const url = `${window.location.origin}/watchlist/share/${payload.shareId}`;
      setShareUrl(url);
      const outcome = await shareOrCopyUrl({
        url,
        title: "私の視聴管理リスト",
        text: "今追ってるアニメをまとめました",
      });
      setShareOutcome(outcome);
    } catch (e) {
      setMessageKind("error");
      setMessage(e instanceof Error ? e.message : "共有URLの作成に失敗しました。");
    } finally {
      setSharing(false);
    }
  }, []);

  const quickSetStatus = useCallback(
    async (anime: AnimeItem, status: ViewingStatus) => {
      const previousItems = items;
      const priorStatus = items.find((record) => record.animeId === anime.id)?.status ?? status;
      const optimisticRecord: AnimeStatusRecord = {
        animeId: anime.id,
        status,
        anime,
        favoriteLevel: null,
        watchSlot: null,
        notes: null,
        watchRhythm: null,
        watchedEpisodes: null,
        updatedAt: new Date().toISOString(),
      };

      setItems((current) => [
        optimisticRecord,
        ...current.filter((record) => record.animeId !== anime.id),
      ]);

      try {
        const response = await fetch("/api/statuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ animeId: anime.id, status, anime }),
        });

        if (!response.ok) {
          throw new Error("ステータスの保存に失敗しました。");
        }
        track({
          name: "status_update",
          from: priorStatus,
          to: status,
          source: "quick_add",
        });
      } catch (e) {
        setItems(previousItems);
        setMessageKind("error");
        setMessage(e instanceof Error ? e.message : "ステータスの保存に失敗しました。");
      }
    },
    [items]
  );

  const patchRecord = useCallback((animeId: string, patch: Partial<AnimeStatusRecord>) => {
    setItems((recs) =>
      recs.map((r) => (r.animeId === animeId ? { ...r, ...patch } : r))
    );
  }, []);

  // When editing record updates externally, refresh drafts
  useEffect(() => {
    if (!editing) return;
    const live = items.find((r) => r.animeId === editing.animeId);
    if (live) {
      setDraftStatus(live.status);
      setDraftFavorite(live.favoriteLevel);
      setDraftWatchSlot(live.watchSlot ?? "");
      setDraftNotes(live.notes ?? "");
      setDraftWatched(live.watchedEpisodes ?? 0);
    }
  }, [items, editing?.animeId]);

  return {
    items,
    openSheet,
    closeSheet,
    editing,
    draftStatus,
    setDraftStatus,
    draftFavorite,
    setDraftFavorite,
    draftWatchSlot,
    setDraftWatchSlot,
    draftNotes,
    setDraftNotes,
    draftWatched,
    setDraftWatched,
    savingId,
    message,
    messageKind,
    setMessage,
    setMessageKind,
    shareUrl,
    shareOutcome,
    sharing,
    changeStatus,
    saveTracking,
    removeItem,
    createShare,
    quickSetStatus,
    patchRecord,
  };
}

export function WatchlistClientV2Grok({
  initialItems,
  recommendedAnime = [],
  recommendedByGenre = false,
}: {
  initialItems: AnimeStatusRecord[];
  recommendedAnime?: AnimeItem[];
  recommendedByGenre?: boolean;
}) {
  const editor = useWatchlistV2Editor(initialItems);
  const {
    items,
    openSheet,
    closeSheet,
    editing,
    draftStatus,
    setDraftStatus,
    draftFavorite,
    setDraftFavorite,
    draftWatchSlot,
    setDraftWatchSlot,
    draftNotes,
    setDraftNotes,
    draftWatched,
    setDraftWatched,
    savingId,
    message,
    messageKind,
    shareUrl,
    shareOutcome,
    sharing,
    changeStatus,
    saveTracking,
    removeItem,
    createShare,
    quickSetStatus,
    patchRecord,
  } = editor;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [tierMap, setTierMap] = useState<Record<string, { label: string; color: string }>>({});
  const [statusSheetRecord, setStatusSheetRecord] = useState<AnimeStatusRecord | null>(null);

  const liveStatusSheetRecord = useMemo(() => {
    if (!statusSheetRecord) return null;
    return items.find((r) => r.animeId === statusSheetRecord.animeId) ?? statusSheetRecord;
  }, [items, statusSheetRecord]);

  const visibleItems = items;

  const filteredItems = useMemo(() => {
    let list = visibleItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.anime?.title.toLowerCase().includes(q));
    }
    if (filter === "unwatched") {
      list = list.filter((r) => {
        const a = r.anime;
        if (!a || a.episodes == null) return false;
        return r.status === "watching" && (r.watchedEpisodes ?? 0) < a.episodes;
      });
    } else if (filter !== "all") {
      const target = filter as ViewingStatus;
      list = list.filter((r) => r.status === target);
    }
    return list;
  }, [visibleItems, filter, search]);

  // 期セクション（今期 / 来期 / その他）。通常版と共通の bucketBySeason を使用。
  // 上部フィルタチップで絞った filteredItems を期で分割する。
  const seasonBuckets = useMemo(() => bucketBySeason(filteredItems), [filteredItems]);

  const count = visibleItems.length;

  useEffect(() => {
    fetch("/api/boards/tiers")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { tiers?: Record<string, { label: string; color: string }> }) => {
        setTierMap(data.tiers ?? {});
      })
      .catch(() => {
        // silent on failure: badge simply won't show
      });
  }, []);

  return (
    <div className="wl2g-root">
      <header className="wl2g-header">
        <div className="wl2g-top">
          <div className="wl2g-title">マイリスト</div>
          <div className="wl2g-avatar" aria-hidden />
        </div>

        <div className="wl2g-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="text"
            placeholder="作品を検索"
            aria-label="作品を検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wl2g-filters" role="tablist" aria-label="フィルタ">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`wl2g-fchip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Link href="/lab/promote" className="command-button" style={{ flex: 1 }}>
            <Megaphone size={16} />
            <span style={{ marginLeft: 6 }}>期まとめ布教</span>
          </Link>
          <button
            type="button"
            className="command-button emphasis-button"
            onClick={() => void createShare()}
            disabled={sharing || count === 0}
            style={{ flex: 1 }}
          >
            {sharing ? <Loader2 className="spin" size={16} /> : <Share2 size={16} />}
            <span style={{ marginLeft: 6 }}>共有</span>
          </button>
        </div>
      </header>

      {message ? (
        <div
          className={`notice ${messageKind}`}
          style={{ margin: "8px 12px" }}
          role={messageKind === "error" ? "alert" : "status"}
          aria-live={messageKind === "error" ? undefined : "polite"}
        >
          {message}
        </div>
      ) : null}
      {shareUrl ? (
        <div className="notice success" style={{ margin: "0 12px 8px" }} role="status" aria-live="polite">
          {shareOutcome === "copied" ? "共有URLをコピーしました:" : "共有URL:"}{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      ) : null}

      {count === 0 ? (
        <div className="wl2g-empty">
          <h3>まだ作品がありません</h3>
          <p>ホームの「今期から追加」から「見たい」や「視聴中」に追加しましょう。</p>
          <div style={{ marginTop: 12 }}>
            <Link className="command-button emphasis-button" href="/#home-add-section">
              ホームから作品を追加する →
            </Link>
          </div>
        </div>
      ) : seasonBuckets.length ? (
        seasonBuckets.map((bucket) => (
          <div key={bucket.key}>
            <div className="wl2g-sec">
              <h3>
                {bucket.label}
                {bucket.hint ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                    {bucket.hint}
                  </span>
                ) : null}
              </h3>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {bucket.items.length}件
              </span>
            </div>
            <div className="wl2g-lane">
              {bucket.items.map((record) => {
                const tier = tierMap[record.animeId];
                return (
                  <PosterCard
                    key={record.animeId}
                    record={record}
                    onOpen={() => openSheet(record)}
                    onChangeStatus={() => setStatusSheetRecord(record)}
                    onRemove={() => void removeItem(record)}
                    tier={tier}
                  />
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="wl2g-empty">
          <p>条件に合う作品がありません。フィルタを変えてみてください。</p>
        </div>
      )}

      <DiscoveryLane
        recommendedAnime={recommendedAnime}
        recommendedByGenre={recommendedByGenre}
        items={items}
        onQuickStatus={quickSetStatus}
      />

      {editing && editing.anime ? (
        <EditSheet
          record={editing}
          draftStatus={draftStatus}
          draftFavorite={draftFavorite}
          draftWatchSlot={draftWatchSlot}
          draftNotes={draftNotes}
          draftWatched={draftWatched}
          saving={savingId === editing.animeId}
          onClose={closeSheet}
          onStatusChange={(s) => void changeStatus(editing, s)}
          onFavoriteChange={setDraftFavorite}
          onWatchSlotChange={setDraftWatchSlot}
          onNotesChange={setDraftNotes}
          onWatchedChange={setDraftWatched}
          onSave={() => void saveTracking(editing)}
          onRemove={() => void removeItem(editing)}
        />
      ) : null}

      <StatusBottomSheet
        open={Boolean(liveStatusSheetRecord?.anime)}
        record={liveStatusSheetRecord}
        onClose={() => setStatusSheetRecord(null)}
        onStatusSaved={(animeId, nextStatus) => {
          patchRecord(animeId, { status: nextStatus });
        }}
        onEpisodesSaved={(animeId, watchedEpisodes) => {
          patchRecord(animeId, { watchedEpisodes });
        }}
      />
    </div>
  );
}

function DiscoveryLane({
  recommendedAnime,
  recommendedByGenre,
  items,
  onQuickStatus,
}: {
  recommendedAnime: AnimeItem[];
  recommendedByGenre: boolean;
  items: AnimeStatusRecord[];
  onQuickStatus: (anime: AnimeItem, status: ViewingStatus) => Promise<void>;
}) {
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const [savingId, setSavingId] = useState<string | null>(null);
  const laneItems = recommendedAnime.filter(
    (anime) => !items.some((record) => record.animeId === anime.id)
  );

  if (laneItems.length === 0) return null;

  async function handleAdd(anime: AnimeItem) {
    setSavingId(anime.id);
    try {
      await onQuickStatus(anime, "planned");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="wl2g-discover">
      <div className="wl2g-discover-head">
        <div>
          <h2>今期のおすすめ</h2>
          <p>
            {recommendedByGenre
              ? "マイリストのジャンル傾向から選んでいます"
              : "今期の人気作から"}
          </p>
        </div>
        {isOwner ? (
          <Link href="/explore" className="wl2g-discover-more">
            もっと探す
          </Link>
        ) : null}
      </div>
      <div className="wl2g-discover-lane" role="list" aria-label="今期のおすすめ">
        {laneItems.map((anime) => {
          const coverImage = anime.proxiedImageUrl || anime.imageUrl || null;
          const provider = anime.streamingProvidersJp?.flatrate?.[0] ?? null;
          const isSaving = savingId === anime.id;

          return (
            <div key={anime.id} className="wl2g-discover-card" role="listitem">
              <div className="wl2g-discover-poster">
                {coverImage ? (
                  <Image
                    src={coverImage}
                    alt={anime.title}
                    width={92}
                    height={130}
                    className="wl2g-discover-image"
                    unoptimized
                  />
                ) : (
                  <AnimeCardPlaceholder
                    title={anime.title}
                    className="wl2g-discover-placeholder"
                  />
                )}
                {provider?.logoUrl ? (
                  <span className="wl2g-provider" title={provider.name}>
                    <img src={provider.logoUrl} alt={provider.name} width={16} height={16} loading="lazy" />
                  </span>
                ) : null}
              </div>
              <p className="wl2g-discover-title">{anime.title}</p>
              <button
                type="button"
                className="wl2g-discover-button"
                disabled={isSaving}
                aria-label={isSaving ? "保存中" : "見たい"}
                onClick={() => void handleAdd(anime)}
              >
                {isSaving ? <Loader2 className="spin" size={12} aria-hidden="true" /> : "見たい"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PosterCard({
  record,
  onOpen,
  onChangeStatus,
  onRemove,
  tier,
}: {
  record: AnimeStatusRecord;
  onOpen: () => void;
  onChangeStatus?: () => void;
  onRemove?: () => void;
  tier?: { label: string; color: string };
}) {
  const anime = record.anime!;
  const prog = computeProgress(record);
  const catchUp = computeCatchUp(record);
  const badge = getStatusBadgeClass(record.status);
  const label = statusLabels[record.status];
  const provider = anime.streamingProvidersJp?.flatrate?.[0] ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuElRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuElRef.current?.querySelector<HTMLElement>(".wl2g-more-panel button")?.focus();
    function onDocPointerDown(event: PointerEvent) {
      const el = menuElRef.current;
      if (el && !el.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function renderMenu() {
    if (!onChangeStatus && !onRemove) return null;
    return (
      <div
        className="wl2g-more"
        ref={menuElRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={menuTriggerRef}
          className="wl2g-more-trigger"
          aria-label="その他の操作"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className="wl2g-more-panel">
            {onChangeStatus ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onChangeStatus();
                }}
              >
                ステータスを変更
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                className="wl2g-more-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onRemove();
                }}
              >
                マイリストから削除
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="wl2g-poster"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`${anime.title}の詳細を開く`}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {anime.proxiedImageUrl ? (
        <div
          className="pic"
          style={{ backgroundImage: `url(${anime.proxiedImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <span className={`wl2g-badge ${badge}`}>{label}</span>
          {tier ? (
            <span className="wl2g-tier" style={{ background: tier.color }}>{tier.label}</span>
          ) : null}
          {provider?.logoUrl ? (
            <span className={tier ? "wl2g-provider wl2g-provider--below" : "wl2g-provider"} title={provider.name}>
              <img src={provider.logoUrl} alt={provider.name} width={16} height={16} loading="lazy" />
            </span>
          ) : null}
          {renderMenu()}
          {prog && record.status === "watching" ? (
            <div className="wl2g-meta">
              <div className="wl2g-ptitle">{anime.title}</div>
              <div className="wl2g-prog">
                <div className="wl2g-bar">
                  <i style={{ width: `${prog.pct}%` }} />
                </div>
                <div className="wl2g-pnum">
                  {prog.cur} / {prog.total}話
                </div>
                {catchUp === "caughtUp" ? (
                  <div className="wl2g-catchup">追いつき済み</div>
                ) : catchUp ? (
                  <div className="wl2g-catchup wl2g-catchup--behind">未視聴{catchUp.unwatched}話</div>
                ) : null}
              </div>
            </div>
          ) : record.status === "completed" && prog ? (
            <div className="wl2g-meta">
              <div className="wl2g-ptitle">{anime.title}</div>
              <div className="wl2g-prog">
                <div className="wl2g-bar">
                  <i style={{ width: "100%" }} />
                </div>
                <div className="wl2g-pnum">全{prog.total}話 視聴済</div>
              </div>
            </div>
          ) : (
            <div className="wl2g-meta">
              <div className="wl2g-ptitle">{anime.title}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="pic" style={{ background: "var(--surface-soft)" }}>
          <AnimeCardPlaceholder title={anime.title} />
          <span className={`wl2g-badge ${badge}`} style={{ zIndex: 3 }}>{label}</span>
          {tier ? (
            <span className="wl2g-tier" style={{ background: tier.color }}>{tier.label}</span>
          ) : null}
          {provider?.logoUrl ? (
            <span className={tier ? "wl2g-provider wl2g-provider--below" : "wl2g-provider"} title={provider.name}>
              <img src={provider.logoUrl} alt={provider.name} width={16} height={16} loading="lazy" />
            </span>
          ) : null}
          {renderMenu()}
          <div className="wl2g-meta">
            <div className="wl2g-ptitle" style={{ textShadow: "none" }}>{anime.title}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PosterLane({
  title,
  hint,
  count,
  records,
  onOpenCard,
}: {
  title: string;
  hint?: string | null;
  count?: number;
  records: AnimeStatusRecord[];
  onOpenCard: (record: AnimeStatusRecord) => void;
}) {
  const n = count ?? records.length;
  return (
    <div>
      <div className="wl2g-sec">
        <h3>
          {title}
          {hint ? (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
              {hint}
            </span>
          ) : null}
        </h3>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{n}件</span>
      </div>
      <div className="wl2g-lane">
        {records.map((record) => (
          <PosterCard
            key={record.animeId}
            record={record}
            onOpen={() => onOpenCard(record)}
          />
        ))}
      </div>
    </div>
  );
}

export function EditSheet({
  record,
  draftStatus,
  draftFavorite,
  draftWatchSlot,
  draftNotes,
  draftWatched,
  saving,
  onClose,
  onStatusChange,
  onFavoriteChange,
  onWatchSlotChange,
  onNotesChange,
  onWatchedChange,
  onSave,
  onRemove,
}: {
  record: AnimeStatusRecord;
  draftStatus: ViewingStatus;
  draftFavorite: number | null;
  draftWatchSlot: string;
  draftNotes: string;
  draftWatched: number;
  saving: boolean;
  onClose: () => void;
  onStatusChange: (s: ViewingStatus) => void;
  onFavoriteChange: (v: number | null) => void;
  onWatchSlotChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onWatchedChange: (v: number) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const anime = record.anime!;
  const totalEps = anime.episodes ?? null;
  const curW = Math.max(0, Math.min(draftWatched, totalEps ?? draftWatched));
  const flatrateProviders = anime.streamingProvidersJp?.flatrate ?? [];
  const seenServiceIds = new Set<string>();
  const dedupedChips = flatrateProviders.flatMap((provider) => {
    const serviceId = matchServiceIdByProviderName(provider.name);
    if (!serviceId || seenServiceIds.has(serviceId)) return [];
    seenServiceIds.add(serviceId);
    return [{ provider, serviceId }];
  });
  const hasUnmatchedProvider = flatrateProviders.some(
    (provider) => matchServiceIdByProviderName(provider.name) === null
  );
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  function dec() {
    const next = Math.max(0, draftWatched - 1);
    onWatchedChange(next);
  }
  function inc() {
    const max = totalEps ?? draftWatched + 1;
    const next = Math.min(max, draftWatched + 1);
    onWatchedChange(next);
  }

  return (
    <div className="wl2g-sheet-overlay" onClick={onClose}>
      <div
        className="wl2g-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="wl2g-sheet-head">
          <h3 id={titleId}>{anime.title}</h3>
          <button
            className="wl2g-close"
            onClick={onClose}
            aria-label="閉じる"
            ref={closeButtonRef}
          >
            <X size={20} />
          </button>
        </div>

        <div className="wl2g-status-row">
          {(Object.keys(statusLabels) as ViewingStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`wl2g-status-chip${draftStatus === s ? " active" : ""}`}
              onClick={() => onStatusChange(s)}
              disabled={saving}
            >
              {statusLabels[s]}
            </button>
          ))}
        </div>

        {flatrateProviders.length ? (
          <div className="wl2g-watch-row" aria-label="配信サービスで見る">
            {dedupedChips.map(({ provider, serviceId }) => (
              <a
                key={serviceId}
                href={`/api/go/${serviceId}`}
                target="_blank"
                rel="noreferrer"
                className="wl2g-watch-chip"
              >
                {provider.logoUrl ? (
                  <img src={provider.logoUrl} alt="" width={16} height={16} loading="lazy" />
                ) : null}
                {provider.name}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ))}
            {hasUnmatchedProvider && anime.streamingProvidersJp?.providerLink ? (
              <a
                href={anime.streamingProvidersJp.providerLink}
                target="_blank"
                rel="noreferrer"
                className="wl2g-watch-chip"
              >
                配信情報を見る
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="wl2g-stars" aria-label="お気に入り度">
          {[1, 2, 3, 4, 5].map((lv) => (
            <button
              key={lv}
              type="button"
              className={lv <= (draftFavorite ?? 0) ? "active" : ""}
              onClick={() => onFavoriteChange(draftFavorite === lv ? null : lv)}
              aria-label={`お気に入り度 ${lv}`}
              aria-pressed={lv <= (draftFavorite ?? 0)}
            >
              <Star size={20} fill="currentColor" />
            </button>
          ))}
        </div>

        {totalEps != null ? (
          <div className="wl2g-field">
            <label>視聴済み話数</label>
            <div className="wl2g-episodes">
              <button type="button" onClick={dec} disabled={saving} aria-label="視聴済み話数を減らす">
                <Minus size={18} />
              </button>
              <span className="num">
                {curW} / {totalEps}
              </span>
              <button type="button" onClick={inc} disabled={saving} aria-label="視聴済み話数を増やす">
                <Plus size={18} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="wl2g-field">
          <label htmlFor="wl2g-watch-slot">いつ見る？</label>
          <select
            id="wl2g-watch-slot"
            className="wl2g-select"
            value={draftWatchSlot}
            onChange={(e) => onWatchSlotChange(e.target.value)}
          >
            {watchSlotOptions.map((opt) => (
              <option key={opt || "empty"} value={opt}>
                {opt || "未設定"}
              </option>
            ))}
          </select>
        </div>

        <div className="wl2g-field">
          <label htmlFor="wl2g-notes">メモ</label>
          <textarea
            id="wl2g-notes"
            className="wl2g-textarea"
            value={draftNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            maxLength={500}
            placeholder="メモを入力（500文字まで）"
          />
          <p className="wl2g-char-counter">{draftNotes.length}/500文字</p>
        </div>

        <div className="wl2g-actions">
          <button
            type="button"
            className="wl2g-btn primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? <Loader2 className="spin" size={16} /> : null}
            <span>{saving ? "保存中" : "保存する"}</span>
          </button>
          <button
            type="button"
            className="wl2g-btn"
            onClick={() => {
              if (anime.siteUrl) window.open(anime.siteUrl, "_blank");
            }}
          >
            <ExternalLink size={16} style={{ marginRight: 4 }} /> 詳細
          </button>
        </div>

        <button
          type="button"
          className="wl2g-btn danger"
          style={{ width: "100%", marginTop: 10 }}
          onClick={onRemove}
          disabled={saving}
        >
          <Trash2 size={16} style={{ marginRight: 6 }} /> 視聴解除（削除）
        </button>

        <div className="wl2g-notice">変更は保存ボタンで確定します（ステータスは即時保存）。</div>
      </div>
    </div>
  );
}
