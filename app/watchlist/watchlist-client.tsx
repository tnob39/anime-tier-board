"use client";

import { CalendarDays, Copy, ExternalLink, Loader2, MoreVertical, Share2, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { EvangelistCreateModal } from "@/components/EvangelistCreateModal";
import { WeeklyBroadcastCalendar } from "@/components/WeeklyBroadcastCalendar";
import { groupItemsByBroadcastDay, normalizeBroadcastDay, withFreshAiring } from "@/lib/broadcast-calendar";
import { bucketBySeason } from "@/lib/season-bucket";
import { searchUrlFromProviderId } from "@/lib/service-search";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import { type AnimeItem } from "@/lib/types";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

const watchSlotOptions = [
  "",
  "放送日に見る",
  "週末にまとめて見る",
  "配信されたら見る",
  "時間がある時に見る"
];

type TrackingDraft = Pick<
  AnimeStatusRecord,
  "status" | "favoriteLevel" | "watchSlot" | "notes"
>;

type SaveResult = {
  ok: boolean;
  message: string;
};

export function WatchlistClient({
  initialItems,
  initialSeasonalAnime
}: {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const [evangelistAnime, setEvangelistAnime] = useState<AnimeItem | null>(null);
  const [evangelistShareUrl, setEvangelistShareUrl] = useState<string | null>(null);
  const visibleItems = useMemo(() => items.filter((item) => item.anime), [items]);
  // 保存時スナップショットの airing は陳腐化する(次回放送日が過去になる)ため、
  // 取得済みの今期データから最新へ差し替えてからカレンダー判定する（ホームと共通）。
  const calendarItems = useMemo(
    () =>
      withFreshAiring(
        visibleItems.filter(
          (item) => item.status === "watching" || item.status === "planned"
        ),
        initialSeasonalAnime
      ),
    [visibleItems, initialSeasonalAnime]
  );
  const broadcastCalendar = useMemo(() => groupItemsByBroadcastDay(calendarItems), [calendarItems]);
  const seasonBuckets = useMemo(() => bucketBySeason(visibleItems), [visibleItems]);

  async function updateItem(
    animeId: string,
    patch: Partial<Pick<AnimeStatusRecord, "favoriteLevel" | "watchSlot" | "notes">>
  ) {
    const current = items.find((item) => item.animeId === animeId);
    if (!current) {
      return;
    }

    const next = { ...current, ...patch };
    setItems((records) =>
      records.map((record) => (record.animeId === animeId ? next : record))
    );
    setSavingId(animeId);
    setMessage(null);

    try {
      const response = await fetch("/api/watchlist", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          animeId,
          favoriteLevel: next.favoriteLevel,
          watchSlot: next.watchSlot,
          notes: next.notes
        })
      });

      if (!response.ok) {
        throw new Error("保存に失敗しました。");
      }
    } catch (error) {
      setItems((records) =>
        records.map((record) => (record.animeId === animeId ? current : record))
      );
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function updateStatus(record: AnimeStatusRecord, status: ViewingStatus) {
    if (!record.anime) {
      return;
    }

    const current = record;
    const next = { ...record, status };
    setItems((records) =>
      records.map((item) => (item.animeId === record.animeId ? next : item))
    );
    setSavingId(record.animeId);
    setMessage(null);

    try {
      const response = await fetch("/api/statuses", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          animeId: record.animeId,
          status,
          anime: record.anime
        })
      });

      if (!response.ok) {
        throw new Error("ステータス保存に失敗しました。");
      }
    } catch (error) {
      setItems((records) =>
        records.map((item) => (item.animeId === record.animeId ? current : item))
      );
      setMessage(error instanceof Error ? error.message : "ステータス保存に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function saveTrackingDraft(
    record: AnimeStatusRecord,
    draft: TrackingDraft
  ): Promise<SaveResult> {
    if (!record.anime) {
      return { ok: false, message: "作品情報が見つかりません。" };
    }

    const current = record;
    const next = { ...record, ...draft };
    setItems((records) =>
      records.map((item) => (item.animeId === record.animeId ? next : item))
    );
    setSavingId(record.animeId);
    setMessage(null);

    try {
      if (draft.status !== record.status) {
        const statusResponse = await fetch("/api/statuses", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            animeId: record.animeId,
            status: draft.status,
            anime: record.anime
          })
        });

        if (!statusResponse.ok) {
          throw new Error("ステータス保存に失敗しました。");
        }
      }

      const trackingResponse = await fetch("/api/watchlist", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          animeId: record.animeId,
          favoriteLevel: draft.favoriteLevel,
          watchSlot: draft.watchSlot,
          notes: draft.notes
        })
      });

      if (!trackingResponse.ok) {
        throw new Error("視聴管理の保存に失敗しました。");
      }

      setMessageKind("success");
      setMessage("保存しました。同じGoogleアカウントで別端末から確認できます。");
      return { ok: true, message: "保存済み" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "視聴管理の保存に失敗しました。";
      setItems((records) =>
        records.map((item) => (item.animeId === record.animeId ? current : item))
      );
      setMessageKind("error");
      setMessage(errorMessage);
      return { ok: false, message: errorMessage };
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(record: AnimeStatusRecord) {
    if (!record.anime) {
      return;
    }

    const confirmed = window.confirm(`「${record.anime.title}」を視聴リストから削除しますか？`);
    if (!confirmed) {
      return;
    }

    const previous = items;
    setItems((records) => records.filter((item) => item.animeId !== record.animeId));
    setSavingId(record.animeId);
    setMessage(null);

    try {
      const response = await fetch(`/api/statuses?animeId=${encodeURIComponent(record.animeId)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("削除に失敗しました。");
      }

      setMessageKind("success");
      setMessage(`「${record.anime.title}」を視聴リストから削除しました。`);
    } catch (error) {
      setItems(previous);
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "削除に失敗しました。");
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
        title: "私の視聴管理リスト",
        text: "今追ってるアニメをまとめました"
      });
      setShareOutcome(outcome);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "共有URLの作成に失敗しました。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="app-main watchlist-main">
      <header className="watchlist-header">
        <div>
          <p className="eyebrow">追ってる作品</p>
          <h1>視聴管理リスト</h1>
          <p>{visibleItems.length}件を管理中</p>
        </div>
        <div className="watchlist-actions">
          <Link className="command-button" href="/tier">
            Tier表へ
          </Link>
          <button
            className="command-button emphasis-button"
            type="button"
            onClick={() => void createShare()}
            disabled={sharing || !visibleItems.length}
          >
            {sharing ? <Loader2 className="spin" size={18} /> : <Share2 size={18} />}
            <span>共有</span>
          </button>
        </div>
      </header>

      {visibleItems.length ? (
        <WeeklyBroadcastCalendar grouped={broadcastCalendar} />
      ) : null}

      {message ? <div className={`notice ${messageKind}`}>{message}</div> : null}
      {shareUrl ? (
        <div className="notice success">
          {shareOutcome === "copied" ? "共有URLをコピーしました:" : "共有URL:"}{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      ) : null}
      {evangelistShareUrl ? (
        <div className="notice success">
          布教カードのURLをコピーしました:{" "}
          <a href={evangelistShareUrl} target="_blank" rel="noreferrer">
            {evangelistShareUrl}
          </a>
        </div>
      ) : null}

      {visibleItems.length ? (
        seasonBuckets.map((bucket) => (
          <section
            key={bucket.key}
            className={`watchlist-season-section watchlist-season-${bucket.key}`}
            aria-label={bucket.label}
          >
            <header className="watchlist-season-header">
              <h2>{bucket.label}</h2>
              <span className="watchlist-season-count">{bucket.items.length}件</span>
              {bucket.hint ? (
                <span className="watchlist-season-hint">{bucket.hint}</span>
              ) : null}
            </header>
            <div className="watchlist-grid">
              {bucket.items.map((record) =>
                record.anime ? (
                  <WatchlistCard
                    key={record.animeId}
                    record={record}
                    saving={savingId === record.animeId}
                    onUpdate={(patch) => void updateItem(record.animeId, patch)}
                    onStatusChange={(status) => void updateStatus(record, status)}
                    onSave={(draft) => saveTrackingDraft(record, draft)}
                    onCreateEvangelistCard={() => setEvangelistAnime(record.anime as AnimeItem)}
                    onRemove={() => void removeItem(record)}
                  />
                ) : null
              )}
            </div>
          </section>
        ))
      ) : (
        <section className="watchlist-empty">
          <h2>まだ視聴中のアニメがありません</h2>
          <p>今期アニメをチェックして、視聴したい作品を登録しよう。</p>
          <Link className="command-button emphasis-button" href="/explore">
            作品を探す →
          </Link>
        </section>
      )}

      {evangelistAnime ? (
        <EvangelistCreateModal
          anime={evangelistAnime}
          open={Boolean(evangelistAnime)}
          onClose={() => setEvangelistAnime(null)}
          onCreated={(url) => {
            setEvangelistShareUrl(url);
            setMessageKind("success");
            setMessage("布教カードを作成しました。URLをコピー済みです。");
          }}
        />
      ) : null}
    </main>
  );
}

function WatchlistCard({
  record,
  saving,
  onUpdate,
  onStatusChange,
  onSave,
  onCreateEvangelistCard,
  onRemove,
}: {
  record: AnimeStatusRecord;
  saving: boolean;
  onUpdate: (
    patch: Partial<Pick<AnimeStatusRecord, "favoriteLevel" | "watchSlot" | "notes">>
  ) => void;
  onStatusChange: (status: ViewingStatus) => void;
  onSave: (draft: TrackingDraft) => Promise<SaveResult>;
  onCreateEvangelistCard: () => void;
  onRemove: () => void;
}) {
  const anime = record.anime as AnimeItem;
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(record.status);

  function handleStatusChange(status: ViewingStatus) {
    setDraftStatus(status);
  }
  const [draftFavoriteLevel, setDraftFavoriteLevel] = useState(record.favoriteLevel);
  const [draftWatchSlot, setDraftWatchSlot] = useState(record.watchSlot ?? "");
  const [draftNotes, setDraftNotes] = useState(record.notes ?? "");
  const [lastSaveResult, setLastSaveResult] = useState<SaveResult | null>(null);
  const schedule = getScheduleText(anime);
  const nextEpisode = getNextEpisodeText(anime);
  const cour = anime.airing?.courEstimate ?? estimateCourFromEpisodes(anime.episodes);
  const streamingLink = anime.streamingEpisodes?.find((episode) => episode.url);

  useEffect(() => {
    setDraftStatus(record.status);
    setDraftFavoriteLevel(record.favoriteLevel);
    setDraftWatchSlot(record.watchSlot ?? "");
    setDraftNotes(record.notes ?? "");
  }, [record.favoriteLevel, record.notes, record.status, record.watchSlot]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".watchlist-card-menu")) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  const isDirty =
    draftStatus !== record.status ||
    draftFavoriteLevel !== record.favoriteLevel ||
    draftWatchSlot !== (record.watchSlot ?? "") ||
    draftNotes !== (record.notes ?? "");

  useEffect(() => {
    if (isDirty) {
      setLastSaveResult(null);
    }
  }, [isDirty]);

  const saveStatus = saving
    ? "保存中..."
    : isDirty
      ? "未保存の変更があります"
      : lastSaveResult?.message ?? "保存済み";
  const saveStatusClass = saving
    ? "is-saving"
    : isDirty
      ? "is-dirty"
      : lastSaveResult?.ok === false
        ? "is-error"
        : "is-saved";

  async function handleSave() {
    const result = await onSave({
      status: draftStatus,
      favoriteLevel: draftFavoriteLevel,
      watchSlot: draftWatchSlot || null,
      notes: draftNotes || null
    });
    setLastSaveResult(result);
  }

  return (
    <article className="watchlist-card">
      {anime.proxiedImageUrl ? (
        <img src={anime.proxiedImageUrl} alt={anime.title} />
      ) : (
        <AnimeCardPlaceholder title={anime.title} />
      )}
      <div className="watchlist-card-body">
        <div className="watchlist-card-heading">
          <div>
            <strong>{anime.title}</strong>
            <span>{statusLabels[draftStatus]}</span>
          </div>
          <div className="watchlist-card-actions">
            <button
              type="button"
              className="watchlist-card-share-btn"
              aria-label="布教カードを作ってシェア"
              title="布教カードを作ってシェア"
              onClick={onCreateEvangelistCard}
            >
              <Share2 size={16} />
            </button>
            <a href={anime.siteUrl} target="_blank" rel="noreferrer" aria-label="作品ページを開く">
              <ExternalLink size={16} />
            </a>
            <div className="watchlist-card-menu">
              <button
                type="button"
                className="watchlist-card-menu-trigger"
                aria-label="メニューを開く"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen ? (
                <div className="watchlist-card-menu-panel" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onCreateEvangelistCard();
                    }}
                  >
                    <Share2 size={14} />
                    <span>布教カードを作る</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="watchlist-card-menu-item-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onRemove();
                    }}
                  >
                    <Trash2 size={14} />
                    <span>視聴解除（リストから削除）</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <StatusChips status={draftStatus} onChange={handleStatusChange} />

        <div className="watchlist-favorite" aria-label="お気に入り度">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              className={level <= (draftFavoriteLevel ?? 0) ? "is-active" : ""}
              onClick={() => setDraftFavoriteLevel(draftFavoriteLevel === level ? null : level)}
              title={`${level}`}
            >
              <Star size={18} fill="currentColor" />
            </button>
          ))}
          {saving ? <Loader2 className="spin" size={15} /> : null}
        </div>

        <div className="watchlist-info">
          {schedule ? <InfoPill label="放送" value={schedule} /> : null}
          {nextEpisode ? <InfoPill label="次回" value={nextEpisode} /> : null}
          {cour ? <InfoPill label="クール" value={cour} /> : null}
          {streamingLink ? (
            <a
              className="watchlist-stream-link"
              href={streamingLink.url}
              target="_blank"
              rel="noreferrer"
            >
              配信を見る
            </a>
          ) : null}
        </div>

        <StreamingProviderChips anime={anime} />

        <label className="watchlist-field">
          <span>いつ見る？</span>
          <select
            value={draftWatchSlot}
            onChange={(event) => setDraftWatchSlot(event.target.value)}
          >
            {watchSlotOptions.map((option) => (
              <option key={option || "empty"} value={option}>
                {option || "未設定"}
              </option>
            ))}
          </select>
        </label>

        <label className="watchlist-field">
          <span>メモ</span>
          <textarea
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.target.value)}
            placeholder="例: 週末に2話まとめて見る"
            maxLength={500}
          />
        </label>
        <button
          className="command-button emphasis-button watchlist-save-button"
          type="button"
          disabled={!isDirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="spin" size={16} /> : null}
          <span>{saving ? "保存中" : isDirty ? "保存する" : "保存済み"}</span>
        </button>
        <p className={`watchlist-save-status ${saveStatusClass}`} aria-live="polite">
          {saveStatus}
        </p>
      </div>
    </article>
  );
}

function StatusChips({
  status,
  onChange
}: {
  status: ViewingStatus;
  onChange: (status: ViewingStatus) => void;
}) {
  return (
    <div className="status-chip-group watchlist-status-chips" aria-label="視聴ステータス">
      {(Object.keys(statusLabels) as ViewingStatus[]).map((option) => (
        <button
          key={option}
          className={status === option ? "status-chip is-active" : "status-chip"}
          type="button"
          onClick={() => onChange(option)}
        >
          {statusLabels[option]}
        </button>
      ))}
    </div>
  );
}

function StreamingProviderChips({ anime }: { anime: AnimeItem }) {
  const providers = anime.streamingProvidersJp?.flatrate;
  if (!providers?.length) return null;

  const [copied, setCopied] = useState(false);

  function copyTitle() {
    navigator.clipboard.writeText(anime.title).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="watchlist-streaming-chips">
      {providers.map((provider) => {
        const searchUrl = searchUrlFromProviderId(provider.id, anime.title);
        const chip = provider.logoUrl ? (
          <span className="watchlist-streaming-chip" title={`${provider.name}で検索`}>
            <img
              src={provider.logoUrl}
              alt={provider.name}
              width={20}
              height={20}
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const text = document.createElement("span");
                text.textContent = provider.name.slice(0, 2);
                text.style.cssText = "font-size:8px;font-weight:700;color:var(--muted)";
                el.parentElement?.appendChild(text);
              }}
            />
          </span>
        ) : (
          <span className="watchlist-streaming-chip watchlist-streaming-chip-text">
            {provider.name}
          </span>
        );
        return searchUrl ? (
          <a
            key={provider.id}
            className="watchlist-streaming-chip-link"
            href={searchUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${provider.name}で「${anime.title}」を検索`}
          >
            {chip}
          </a>
        ) : (
          <span key={provider.id}>{chip}</span>
        );
      })}
      <button
        type="button"
        className={`watchlist-title-copy${copied ? " is-copied" : ""}`}
        onClick={copyTitle}
        aria-label="タイトルをコピー"
        title="タイトルをコピーしてサービス内で検索"
      >
        <Copy size={10} />
        <span className="copy-label">{copied ? "コピー済" : "タイトルをコピー"}</span>
      </button>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="watchlist-info-pill">
      <CalendarDays size={12} />
      <b>{label}</b>
      {value}
    </span>
  );
}

