"use client";

import { ChevronDown, ChevronUp, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getServiceUrl } from "@/lib/streaming-services";
import type { AdditionalServiceEffect, ServiceCoverage, SubscriptionStats } from "@/lib/subscription-stats";

type SubscriptionsClientProps = {
  stats: SubscriptionStats;
  serviceIds: string[];
};

export function SubscriptionsClient({ stats, serviceIds }: SubscriptionsClientProps) {
  const [diagnosisMode, setDiagnosisMode] = useState(false);
  const hasSubscriptions = serviceIds.length > 0;

  return (
    <main className="app-main subscriptions-main">
      <header className="subscriptions-header">
        <div>
          <p className="eyebrow">サブスク最適化</p>
          <h1>{diagnosisMode ? "サブスク診断" : "今すぐ見れるもの"}</h1>
          <p>
            {stats.watchlistCount > 0
              ? `ウォッチリスト ${stats.watchlistCount}本`
              : "ウォッチリストに作品を追加すると診断できます。"}
          </p>
        </div>
        <div className="subscriptions-actions">
          <Link className="command-button" href="/settings">
            サブスク設定
          </Link>
          <Link className="command-button" href="/watchlist">
            ウォッチリスト
          </Link>
        </div>
      </header>

      {!hasSubscriptions ? (
        <section className="subscriptions-empty">
          <h2>加入中のサブスクが未登録です</h2>
          <p>まずは加入中のサービスを登録すると、見放題カバー率を計算できます。</p>
          <Link className="command-button emphasis-button" href="/settings">
            サブスクを登録する
          </Link>
        </section>
      ) : null}

      {stats.watchlistCount === 0 ? (
        <section className="subscriptions-empty">
          <h2>ウォッチリストが空です</h2>
          <p>Tier表で作品にStatusを付けると、ここに見放題率が表示されます。</p>
          <Link className="command-button emphasis-button" href="/">
            Tier表でStatusを付ける
          </Link>
        </section>
      ) : null}

      {hasSubscriptions && stats.watchlistCount > 0 ? (
        <ConclusionBanner stats={stats} />
      ) : null}

      {hasSubscriptions && stats.watchlistCount > 0 ? (
        diagnosisMode ? (
          <DiagnosisView stats={stats} onBack={() => setDiagnosisMode(false)} />
        ) : (
          <BeginnerView stats={stats} onOpenDiagnosis={() => setDiagnosisMode(true)} />
        )
      ) : null}
    </main>
  );
}

// ─── ConclusionBanner ────────────────────────────────────────────────────────

