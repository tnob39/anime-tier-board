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
          <Link className="command-button" href="/">
            ボードに戻る
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

      <section className="dashboard-tutorial" aria-label="ダッシュボードの使い方">
        <div>
          <p className="eyebrow">使い方</p>
          <h2>ステータスを付けると、好みの偏りが見えるようになります</h2>
          <p>
            ダッシュボードは、ボード上で保存した視聴ステータスをもとに、
            ジャンル・制作会社・声優の傾向を集計します。共有すると、この集計結果にコメントをもらえます。
          </p>
        </div>
        <ol className="tutorial-steps">
          <li>
            <strong>1. ボードへ戻る</strong>
            <span>作品カードをタップ、またはクリックして移動メニューを開きます。</span>
          </li>
          <li>
            <strong>2. Statusを選ぶ</strong>
            <span>「見たい」「視聴中」「完了」などを選ぶとTursoへ保存されます。</span>
          </li>
          <li>
            <strong>3. 分析を共有する</strong>
            <span>右上の共有アイコンから、分析結果の共有URLを作成できます。</span>
          </li>
        </ol>
        {!hasData ? (
          <div className="tutorial-empty-callout">
            <strong>まだ集計データがありません</strong>
            <span>まずは数作品にStatusを付けてから戻ってください。</span>
            <Link className="command-button emphasis-button" href="/">
              ボードでStatusを付ける
            </Link>
          </div>
        ) : null}
      </section>

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

      <WhatsNewSection />

      <DashboardSummary dashboard={dashboard} maxStatus={maxStatus} />

      <section className="dashboard-panel recent-panel">
        <h2>最近更新した作品</h2>
        {dashboard.recent.length ? (
          <div className="recent-grid">
            {dashboard.recent.map((record) => (
              <article key={record.animeId} className="recent-card">
                {record.anime?.proxiedImageUrl ? (
                  <img src={record.anime.proxiedImageUrl} alt={record.anime.title} />
                ) : null}
                <div>
                  <strong>{record.anime?.title ?? record.animeId}</strong>
                  <span>{statusLabels[record.status]}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="comment-empty">ボードで作品にStatusを付けると、ここに反映されます。</p>
        )}
      </section>
    </main>
  );
}

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

      <RankPanel title="ジャンル傾向" items={dashboard.topGenres} />
      <RankPanel title="制作会社" items={dashboard.topStudios} />
      <RankPanel title="声優" items={dashboard.topVoiceActors} />
    </section>
  );
}

const WHATS_NEW = [
  {
    date: "2026-06-07",
    items: [
      {
        label: "サブスク最適化",
        description: "加入中のサービスとウォッチリストを照合し、見放題カバー率を表示。ナビの「サブスク」から確認できます。",
        href: "/subscriptions"
      },
      {
        label: "布教カード",
        description: "ウォッチリストの作品カード（⋮メニュー）から「布教カードを作る」で、おすすめコメント付きのシェア画像を作成できます。",
        href: "/watchlist"
      },
      {
        label: "オンボーディング",
        description: "初回ログイン時にサブスクサービスを登録する画面を追加しました。",
        href: "/onboarding"
      }
    ]
  }
] as const;

function WhatsNewSection() {
  return (
    <section className="dashboard-whats-new" aria-label="最新リリース">
      <header className="whats-new-header">
        <span className="whats-new-badge">NEW</span>
        <h2>最新リリース — {WHATS_NEW[0].date}</h2>
      </header>
      <ul className="whats-new-list">
        {WHATS_NEW[0].items.map((item) => (
          <li key={item.label} className="whats-new-item">
            <Link className="whats-new-title" href={item.href}>
              {item.label} →
            </Link>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
      <Link className="whats-new-history-link" href="/changelog">
        すべての更新履歴を見る →
      </Link>
    </section>
  );
}

function RankPanel({
  title,
  items
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
}) {
  return (
    <article className="dashboard-panel rank-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.name}>
              <span>{item.name}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="comment-empty">データがまだありません。</p>
      )}
    </article>
  );
}
