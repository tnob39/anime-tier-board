"use client";

import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CreditCard,
  ListChecks,
  Megaphone,
  Mic2,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { ThemeSwitch } from "@/components/ThemeSwitch";

const links = [
  { href: "/watchlist", label: "マイリスト", icon: ListChecks },
  { href: "/guide", label: "使い方", icon: BookOpen },
  { href: "/dashboard", label: "分析", icon: BarChart3 },
  { href: "/voice-actors", label: "声優", icon: Mic2 },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/updates", label: "更新情報", icon: Megaphone },
];

type MyPageClientProps = {
  statusCounts?: {
    planned: number;
    watching: number;
    completed: number;
    paused: number;
    dropped: number;
  } | null;
  subscriptionSummary?: {
    serviceCount: number;
    coveragePercentage: number;
    watchlistCount: number;
    coveredCount: number;
  } | null;
  tierDistribution?: Array<{
    label: string;
    color: string;
    count: number;
  }> | null;
};

export function MyPageClient({
  statusCounts = null,
  subscriptionSummary = null,
  tierDistribution = null
}: MyPageClientProps = {}) {
  const { data: session, status } = useSession();
  const total = statusCounts
    ? Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <main className="app-main mypage-main">
      <header className="mypage-header">
        <p className="eyebrow">マイページ</p>
        <h1>マイページ</h1>
      </header>

      <section className="mypage-section">
        <h2>アカウント</h2>
        {status === "loading" ? (
          <div className="mypage-account">
            <span style={{ color: "var(--muted)" }}>
              ログイン状態を確認中...
            </span>
          </div>
        ) : status === "authenticated" ? (
          <>
            <div className="mypage-account">
              {session?.user?.name ? <strong>{session.user.name}</strong> : null}
              {session?.user?.email ? <span>{session.user.email}</span> : null}
            </div>
            <button
              type="button"
              className="command-button"
              onClick={() => void signOut()}
            >
              ログアウト
            </button>
          </>
        ) : (
          <button
            type="button"
            className="command-button emphasis-button"
            onClick={() => void signIn("google")}
          >
            Googleでログイン
          </button>
        )}
      </section>

      {statusCounts ? (
        <section className="mypage-section">
          <h2>視聴データ</h2>
          <div className="mypage-stats">
            <div className="mypage-stat">
              <div className="mypage-stat-num">{statusCounts.watching}</div>
              <div className="mypage-stat-label">視聴中</div>
            </div>
            <div className="mypage-stat">
              <div className="mypage-stat-num">{statusCounts.planned}</div>
              <div className="mypage-stat-label">見たい</div>
            </div>
            <div className="mypage-stat">
              <div className="mypage-stat-num">{statusCounts.completed}</div>
              <div className="mypage-stat-label">完了</div>
            </div>
          </div>
          {tierDistribution && tierDistribution.length > 0 ? (
            <div className="mypage-tier-block">
              <p className="mypage-tier-caption">Tier分布</p>
              <div className="mypage-tier-chips">
                {tierDistribution.map((chip) => (
                  <span key={chip.label} className="mypage-tier-chip">
                    <i
                      className="mypage-tier-dot"
                      style={{ background: chip.color }}
                      aria-hidden="true"
                    />
                    {chip.label}
                    <b>{chip.count}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <Link href="/watchlist" className="hamburger-nav-item">
            <ListChecks size={18} className="hamburger-nav-icon" aria-hidden="true" />
            <span>マイリストを見る（全{total}件）</span>
            <ChevronRight size={18} className="mypage-link-arrow" aria-hidden="true" />
          </Link>
          <Link href="/dashboard" className="hamburger-nav-item">
            <BarChart3 size={18} className="hamburger-nav-icon" aria-hidden="true" />
            <span>分析で詳細を見る</span>
            <ChevronRight size={18} className="mypage-link-arrow" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {subscriptionSummary ? (
        <section className="mypage-section">
          <h2>サブスク</h2>
          {subscriptionSummary.serviceCount > 0 ? (
            <>
              <p className="mypage-subs-summary">
                加入中 {subscriptionSummary.serviceCount}サービス
                {subscriptionSummary.watchlistCount > 0
                  ? `・見放題カバー率 ${subscriptionSummary.coveragePercentage}%（${subscriptionSummary.coveredCount}/${subscriptionSummary.watchlistCount}作品）`
                  : null}
              </p>
              <Link
                href="/dashboard?section=subscriptions"
                className="hamburger-nav-item"
              >
                <CreditCard size={18} className="hamburger-nav-icon" aria-hidden="true" />
                <span>サブスク管理</span>
                <ChevronRight size={18} className="mypage-link-arrow" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <Link
              href="/dashboard?section=subscriptions"
              className="hamburger-nav-item"
            >
              <CreditCard size={18} className="hamburger-nav-icon" aria-hidden="true" />
              <span>サブスクを登録してカバー率をチェック</span>
              <ChevronRight size={18} className="mypage-link-arrow" aria-hidden="true" />
            </Link>
          )}
        </section>
      ) : null}

      <section className="mypage-section">
        <h2>メニュー</h2>
        <nav aria-label="マイページメニュー">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="hamburger-nav-item">
                <Icon size={18} className="hamburger-nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
                <ChevronRight size={18} className="mypage-link-arrow" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="mypage-section">
        <h2>テーマ</h2>
        <ThemeSwitch />
      </section>
    </main>
  );
}
