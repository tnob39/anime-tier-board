"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getServiceUrl } from "@/lib/streaming-services";
import type { SubscriptionStats } from "@/lib/subscription-stats";

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
        diagnosisMode ? (
          <DiagnosisView stats={stats} onBack={() => setDiagnosisMode(false)} />
        ) : (
          <BeginnerView stats={stats} onOpenDiagnosis={() => setDiagnosisMode(true)} />
        )
      ) : null}
    </main>
  );
}

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
          <article key={entry.service.id} className="subscription-service-row">
            <div className="subscription-service-label">
              <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
              <strong>{entry.service.name}</strong>
              <span>（加入中）</span>
            </div>
            <strong className="subscription-service-count">{entry.count}本</strong>
          </article>
        ))}
      </div>
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

function DiagnosisView({
  stats,
  onBack
}: {
  stats: SubscriptionStats;
  onBack: () => void;
}) {
  return (
    <>
      <section className="subscriptions-panel diagnosis-summary">
        <div className="subscription-coverage-ring">
          <strong>{stats.coveragePercentage}%</strong>
          <span>見放題カバー率</span>
        </div>
        <p>
          {stats.coveredCount} / {stats.watchlistCount}本が加入中サービスで見放題
        </p>
      </section>

      <section className="subscriptions-panel">
        <h2>加入中</h2>
        <div className="subscription-diagnosis-list">
          {stats.subscribedCoverage.map((entry) => (
            <article key={entry.service.id} className="subscription-diagnosis-row">
              <div className="subscription-diagnosis-label">
                <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
                <strong>{entry.service.name}</strong>
              </div>
              <div className="subscription-diagnosis-bar">
                <i style={{ width: `${entry.percentage}%` }} />
              </div>
              <span className="subscription-diagnosis-meta">
                {entry.count}本見放題（{entry.percentage}%）
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="subscriptions-panel">
        <h2>追加すると増える</h2>
        <div className="subscription-additional-list">
          {stats.additionalByService.map((entry) => (
            <article key={entry.service.id} className="subscription-additional-row">
              <div className="subscription-additional-main">
                <img src={entry.service.logoUrl} alt="" aria-hidden="true" />
                <div>
                  <strong>{entry.service.name}</strong>
                  <span>
                    +{entry.additionalCount}本 / 月{entry.service.monthlyPrice.toLocaleString("ja-JP")}
                    円
                  </span>
                </div>
              </div>
              <ServiceDetailLink serviceId={entry.service.id} />
            </article>
          ))}
        </div>
      </section>

      <button className="command-button subscriptions-diagnosis-toggle" type="button" onClick={onBack}>
        シンプル表示に戻る
      </button>
    </>
  );
}

function ServiceDetailLink({ serviceId }: { serviceId: string }) {
  const url = getServiceUrl(serviceId);

  if (!url) {
    return null;
  }

  return (
    <a
      className="command-button subscription-detail-link"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <span>詳しく見る</span>
      <ExternalLink size={16} />
    </a>
  );
}