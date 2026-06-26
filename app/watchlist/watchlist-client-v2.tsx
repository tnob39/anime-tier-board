"use client";

import "./watchlist-v2.css";
import {
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";

const statusLabels: Record<ViewingStatus, string> = {
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

const SECTION_DEFS: Array<{
  status: ViewingStatus | "paused-dropped";
  icon: string;
  title: string;
}> = [
  { status: "watching", icon: "▶", title: "現在視聴中" },
  { status: "planned", icon: "☆", title: "気になっている" },
  { status: "completed", icon: "✓", title: "視聴完了" },
  { status: "paused-dropped", icon: "⏸", title: "保留中" },
];

function getStatusBadgeClass(status: ViewingStatus): string {
  if (status === "watching") return "watching";
  if (status === "completed") return "completed";
  if (status === "planned") return "planned";
  return "paused";
}

function computeProgress(record: AnimeStatusRecord) {
  const a = record.anime;
  if (!a || !a.episodes) return null;
  const cur = record.watchedEpisodes ?? 0;
  const total = a.episodes;
  const pct = Math.max(0, Math.min(100, Math.round((cur / total) * 100)));
  return { cur, total, pct };
}

export function WatchlistClientV2({
  initialItems,
}: {
  initialItems: AnimeStatusRecord[];
}) {
  const [items, setItems] = useState<AnimeStatusRecord[]>(
    () => initialItems.filter((i) => i.anime)
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const sections = useMemo(() => {
    if (filter !== "all") return null;
    const buckets: Record<string, AnimeStatusRecord[]> = {
      watching: [],
      planned: [],
      completed: [],
      "paused-dropped": [],
    };
    for (const r of filteredItems) {
      if (r.status === "watching") buckets.watching.push(r);
      else if (r.status === "planned") buckets.planned.push(r);
      else if (r.status === "completed") buckets.completed.push(r);
      else buckets["paused-dropped"].push(r);
    }
    return SECTION_DEFS.map((def) => ({
      ...def,
      items: buckets[def.status],
    })).filter((s) => s.items.length > 0);
  }, [filteredItems, filter]);

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
  async function changeStatus(record: AnimeStatusRecord, next: ViewingStatus) {
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
  }

  async function saveTracking(record: AnimeStatusRecord) {
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
      status: draftStatus, // sync in case
    };

    setItems((recs) =>
      recs.map((r) => (r.animeId === record.animeId ? nextRecord : r))
    );
    setSavingId(record.animeId);

    try {
      // If status changed from original, commit it too
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
  }

  async function removeItem(record: AnimeStatusRecord) {
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
  }

  async function createShare() {
    setSharing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/watchlist/shares", { method: "POST" });
      const payload = (await res.json()) as { shareId?: string; error?: string };
      if (!res.ok || !payload.shareId) {
        throw new Error(payload.error ?? "共有URLの作成に失敗しました。");
      }
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
  }

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

  const count = visibleItems.length;

  return (
    <div className="wl2-root">
      <header className="wl2-header">
        <div className="wl2-top">
          <div className="wl2-title">マイリスト</div>
          <div className="wl2-avatar" aria-hidden />
        </div>

        <div className="wl2-search">
          <span>🔍</span>
          <input
            type="text"
            placeholder="作品を検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wl2-filters" role="tablist" aria-label="フィルタ">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`wl2-fchip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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
        <div className={`notice ${messageKind}`} style={{ margin: "8px 12px" }}>
          {message}
        </div>
      ) : null}
      {shareUrl ? (
        <div className="notice success" style={{ margin: "0 12px 8px" }}>
          {shareOutcome === "copied" ? "共有URLをコピーしました:" : "共有URL:"}{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      ) : null}

      {count === 0 ? (
        <div className="wl2-empty">
          <h3>まだ作品がありません</h3>
          <p>作品を探して「見たい」や「視聴中」に追加しましょう。</p>
          <div style={{ marginTop: 12 }}>
            <Link className="command-button emphasis-button" href="/explore">
              作品を探す →
            </Link>
          </div>
        </div>
      ) : sections ? (
        sections.map((sec) => (
          <div key={sec.status}>
            <div className="wl2-sec">
              <h3>
                {sec.icon} {sec.title}
              </h3>
              <span style={{ fontSize: 11, color: "var(--wl2-muted)" }}>
                {sec.items.length}件
              </span>
            </div>
            <div className="wl2-lane">
              {sec.items.map((record) => (
                <PosterCard
                  key={record.animeId}
                  record={record}
                  onOpen={() => openSheet(record)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="wl2-grid">
          {filteredItems.map((record) => (
            <PosterCard
              key={record.animeId}
              record={record}
              onOpen={() => openSheet(record)}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}

function PosterCard({
  record,
  onOpen,
}: {
  record: AnimeStatusRecord;
  onOpen: () => void;
}) {
  const anime = record.anime!;
  const prog = computeProgress(record);
  const badge = getStatusBadgeClass(record.status);
  const label = statusLabels[record.status];

  return (
    <div className="wl2-poster" onClick={onOpen}>
      {anime.proxiedImageUrl ? (
        <div
          className="pic"
          style={{ backgroundImage: `url(${anime.proxiedImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <span className={`wl2-badge ${badge}`}>{label}</span>
          {prog && record.status === "watching" ? (
            <div className="wl2-meta">
              <div className="wl2-ptitle">{anime.title}</div>
              <div className="wl2-prog">
                <div className="wl2-bar">
                  <i style={{ width: `${prog.pct}%` }} />
                </div>
                <div className="wl2-pnum">
                  {prog.cur} / {prog.total}話
                </div>
              </div>
            </div>
          ) : record.status === "completed" && prog ? (
            <div className="wl2-meta">
              <div className="wl2-ptitle">{anime.title}</div>
              <div className="wl2-prog">
                <div className="wl2-bar">
                  <i style={{ width: "100%" }} />
                </div>
                <div className="wl2-pnum">全{prog.total}話 視聴済</div>
              </div>
            </div>
          ) : (
            <div className="wl2-meta">
              <div className="wl2-ptitle">{anime.title}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="pic" style={{ background: "linear-gradient(135deg,#444,#222)" }}>
          <AnimeCardPlaceholder title={anime.title} />
          <span className={`wl2-badge ${badge}`} style={{ zIndex: 3 }}>{label}</span>
          <div className="wl2-meta">
            <div className="wl2-ptitle" style={{ textShadow: "none" }}>{anime.title}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditSheet({
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
    <div className="wl2-sheet-overlay" onClick={onClose}>
      <div className="wl2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wl2-sheet-head">
          <h3>{anime.title}</h3>
          <button className="wl2-close" onClick={onClose} aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        <div className="wl2-status-row">
          {(Object.keys(statusLabels) as ViewingStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`wl2-status-chip${draftStatus === s ? " active" : ""}`}
              onClick={() => onStatusChange(s)}
            >
              {statusLabels[s]}
            </button>
          ))}
        </div>

        <div className="wl2-stars" aria-label="お気に入り度">
          {[1, 2, 3, 4, 5].map((lv) => (
            <button
              key={lv}
              type="button"
              className={lv <= (draftFavorite ?? 0) ? "active" : ""}
              onClick={() => onFavoriteChange(draftFavorite === lv ? null : lv)}
            >
              <Star size={20} fill="currentColor" />
            </button>
          ))}
        </div>

        {totalEps != null ? (
          <div className="wl2-field">
            <label>視聴済み話数</label>
            <div className="wl2-episodes">
              <button type="button" onClick={dec} disabled={saving}>
                <Minus size={18} />
              </button>
              <span className="num">
                {curW} / {totalEps}
              </span>
              <button type="button" onClick={inc} disabled={saving}>
                <Plus size={18} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="wl2-field">
          <label>いつ見る？</label>
          <select
            className="wl2-select"
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

        <div className="wl2-field">
          <label>メモ</label>
          <textarea
            className="wl2-textarea"
            value={draftNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            maxLength={500}
            placeholder="メモを入力（500文字まで）"
          />
        </div>

        <div className="wl2-actions">
          <button
            type="button"
            className="wl2-btn primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? <Loader2 className="spin" size={16} /> : null}
            <span>{saving ? "保存中" : "保存する"}</span>
          </button>
          <button
            type="button"
            className="wl2-btn"
            onClick={() => {
              if (anime.siteUrl) window.open(anime.siteUrl, "_blank");
            }}
          >
            <ExternalLink size={16} style={{ marginRight: 4 }} /> 詳細
          </button>
        </div>

        <button
          type="button"
          className="wl2-btn danger"
          style={{ width: "100%", marginTop: 10 }}
          onClick={onRemove}
          disabled={saving}
        >
          <Trash2 size={16} style={{ marginRight: 6 }} /> 視聴解除（削除）
        </button>

        <div className="wl2-notice">変更は保存ボタンで確定します（ステータスは即時保存）。</div>
      </div>
    </div>
  );
}