function ConclusionBanner({ stats }: { stats: SubscriptionStats }) {
  if (stats.coveragePercentage === 0) return null;

  const uncoveredCount = stats.watchlistCount - stats.coveredCount;
  const topAdditional = stats.additionalByService
    .filter((e) => e.additionalCount > 0)
    .slice(0, 2);

  return (
    <section
      className="subscriptions-panel"
      style={{
        borderLeft: "4px solid var(--accent, #6366f1)",
        background: "var(--surface-raised, rgba(99,102,241,0.06))"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2 }}>
          ウォッチリストの{" "}
          <span style={{ color: "var(--accent, #6366f1)" }}>
            {stats.coveragePercentage}%
          </span>{" "}
          をカバー中
        </p>
        <p style={{ margin: 0, color: "var(--text-secondary, #888)" }}>
          加入中サービスで{" "}
          <strong>
            {stats.coveredCount}/{stats.watchlistCount}本
          </strong>{" "}
          が見放題
          {uncoveredCount > 0 ? (
            <span>
              {"　"}未カバー:{" "}
              <strong>{uncoveredCount}本</strong>
            </span>
          ) : null}
        </p>
        {topAdditional.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.25rem" }}>
            {topAdditional.map((entry) => (
              <p key={entry.service.id} style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #888)" }}>
                <strong style={{ color: "var(--text, inherit)" }}>{entry.service.name}</strong>{" "}
                を追加すると{" "}
                <strong style={{ color: "var(--accent, #6366f1)" }}>+{entry.additionalCount}本</strong>{" "}
                カバーできます
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── BeginnerView ────────────────────────────────────────────────────────────

function BeginnerView({
  stats,
  onOpenDiagnosis
}: {
  stats: SubscriptionStats;
  onOpenDiagnosis: () => void;
}) {
  return (
    <section className="subscriptions-panel">
      <h2>加入中のサービス</h2>
      <div className="subscription-service-list">
        {stats.subscribedCoverage.map((entry) => (
          <ServiceCoverageRow key={entry.service.id} entry={entry} total={stats.watchlistCount} />
        ))}
      </div>

      {stats.uncoveredAnime.length > 0 ? (
        <p className="subscription-uncovered-note subscription-beginner-gap">
          {stats.uncoveredAnime.length}本はどのサービスにも配信情報がありません。
          <button
            type="button"
            className="subscription-text-link"
            onClick={onOpenDiagnosis}
          >
            詳しく見る
          </button>
        </p>
      ) : null}

      <button
        className="command-button emphasis-button subscriptions-diagnosis-toggle"
        type="button"
        onClick={onOpenDiagnosis}
      >
        診断モードを見る
      </button>
    </section>
  );
}

function ServiceCoverageRow({ entry, total }: { entry: ServiceCoverage; total: number }) {
  const [open, setOpen] = useState(false);
  const uncoveredCount = total - entry.count;

  return (
    <article className="subscription-service-row">
      <button
        type="button"
        className="subscription-service-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="subscription-service-label">
          <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
          <strong>{entry.service.name}</strong>
          <span>（加入中）</span>
        </div>
        <div className="subscription-service-summary">
          <strong className="subscription-service-count">{entry.count}本</strong>
          <span className="subscription-service-meta">
            {total}本中{entry.count}本見放題
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open ? (
        <div className="subscription-anime-list">
          {entry.coveredAnime.length > 0 ? (
            entry.coveredAnime.map((anime) => (
              <a
                key={anime.id}
                className="subscription-anime-item"
                href={anime.siteUrl}
                target="_blank"
                rel="noreferrer"
              >
                {anime.title}
                <ExternalLink size={10} />
              </a>
            ))
          ) : (
            <p className="subscription-anime-empty">このサービスで見られる作品はありません</p>
          )}
          {uncoveredCount > 0 ? (
            <p className="subscription-anime-gap">
              残り{uncoveredCount}本は{entry.service.name}では視聴できません
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ─── DiagnosisView ───────────────────────────────────────────────────────────

function DiagnosisView({
  stats,
  onBack
}: {
  stats: SubscriptionStats;
  onBack: () => void;
}) {
  const uncoveredCount = stats.watchlistCount - stats.coveredCount;

  return (
    <>
      <section className="subscriptions-panel diagnosis-summary">
        <div className="subscription-coverage-ring">
          <strong>{stats.coveragePercentage}%</strong>
          <span>見放題カバー率</span>
        </div>
        <div className="subscription-coverage-summary">
          <p>
            <strong>{stats.watchlistCount}本中{stats.coveredCount}本</strong>が加入中サービスで見放題
          </p>
          {uncoveredCount > 0 ? (
            <p className="subscription-coverage-gap">
              残り{uncoveredCount}本は加入中サービスで見られません
            </p>
          ) : (
            <p className="subscription-coverage-complete">ウォッチリストの全作品が見放題です 🎉</p>
          )}
        </div>
      </section>

      <section className="subscriptions-panel">
        <h2>加入中 — どの作品が見られるか</h2>
        <div className="subscription-diagnosis-list">
          {stats.subscribedCoverage.map((entry) => (
            <DiagnosisServiceRow key={entry.service.id} entry={entry} total={stats.watchlistCount} />
          ))}
        </div>
      </section>

      {stats.additionalByService.some((e) => e.additionalCount > 0) ? (
        <section className="subscriptions-panel">
          <h2>追加すると増える</h2>
          <div className="subscription-additional-list">
            {stats.additionalByService
              .filter((e) => e.additionalCount > 0)
              .map((entry) => (
                <AdditionalServiceRow key={entry.service.id} entry={entry} />
              ))}
          </div>
        </section>
      ) : null}

      {stats.uncoveredAnime.length > 0 ? (
        <section className="subscriptions-panel">
          <h2>
            どこにもない
            <span className="subscription-uncovered-count">{stats.uncoveredAnime.length}本</span>
          </h2>
          <p className="subscription-uncovered-note">
            加入中・未加入を含めどのサービスにも配信情報がない作品です。
          </p>
          <div className="subscription-uncovered-list">
            {stats.uncoveredAnime.map((anime) => (
              <UncoveredAnimeRow key={anime.id} title={anime.title} siteUrl={anime.siteUrl} />
            ))}
          </div>
        </section>
      ) : null}

      <button className="command-button subscriptions-diagnosis-toggle" type="button" onClick={onBack}>
        シンプル表示に戻る
      </button>
    </>
  );
}

function DiagnosisServiceRow({ entry, total }: { entry: ServiceCoverage; total: number }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="subscription-diagnosis-row">
      <button
        type="button"
        className="subscription-diagnosis-toggle-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="subscription-diagnosis-label">
          <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
          <strong>{entry.service.name}</strong>
        </div>
        <div className="subscription-diagnosis-bar">
          <i style={{ width: `${entry.percentage}%` }} />
        </div>
        <span className="subscription-diagnosis-meta">
          {total}本中{entry.count}本（{entry.percentage}%）
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open ? (
        <div className="subscription-anime-list">
          {entry.coveredAnime.length > 0 ? (
            entry.coveredAnime.map((anime) => (
              <a
                key={anime.id}
                className="subscription-anime-item"
                href={anime.siteUrl}
                target="_blank"
                rel="noreferrer"
              >
                {anime.title}
                <ExternalLink size={10} />
              </a>
            ))
          ) : (
            <p className="subscription-anime-empty">このサービスで見られる作品はありません</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function AdditionalServiceRow({ entry }: { entry: AdditionalServiceEffect }) {
  const [open, setOpen] = useState(false);
  const url = getServiceUrl(entry.service.id);

  return (
    <article className="subscription-additional-row">
      <button
        type="button"
        className="subscription-additional-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="subscription-additional-main">
          <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
          <div>
            <strong>{entry.service.name}</strong>
            <span>
              +{entry.additionalCount}本 / 月{entry.service.monthlyPrice.toLocaleString("ja-JP")}円
            </span>
          </div>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open ? (
        <div className="subscription-anime-list subscription-additional-anime">
          {entry.additionalAnime.map((anime) => (
            <a
              key={anime.id}
              className="subscription-anime-item"
              href={anime.siteUrl}
              target="_blank"
              rel="noreferrer"
            >
              {anime.title}
              <ExternalLink size={10} />
            </a>
          ))}
          {url ? (
            <a
              className="command-button subscription-detail-link"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <span>{entry.service.name}を見てみる</span>
              <ExternalLink size={16} />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function UncoveredAnimeRow({ title, siteUrl }: { title: string; siteUrl: string }) {
  const [copied, setCopied] = useState(false);

  function copyTitle() {
    navigator.clipboard.writeText(title).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <article className="subscription-uncovered-row">
      <span className="subscription-uncovered-title">{title}</span>
      <div className="subscription-uncovered-actions">
        <button
          type="button"
          className={`watchlist-title-copy${copied ? " is-copied" : ""}`}
          onClick={copyTitle}
          title="タイトルをコピーして検索"
        >
          <Copy size={10} />
          <span className="copy-label">{copied ? "コピー済" : "コピー"}</span>
        </button>
        <a
          className="subscription-uncovered-link"
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          title="AniListで確認"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </article>
  );
}
