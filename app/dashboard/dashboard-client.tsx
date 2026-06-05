"use client";

import Link from "next/link";
import type { DashboardData, ViewingStatus } from "@/lib/statuses";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function DashboardClient({ dashboard }: { dashboard: DashboardData }) {
  const maxStatus = Math.max(1, ...Object.values(dashboard.statusCounts));
  const hasData = dashboard.totalStatuses > 0;

  return (
    <main className="app-main dashboard-main">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">集計</p>
          <h1>好み分析ダッシュボード</h1>
          <p>{dashboard.totalStatuses}件の視聴ステータスを保存中</p>
        </div>
        <Link className="command-button" href="/">
          ボードに戻る
        </Link>
      </header>

      <section className="dashboard-tutorial" aria-label="ダッシュボードの使い方">
        <div>
          <p className="eyebrow">使い方</p>
          <h2>ステータスを付けると、好みの偏りが見えるようになります</h2>
          <p>
            ダッシュボードは、ボード上で保存した視聴ステータスをもとに、
            ジャンル・制作会社・声優の傾向を集計します。
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
            <strong>3. ダッシュボードを見る</strong>
            <span>保存した作品から、ステータス数と好みの偏りが集計されます。</span>
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

      <section className="dashboard-grid">
        <article className="dashboard-panel status-panel">
          <h2>視聴ステータス</h2>
          <div className="status-bars">
            {(Object.keys(statusLabels) as ViewingStatus[]).map((status) => (
              <div key={status} className="status-bar-row">
                <span>{statusLabels[status]}</span>
                <div>
                  <i style={{ width: `${(dashboard.statusCounts[status] / maxStatus) * 100}%` }} />
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
