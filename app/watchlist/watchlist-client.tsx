"use client";

import { CalendarDays, ExternalLink, Loader2, MoreVertical, Share2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EvangelistCreateModal } from "@/components/EvangelistCreateModal";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

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

const BROADCAST_WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
type BroadcastWeekday = (typeof BROADCAST_WEEKDAYS)[number];

type TrackingDraft = Pick<
  AnimeStatusRecord,
  "status" | "favoriteLevel" | "watchSlot" | "notes"
>;

type SaveResult = {
  ok: boolean;
  message: string;
};

export function WatchlistClient({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const [evangelistAnime, setEvangelistAnime] = useState<AnimeItem | null>(null);
  const [evangelistShareUrl, setEvangelistShareUrl] = useState<string | null>(null);
  const visibleItems = useMemo(() => items.filter((item) => item.anime), [items]);
  const broadcastCalendar = useMemo(() => groupItemsByBroadcastDay(visibleItems), [visibleItems]);

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
      await navigator.clipboard?.writeText(nextShareUrl);
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
          <Link className="command-button" href="/">
            Tier表に戻る
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

      <section className="watchlist-guide">
        <div>
          <h2>ここで管理すること</h2>
          <p>
            Tier表とは分けて、追っている作品の「いつ見るか」「どれくらい楽しみか」
            「放送/配信の目安」をまとめます。
          </p>
        </div>
        <div className="watchlist-guide-grid">
          <span>お気に入り度</span>
          <span>視聴タイミング</span>
          <span>メモ</span>
          <span>放送・次回・クール</span>
        </div>
      </section>

      {visibleItems.length ? (
        <WeeklyBroadcastCalendar grouped={broadcastCalendar.grouped} />
      ) : null}

      {message ? <div className={`notice ${messageKind}`}>{message}</div> : null}
      {shareUrl ? (
        <div className="notice success">
          共有URLをコピーしました:{" "}
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
        <section className="watchlist-grid" aria-label="追ってる作品リスト">
          {visibleItems.map((record) =>
            record.anime ? (
              <WatchlistCard
                key={record.animeId}
                record={record}
                saving={savingId === record.animeId}
                onUpdate={(patch) => void updateItem(record.animeId, patch)}
                onStatusChange={(status) => void updateStatus(record, status)}
                onSave={(draft) => saveTrackingDraft(record, draft)}
                onCreateEvangelistCard={() => setEvangelistAnime(record.anime as AnimeItem)}
              />
            ) : null
          )}
        </section>
      ) : (
        <section className="watchlist-empty">
          <h2>まだ追ってる作品がありません</h2>
          <p>Tier表で作品にStatusを付けると、このページに表示されます。</p>
          <Link className="command-button emphasis-button" href="/">
            Tier表でStatusを付ける
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
  onCreateEvangelistCard
}: {
  record: AnimeStatusRecord;
  saving: boolean;
  onUpdate: (
    patch: Partial<Pick<AnimeStatusRecord, "favoriteLevel" | "watchSlot" | "notes">>
  ) => void;
  onStatusChange: (status: ViewingStatus) => void;
  onSave: (draft: TrackingDraft) => Promise<SaveResult>;
  onCreateEvangelistCard: () => void;
}) {
  const anime = record.anime as AnimeItem;
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(record.status);
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
      <img src={anime.proxiedImageUrl} alt={anime.title} />
      <div className="watchlist-card-body">
        <div className="watchlist-card-heading">
          <div>
            <strong>{anime.title}</strong>
            <span>{statusLabels[draftStatus]}</span>
          </div>
          <div className="watchlist-card-actions">
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
                    布教カードを作る
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <StatusChips status={draftStatus} onChange={setDraftStatus} />

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

function WeeklyBroadcastCalendar({
  grouped
}: {
  grouped: Record<BroadcastWeekday, AnimeStatusRecord[]>;
}) {
  return (
    <section className="watchlist-weekly-calendar" aria-label="今週の放映カレンダー">
      <h2>今週の放映カレンダー</h2>
      <div className="watchlist-weekly-calendar-grid">
        {BROADCAST_WEEKDAYS.map((day) => (
          <div key={day} className="watchlist-weekly-calendar-column">
            <h3>{day}</h3>
            {grouped[day].length ? (
              <ul>
                {grouped[day].map((record) => (
                  <li key={record.animeId}>{record.anime?.title}</li>
                ))}
              </ul>
            ) : (
              <p className="watchlist-weekly-calendar-empty">—</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function groupItemsByBroadcastDay(items: AnimeStatusRecord[]) {
  const grouped = Object.fromEntries(
    BROADCAST_WEEKDAYS.map((day) => [day, [] as AnimeStatusRecord[]])
  ) as Record<BroadcastWeekday, AnimeStatusRecord[]>;

  for (const record of items) {
    if (!record.anime) {
      continue;
    }

    const day = getBroadcastDayLabel(record.anime);
    if (day && grouped[day]) {
      grouped[day].push(record);
    }
  }

  return { grouped };
}

function getBroadcastDayLabel(item: AnimeItem): BroadcastWeekday | null {
  const nextAiring = item.airing?.nextEpisode?.airingAt;
  if (nextAiring) {
    const weekday = extractWeekdayLabel(nextAiring);
    if (weekday) {
      return weekday;
    }
  }

  const broadcastDay = normalizeBroadcastDay(item.airing?.broadcastDay);
  if (broadcastDay && BROADCAST_WEEKDAYS.includes(broadcastDay as BroadcastWeekday)) {
    return broadcastDay as BroadcastWeekday;
  }

  return null;
}

function extractWeekdayLabel(value: string): BroadcastWeekday | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const labels: BroadcastWeekday[] = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[date.getDay()] ?? null;
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

  const providerLink = anime.streamingProvidersJp?.providerLink;

  return (
    <div className="watchlist-streaming-chips">
      {providers.map((provider) =>
        provider.logoUrl ? (
          <span key={provider.id} className="watchlist-streaming-chip" title={provider.name}>
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
          <span key={provider.id} className="watchlist-streaming-chip watchlist-streaming-chip-text">
            {provider.name}
          </span>
        )
      )}
      {providerLink ? (
        <a
          className="watchlist-streaming-chip watchlist-streaming-chip-more"
          href={providerLink}
          target="_blank"
          rel="noreferrer"
          title="配信情報を詳しく見る"
        >
          <ExternalLink size={11} />
        </a>
      ) : null}
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

function normalizeBroadcastDay(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  const days: Record<string, string> = {
    monday: "月",
    mondays: "月",
    tuesday: "火",
    tuesdays: "火",
    wednesday: "水",
    wednesdays: "水",
    thursday: "木",
    thursdays: "木",
    friday: "金",
    fridays: "金",
    saturday: "土",
    saturdays: "土",
    sunday: "日",
    sundays: "日"
  };

  return days[normalized] ?? value;
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
