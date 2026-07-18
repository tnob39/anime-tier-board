"use client";

import { Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";
import type { DashboardData, ViewingStatus } from "@/lib/statuses";
import type { PublicSubscriptionDiagnosis } from "@/lib/subscription-stats";

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function DashboardClient({
  dashboard,
  subscriptionDiagnosis,
  hasSubscriptions,
  isOwner
}: {
  dashboard: DashboardData;
  subscriptionDiagnosis: PublicSubscriptionDiagnosis;
  hasSubscriptions: boolean;
  isOwner: boolean;
}) {
  const maxStatus = Math.max(1, ...Object.values(dashboard.statusCounts));
  const hasData = dashboard.totalStatuses > 0;
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const diagnosisTrackedRef = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("section") !== "subscriptions") {
      return;
    }
    document.getElementById("subscriptions")?.scrollIntoView({ block: "start" });
  }, [searchParams]);

  useEffect(() => {
    if (diagnosisTrackedRef.current || !hasSubscriptions || subscriptionDiagnosis.watchlistCount === 0) {
      return;
    }
    diagnosisTrackedRef.current = true;
    track({ name: "subsc_diagnosis_complete" });
  }, [hasSubscriptions, subscriptionDiagnosis.watchlistCount]);

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
      const outcome = await shareOrCopyUrl({
        url: nextShareUrl,
        title: "私の好み分析",
        text: "アニメの好み分析をシェアします"
      });
      setShareOutcome(outcome);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "共有URLの作成に失敗しました。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="app-main dashboard-main">
      {!isOwner ? <h1 className="sr-only">分析</h1> : null}
      {isOwner ? (
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">分析</p>
            <h1>分析</h1>
            <p>{dashboard.totalStatuses}件の視聴ステータスを保存中</p>
          </div>
          <div className="dashboard-actions">
            <button
              className="icon-button nav-icon-link"
              type="button"
              onClick={() => void createShare()}
              disabled={sharing || !hasData}
              title={hasData ? "分析を共有" : "共有できる視聴データがありません"}
              aria-label={hasData ? "分析を共有" : "共有できる視聴データがありません"}
            >
              {sharing ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
            </button>
          </div>
        </header>
      ) : null}

      {isOwner && message ? (
        <div className="notice error" role="alert">
          {message}
        </div>
      ) : null}
      {isOwner && shareUrl ? (
        <div className="notice success" role="status" aria-live="polite">
          {shareOutcome === "copied" ? "共有URLをコピーしました:" : "共有URL:"}{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
            <span className="sr-only">（新しいタブで開きます）</span>
          </a>
        </div>
      ) : null}

      {isOwner && !hasData ? (
        <div className="tutorial-empty-callout">
          <strong>まだ分析データがありません</strong>
          <span>作品に「見たい」を付けると、ここに好みの傾向が表示されます。</span>
          <Link className="command-button emphasis-button" href="/#home-add-section">
            今期のアニメを見てみる
          </Link>
        </div>
      ) : null}

      <SubscriptionAnalyticsSection diagnosis={subscriptionDiagnosis} hasSubscriptions={hasSubscriptions} />

      {isOwner ? (
        <div className="pref-analysis-accordion">
          <button
            type="button"
            className="pref-analysis-accordion-header"
            onClick={() => setAnalysisOpen(!analysisOpen)}
            aria-expanded={analysisOpen}
            aria-controls="pref-analysis-accordion-body"
          >
            分析
            <span aria-hidden="true">{analysisOpen ? "−" : "+"}</span>
          </button>
          {analysisOpen ? (
            <div className="pref-analysis-accordion-body" id="pref-analysis-accordion-body">
              <DashboardSummary dashboard={dashboard} maxStatus={maxStatus} />
            </div>
          ) : null}
        </div>
      ) : null}
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

function SubscriptionAnalyticsSection({
  diagnosis,
  hasSubscriptions
}: {
  diagnosis: PublicSubscriptionDiagnosis;
  hasSubscriptions: boolean;
}) {
  if (!hasSubscriptions) {
    return (
      <section id="subscriptions" className="dashboard-subscription-card" aria-label="サブスク診断サマリー">
        <div>
          <p className="eyebrow">サブスク</p>
          <h2>見放題カバー率 未設定</h2>
          <p>加入中のサブスクを登録するとカバー率を表示できます。</p>
        </div>
        <Link className="command-button emphasis-button" href="/settings">
          サブスクを登録する →
        </Link>
      </section>
    );
  }

  if (diagnosis.watchlistCount === 0) {
    return (
      <section id="subscriptions" className="dashboard-subscription-card" aria-label="サブスク診断サマリー">
        <div>
          <p className="eyebrow">サブスク</p>
          <h2>サブスク診断</h2>
          <p>作品にステータスを付けると、見放題カバー率を計算できます。</p>
        </div>
        <Link className="command-button emphasis-button" href="/watchlist">
          視聴管理へ
        </Link>
      </section>
    );
  }

  const uncoveredCount = diagnosis.watchlistCount - diagnosis.coveredCount;
  const exclusiveByServiceId = new Map(
    diagnosis.exclusiveByService.map((entry) => [entry.serviceId, entry])
  );

  return (
    <section id="subscriptions" className="subscriptions-panel" aria-label="サブスク診断">
      <p className="eyebrow">サブスク</p>
      <h2>
        {diagnosis.coveragePercentage}% を加入中サービスでカバー
      </h2>
      <p>
        {diagnosis.watchlistCount}本中 <strong>{diagnosis.coveredCount}本</strong> が見放題
        {uncoveredCount > 0 ? `・未カバー ${uncoveredCount}本` : ""}
      </p>

      <div className="subscription-diagnosis-list">
        {diagnosis.subscribedCoverage.map((entry) => {
          const exclusive = exclusiveByServiceId.get(entry.serviceId);
          return (
            <article key={entry.serviceId} className="subscription-diagnosis-row">
              <div className="subscription-diagnosis-label">
                <img src={entry.logoUrl} alt="" aria-hidden="true" loading="lazy" />
                <strong>{entry.serviceName}</strong>
                {exclusive ? (
                  <span className="subscription-exclusive-badge">ここだけ {exclusive.exclusiveAnime.length}本</span>
                ) : null}
              </div>
              <div className="subscription-diagnosis-bar">
                <i style={{ width: `${entry.percentage}%` }} />
              </div>
              <span className="subscription-diagnosis-meta">
                {diagnosis.watchlistCount}本中{entry.count}本（{entry.percentage}%）
              </span>
            </article>
          );
        })}
      </div>

      {diagnosis.additionalByService.length > 0 ? (
        <p className="subscription-additional-hint">
          <strong>{diagnosis.additionalByService[0].serviceName}</strong>{" "}
          を追加すると +{diagnosis.additionalByService[0].additionalCount}本カバーできます
        </p>
      ) : null}
    </section>
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
    <section id="anime-analytics" className="anime-analytics-panel" aria-label="アニメタイプ分析">
      <p className="eyebrow">分析</p>
      <h2>アニメタイプ傾向</h2>
      <p>ジャンル・声優・視聴ステータスの傾向です。</p>

      <div className="dashboard-grid">
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
      </div>
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