function getScheduleText(item: AnimeItem): string | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
    const weekdayTime = formatWeekdayTime(nextAiring);
    return weekdayTime ? `毎週${weekdayTime}` : null;
  }

  const day = normalizeBroadcastDay(item.airing?.broadcastDay);
  const time = item.airing?.broadcastTime ? normalizeTime(item.airing.broadcastTime) : null;
  if (day && time) {
    return `毎週${day} ${time}`;
  }
  if (day) {
    return `毎週${day}`;
  }
  if (item.airing?.broadcastText) {
    return item.airing.broadcastText;
  }

  return null;
}

function getNextEpisodeText(item: AnimeItem): string | null {
  const nextEpisode = item.airing?.nextEpisode;
  if (!nextEpisode) {
    return null;
  }

  const weekdayTime = formatWeekdayTime(nextEpisode.airingAt);
  return weekdayTime ? `#${nextEpisode.episode} ${weekdayTime}` : `#${nextEpisode.episode}`;
}

function formatWeekdayTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeTime(value: string): string {
  return value.replace(/^(\d):/, "0$1:");
}

function estimateCourFromEpisodes(episodes?: number | null): string | null {
  if (typeof episodes !== "number" || episodes <= 0) {
    return null;
  }
  if (episodes <= 13) {
    return "1クール";
  }
  if (episodes <= 26) {
    return "2クール";
  }
  if (episodes <= 39) {
    return "3クール";
  }
  return "4クール以上";
}
