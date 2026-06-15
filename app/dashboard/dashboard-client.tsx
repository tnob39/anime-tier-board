"use client";

import { Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { DashboardData, ViewingStatus } from "@/lib/statuses";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function DashboardClient({
  dashboard,
  subscriptionCoverage,
  hasSubscriptions
}: {
  dashboard: DashboardData;
  subscriptionCoverage: number;
  hasSubscriptions: boolean;
}) {
  const maxStatus = Math.max(1, ...Object.values(dashboard.statusCounts));
  const hasData = dashboard.totalStatuses > 0;
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createShare() {
    setSharing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/dashboard/shares", { method: "POST" });
      const payload = (await response.json()) as { shareId?: string; error?: string };

      if (!response.ok || !payload.shareId) {
        throw new Error(payload.error ?? "共有URLの作成に失敗しました。");
      }

      const nextShareUrl = `${window.location.origin}/dashboard/share/${payload.shareId}`;
      setShareUrl(nextShareUrl);
      await navigator.clipboard?.writeText(nextShareUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "共有URLの作成に失敗しました。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="app-main dashboard-main">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">集計</p>
          <h1>好み分析ダッシュボード</h1>
          <p>{dashboard.totalStatuses}件の視聴ステータスを保存中</p>
        </div>
        <div className="dashboard-actions">
          <Link className="command-button" href="/voice-actors">
            声優
          </Link>
          <button
            className="icon-button nav-icon-link"
            type="button"
            onClick={() => void createShare()}
            disabled={sharing || !hasData}
            title="分析を共有"
            aria-label="分析を共有"
          >
            {sharing ? <Loader2 className="spin" size={18} /> : <Share2 size={18} />}
          </button>
        </div>
      </header>

      {message ? <div className="notice error">{message}</div> : null}
      {shareUrl ? (
        <div className="notice success">
          共有URLをコピーしました:{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      ) : null}

      {!hasData ? (
        <div className="tutorial-empty-callout">
          <strong>まだ集計データがありません</strong>
          <span>作品にステータスを付けると、ジャンル・声優の傾向が見えます。</span>
          <Link className="command-button emphasis-button" href="/watchlist">
            視聴管理へ
          </Link>
        </div>
      ) : null}

      <section className="dashboard-subscription-card" aria-label="サブスク診断サマリー">
        <div>
          <p className="eyebrow">サブスク</p>
          <h2>見放題カバー率 {hasSubscriptions ? `${subscriptionCoverage}%` : "未設定"}</h2>
          <p>
            {hasSubscriptions
              ? "ウォッチリストと加入中サービスを照合した結果です。"
              : "加入中のサブスクを登録するとカバー率を表示できます。"}
          </p>
        </div>
        <Link className="command-button emphasis-button" href="/subscriptions">
          サブスク診断を見る →
        </Link>
      </section>

      <DashboardSummary dashboard={dashboard} maxStatus={maxStatus} />
    </main>
  );
}

const GENRE_JA: Record<string, string> = {
  Action: "アクション",
  Adventure: "冒険",
  Comedy: "コメディ",
  Drama: "ドラマ",
  Fantasy: "ファンタジー",
  "Sci-Fi": "SF",
  "Sci-Fi Fantasy": "SF/ファンタジー",
  Mystery: "ミステリー",
  Horror: "ホラー",
  Romance: "ラブコメ",
  "Slice of Life": "日常",
  Sports: "スポーツ",
  Supernatural: "超自然",
  Ecchi: "エッチ",
  Mecha: "メカ",
  Music: "音楽",
  Psychological: "心理",
  Thriller: "スリラー",
  "Martial Arts": "武道",
  Military: "ミリタリー",
};

export function DashboardSummary({
  dashboard,
  maxStatus
}: {
  dashboard: DashboardData;
  maxStatus?: number;
}) {
  const safeMaxStatus = maxStatus ?? Math.max(1, ...Object.values(dashboard.statusCounts));

  return (
    <section className="dashboard-grid">
      <article className="dashboard-panel status-panel">
        <h2>視聴ステータス</h2>
        <div className="status-bars">
          {(Object.keys(statusLabels) as ViewingStatus[]).map((status) => (
            <div key={status} className="status-bar-row">
              <span>{statusLabels[status]}</span>
              <div>
                <i style={{ width: `${(dashboard.statusCounts[status] / safeMaxStatus) * 100}%` }} />
              </div>
              <strong>{dashboard.statusCounts[status]}</strong>
            </div>
          ))}
        </div>
      </article>

      <RankBarPanel
        title="ジャンル傾向"
        items={dashboard.topGenres.map((g) => ({ name: GENRE_JA[g.name] ?? g.name, count: g.count }))}
      />
      <RankBarPanel title="声優" items={dashboard.topVoiceActors} />
    </section>
  );
}

function RankBarPanel({
  title,
  items
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
}) {
  const top = items.slice(0, 6);
  const max = Math.max(1, ...top.map((i) => i.count));
  return (
    <article className="dashboard-panel rank-panel">
      <h2>{title}</h2>
      {top.length ? (
        <div className="status-bars">
          {top.map((item) => (
            <div key={item.name} className="status-bar-row">
              <span title={item.name}>{item.name}</span>
              <div>
                <i style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="comment-empty">データがまだありません。</p>
      )}
    </article>
  );
}
