"use client";

import { CalendarDays, ExternalLink, Loader2, Share2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export function WatchlistClient({ initialItems }: { initialItems: AnimeStatusRecord[] }) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visibleItems = useMemo(() => items.filter((item) => item.anime), [items]);

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

      {message ? <div className="notice error">{message}</div> : null}
      {shareUrl ? (
        <div className="notice success">
          共有URLをコピーしました:{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
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
    </main>
  );
}

function WatchlistCard({
  record,
  saving,
  onUpdate
}: {
  record: AnimeStatusRecord;
  saving: boolean;
  onUpdate: (
    patch: Partial<Pick<AnimeStatusRecord, "favoriteLevel" | "watchSlot" | "notes">>
  ) => void;
}) {
  const anime = record.anime as AnimeItem;
  const [draftNotes, setDraftNotes] = useState(record.notes ?? "");
  const schedule = getScheduleText(anime);
  const nextEpisode = getNextEpisodeText(anime);
  const cour = anime.airing?.courEstimate ?? estimateCourFromEpisodes(anime.episodes);
  const streamingLink = anime.streamingEpisodes?.find((episode) => episode.url);

  useEffect(() => {
    setDraftNotes(record.notes ?? "");
  }, [record.notes]);

  return (
    <article className="watchlist-card">
      <img src={anime.proxiedImageUrl} alt={anime.title} />
      <div className="watchlist-card-body">
        <div className="watchlist-card-heading">
          <div>
            <strong>{anime.title}</strong>
            <span>{statusLabels[record.status]}</span>
          </div>
          <a href={anime.siteUrl} target="_blank" rel="noreferrer" aria-label="作品ページを開く">
            <ExternalLink size={16} />
          </a>
        </div>

        <div className="watchlist-favorite" aria-label="お気に入り度">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              className={level <= (record.favoriteLevel ?? 0) ? "is-active" : ""}
              onClick={() =>
                onUpdate({
                  favoriteLevel: record.favoriteLevel === level ? null : level
                })
              }
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

        <label className="watchlist-field">
          <span>いつ見る？</span>
          <select
            value={record.watchSlot ?? ""}
            onChange={(event) =>
              onUpdate({
                watchSlot: event.target.value || null
              })
            }
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
            onBlur={() => {
              if (draftNotes !== (record.notes ?? "")) {
                onUpdate({ notes: draftNotes });
              }
            }}
            placeholder="例: 週末に2話まとめて見る"
            maxLength={500}
          />
        </label>
      </div>
    </article>
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
