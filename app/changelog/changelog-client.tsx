"use client";

import Link from "next/link";
import type { Release } from "./page";

const TYPE_LABELS: Record<Release["changes"][number]["type"], string> = {
  feat: "新機能",
  fix: "修正",
  perf: "改善",
  refactor: "リファクタ"
};

const TYPE_COLORS: Record<Release["changes"][number]["type"], string> = {
  feat: "changelog-tag-feat",
  fix: "changelog-tag-fix",
  perf: "changelog-tag-perf",
  refactor: "changelog-tag-refactor"
};

export function ChangelogClient({ releases }: { releases: Release[] }) {
  return (
    <main className="app-main changelog-main">
      <header className="changelog-header">
        <p className="eyebrow">アップデート</p>
        <h1>更新履歴</h1>
        <p>機能追加・改善・バグ修正の記録です。</p>
      </header>

      <div className="changelog-timeline">
        {releases.map((release, i) => (
          <article key={release.version} className="changelog-release">
            <div className="changelog-release-meta">
              <span className={`changelog-version ${i === 0 ? "is-latest" : ""}`}>
                v{release.version}
              </span>
              <time className="changelog-date" dateTime={release.date}>
                {release.date}
              </time>
            </div>

            <div className="changelog-release-body">
              <h2 className="changelog-release-title">{release.label}</h2>
              <ul className="changelog-changes">
                {release.changes.map((change) => (
                  <li key={change.title} className="changelog-change">
                    <span className={`changelog-tag ${TYPE_COLORS[change.type]}`}>
                      {TYPE_LABELS[change.type]}
                    </span>
                    <div className="changelog-change-content">
                      {change.href ? (
                        <Link className="changelog-change-title" href={change.href}>
                          {change.title}
                        </Link>
                      ) : (
                        <strong className="changelog-change-title">{change.title}</strong>
                      )}
                      <p>{change.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      <footer className="changelog-footer">
        <Link className="command-button" href="/dashboard">
          ダッシュボードへ戻る
        </Link>
      </footer>
    </main>
  );
}
