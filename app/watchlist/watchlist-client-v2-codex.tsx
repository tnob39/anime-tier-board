"use client";

import { Check, Copy, Loader2, Search, Share2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { bucketBySeason } from "@/lib/season-bucket";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import "./watchlist-v2-codex.css";

type FilterKey = "all" | "watching" | "planned" | "completed" | "unwatched";

type Draft = Pick<
  AnimeStatusRecord,
  "status" | "favoriteLevel" | "watchSlot" | "notes" | "watchedEpisodes"
>;

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "保留",
  dropped: "中止"
};

const statusOptions: ViewingStatus[] = [
  "planned",
  "watching",
  "completed",
  "paused",
  "dropped"
];

const filterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "watching", label: "視聴中" },
  { key: "planned", label: "予定" },
  { key: "completed", label: "完了" },
  { key: "unwatched", label: "未視聴話あり" }
];

const watchSlotOptions = [
  "",
  "放送日に見る",
  "週末にまとめて見る",
  "配信されたら見る",
  "時間がある時に見る"
];

function hasUnwatchedEpisodes(record: AnimeStatusRecord) {
  const total = record.anime?.episodes ?? null;
  return record.status === "watching" && total != null && (record.watchedEpisodes ?? 0) < total;
}

function progressPercent(record: AnimeStatusRecord) {
  const total = record.anime?.episodes ?? null;
  if (!total || total <= 0) return record.status === "completed" ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round(((record.watchedEpisodes ?? 0) / total) * 100)));
}

function progressLabel(record: AnimeStatusRecord) {
  const total = record.anime?.episodes ?? null;
  const watched = record.watchedEpisodes ?? 0;
  if (record.status === "completed" && total) return `全${total}話 視聴済み`;
  if (total) return `${watched} / ${total}話`;
  if (watched > 0) return `${watched}話まで視聴`;
  return "進捗未設定";
}

function matchesFilter(record: AnimeStatusRecord, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "unwatched") return hasUnwatchedEpisodes(record);
  return record.status === filter;
}

function favoriteText(level: number | null) {
  if (!level) return "未評価";
  return "★".repeat(level) + "☆".repeat(5 - level);
}

function createDraft(record: AnimeStatusRecord): Draft {
  return {
    status: record.status,
    favoriteLevel: record.favoriteLevel,
    watchSlot: record.watchSlot,
    notes: record.notes,
    watchedEpisodes: record.watchedEpisodes
  };
}

