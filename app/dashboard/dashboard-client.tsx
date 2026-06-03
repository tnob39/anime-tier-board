"use client";

import Link from "next/link";
import type { DashboardData, ViewingStatus } from "@/lib/statuses";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "Plan",
  watching: "Watching",
  completed: "Done",
  paused: "Paused",
  dropped: "Dropped"
};

export function DashboardClient({ dashboard }: { dashboard: DashboardData }) {
  const maxStatus = Math.max(1, ...Object.values(dashboard.statusCounts));

  return (
    <main className="app-main dashboard-main">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Personal analytics</p>
          <h1>Anime Bias Dashboard</h1>
          <p>{dashboard.totalStatuses} saved viewing statuses.</p>
        </div>
        <Link className="command-button" href="/">
          Back to board
        </Link>
      </header>

      <section className="dashboard-grid">
        <article className="dashboard-panel status-panel">
          <h2>Viewing Status</h2>
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

        <RankPanel title="Genres" items={dashboard.topGenres} />
        <RankPanel title="Studios" items={dashboard.topStudios} />
        <RankPanel title="Voice Actors" items={dashboard.topVoiceActors} />
      </section>

      <section className="dashboard-panel recent-panel">
        <h2>Recent Updates</h2>
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
          <p className="comment-empty">Set viewing statuses on the board to build this dashboard.</p>
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
        <p className="comment-empty">No data yet.</p>
      )}
    </article>
  );
}