export function WatchlistClientV2Codex({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<AnimeStatusRecord | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => item.anime)
        .filter((item) => item.anime!.title.toLowerCase().includes(query.trim().toLowerCase()))
        .filter((item) => matchesFilter(item, filter)),
    [filter, items, query]
  );

  // 期セクション（今期 / 来期 / その他）。通常版と共通の bucketBySeason を使用。
  // ステータスフィルタ（上部チップ）で絞った visibleItems を期で分割する。
  const seasonBuckets = useMemo(() => bucketBySeason(visibleItems), [visibleItems]);

  function showMessage(kind: "success" | "error", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  function openEditor(record: AnimeStatusRecord) {
    setEditing(record);
    setDraft(createDraft(record));
    setMessage(null);
  }

  function closeEditor() {
    setEditing(null);
    setDraft(null);
  }

  async function saveDraft() {
    if (!editing || !editing.anime || !draft) return;

    const previous = editing;
    const next = { ...editing, ...draft };
    setItems((records) =>
      records.map((record) => (record.animeId === editing.animeId ? next : record))
    );
    setEditing(next);
    setSavingId(editing.animeId);
    setMessage(null);

    try {
      if (draft.status !== previous.status) {
        const statusResponse = await fetch("/api/statuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId: previous.animeId,
            status: draft.status,
            anime: previous.anime
          })
        });

        if (!statusResponse.ok) {
          throw new Error("ステータスの保存に失敗しました。");
        }
      }

      const trackingResponse = await fetch("/api/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId: previous.animeId,
          favoriteLevel: draft.favoriteLevel,
          watchSlot: draft.watchSlot,
          notes: draft.notes,
          watchedEpisodes: draft.watchedEpisodes
        })
      });

      if (!trackingResponse.ok) {
        throw new Error("視聴管理の保存に失敗しました。");
      }

      showMessage("success", "保存しました。");
      closeEditor();
    } catch (error) {
      setItems((records) =>
        records.map((record) => (record.animeId === previous.animeId ? previous : record))
      );
      setEditing(previous);
      showMessage("error", error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(record: AnimeStatusRecord) {
    if (!record.anime) return;
    const confirmed = window.confirm(`「${record.anime.title}」をマイリストから削除しますか？`);
    if (!confirmed) return;

    const previous = items;
    setItems((records) => records.filter((item) => item.animeId !== record.animeId));
    setSavingId(record.animeId);
    setMessage(null);

    try {
      const response = await fetch(`/api/statuses?animeId=${encodeURIComponent(record.animeId)}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("削除に失敗しました。");
      showMessage("success", `「${record.anime.title}」を削除しました。`);
      if (editing?.animeId === record.animeId) closeEditor();
    } catch (error) {
      setItems(previous);
      showMessage("error", error instanceof Error ? error.message : "削除に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function createShare() {
    setSharing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/watchlist/shares", { method: "POST" });
      const payload = (await response.json()) as { shareId?: string; error?: string };
      if (!response.ok || !payload.shareId) {
        throw new Error(payload.error ?? "共有URLの作成に失敗しました。");
      }

      const nextShareUrl = `${window.location.origin}/watchlist/share/${payload.shareId}`;
      setShareUrl(nextShareUrl);
      const outcome = await shareOrCopyUrl({
        url: nextShareUrl,
        title: "マイリスト",
        text: "今追っているアニメをまとめました。"
      });
      setShareOutcome(outcome);
      showMessage("success", outcome === "copied" ? "共有URLをコピーしました。" : "共有URLを作成しました。");
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "共有URLの作成に失敗しました。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="wl2c-shell">
      <div className="wl2-vbadge wl2-vbadge--codex" role="status">Codex版</div>
      <header className="wl2c-header">
        <div className="wl2c-header-row">
          <div>
            <p className="wl2c-eyebrow">追っている作品</p>
            <h1>マイリスト</h1>
          </div>
          <button
            className="wl2c-icon-button"
            type="button"
            onClick={() => void createShare()}
            disabled={sharing || !items.length}
            aria-label="マイリストを共有"
          >
            {sharing ? <Loader2 className="spin" size={20} /> : <Share2 size={20} />}
          </button>
        </div>
        <label className="wl2c-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="作品を検索"
          />
        </label>
        <div className="wl2c-filters" aria-label="表示フィルター">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              className={filter === option.key ? "wl2c-filter is-active" : "wl2c-filter"}
              type="button"
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {message ? <div className={`wl2c-notice wl2c-${messageKind}`}>{message}</div> : null}
      {shareUrl ? (
        <div className="wl2c-notice wl2c-success">
          {shareOutcome === "copied" ? <Copy size={16} /> : <Check size={16} />}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      ) : null}

      {visibleItems.length ? (
        seasonBuckets.map((bucket) => (
          <section className="wl2c-section" key={bucket.key}>
            <div className="wl2c-section-heading">
              <h2>
                {bucket.label}
                {bucket.hint ? <span className="wl2c-section-hint">{bucket.hint}</span> : null}
              </h2>
              <span>{bucket.items.length}件</span>
            </div>
            <div className="wl2c-lane">
              {bucket.items.map((record) => (
                <PosterCard
                  key={record.animeId}
                  record={record}
                  saving={savingId === record.animeId}
                  onEdit={() => openEditor(record)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className="wl2c-empty">
          <h2>まだ作品がありません</h2>
          <p>気になる作品を探して、マイリストに追加しましょう。</p>
          <Link className="wl2c-primary-link" href="/explore">
            作品を探す
          </Link>
        </section>
      )}

      <section className="wl2c-section wl2c-recommend">
        <div className="wl2c-section-heading">
          <h2>あなたへのおすすめ</h2>
          <Link href="/explore">探す</Link>
        </div>
        <div className="wl2c-recommend-row">
          <Link href="/explore" className="wl2c-recommend-card">
            今期の注目作を探す
          </Link>
          <Link href="/voice-actors" className="wl2c-recommend-card">
            好きな声優から探す
          </Link>
        </div>
      </section>

      {editing && draft ? (
        <div className="wl2c-modal-backdrop" role="presentation" onClick={closeEditor}>
          <section
            className="wl2c-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`${editing.anime?.title ?? "作品"}を編集`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wl2c-editor-head">
              <div>
                <p>{statusLabels[editing.status]}</p>
                <h2>{editing.anime?.title}</h2>
              </div>
              <button type="button" className="wl2c-icon-button" onClick={closeEditor} aria-label="閉じる">
                <X size={20} />
              </button>
            </div>

            <label className="wl2c-field">
              <span>ステータス</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.currentTarget.value as ViewingStatus })
                }
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="wl2c-field">
              <span>お気に入り</span>
              <input
                type="range"
                min="0"
                max="5"
                value={draft.favoriteLevel ?? 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    favoriteLevel: Number(event.currentTarget.value) || null
                  })
                }
              />
              <small>{favoriteText(draft.favoriteLevel)}</small>
            </label>

            <label className="wl2c-field">
              <span>視聴済み話数</span>
              <input
                type="number"
                min="0"
                max={editing.anime?.episodes ?? undefined}
                value={draft.watchedEpisodes ?? 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    watchedEpisodes: Math.max(0, Number(event.currentTarget.value) || 0)
                  })
                }
              />
            </label>

            <label className="wl2c-field">
              <span>いつ見る</span>
              <select
                value={draft.watchSlot ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, watchSlot: event.currentTarget.value || null })
                }
              >
                {watchSlotOptions.map((option) => (
                  <option key={option || "none"} value={option}>
                    {option || "未設定"}
                  </option>
                ))}
              </select>
            </label>

            <label className="wl2c-field">
              <span>メモ</span>
              <textarea
                maxLength={500}
                value={draft.notes ?? ""}
                onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })}
              />
            </label>

            <div className="wl2c-editor-actions">
              <button
                type="button"
                className="wl2c-danger"
                onClick={() => void removeItem(editing)}
                disabled={savingId === editing.animeId}
              >
                <Trash2 size={18} />
                削除
              </button>
              <button
                type="button"
                className="wl2c-save"
                onClick={() => void saveDraft()}
                disabled={savingId === editing.animeId}
              >
                {savingId === editing.animeId ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                保存する
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PosterCard({
  record,
  saving,
  onEdit
}: {
  record: AnimeStatusRecord;
  saving: boolean;
  onEdit: () => void;
}) {
  const anime = record.anime;
  if (!anime) return null;

  return (
    <button className="wl2c-poster" type="button" onClick={onEdit}>
      <div className="wl2c-poster-image">
        {anime.proxiedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anime.proxiedImageUrl} alt="" loading="lazy" />
        ) : (
          <AnimeCardPlaceholder title={anime.title} className="wl2c-placeholder" />
        )}
        <span className={`wl2c-badge wl2c-badge-${record.status}`}>{statusLabels[record.status]}</span>
        {saving ? (
          <span className="wl2c-saving">
            <Loader2 className="spin" size={16} />
          </span>
        ) : null}
        <div className="wl2c-poster-meta">
          <h3>{anime.title}</h3>
          {record.status === "watching" || record.status === "completed" ? (
            <div className="wl2c-progress">
              <div>
                <i style={{ width: `${progressPercent(record)}%` }} />
              </div>
              <span>{progressLabel(record)}</span>
            </div>
          ) : (
            <span className="wl2c-card-note">{record.watchSlot || favoriteText(record.favoriteLevel)}</span>
          )}
        </div>
      </div>
    </button>
  );
}
