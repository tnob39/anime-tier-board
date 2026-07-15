"use client";

import {
  BarChart3,
  CreditCard,
  Share2,
  Sparkles,
  UserCheck,
  Zap,
  Star,
  Compass,
  ListChecks,
  Mic2,
  CalendarDays,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Release = {
  version: string;
  date: string;
  label: string;
  changes: Array<{
    icon: LucideIcon;
    iconColor: string;
    title: string;
    description: string;
    href?: string;
  }>;
};

const RELEASES: Release[] = [
  {
    version: "0.7",
    date: "2026-06-07",
    label: "サブスク最適化 & 布教カード",
    changes: [
      {
        icon: CreditCard,
        iconColor: "#4f8ef7",
        title: "サブスク最適化",
        description: "加入中サービスとウォッチリストを照合し、見放題カバー率を表示。",
        href: "/subscriptions"
      },
      {
        icon: Share2,
        iconColor: "#f76f4f",
        title: "布教カード",
        description: "ウォッチリストの ⋮ メニューからおすすめコメント付きシェアURLを作成。",
        href: "/watchlist"
      },
      {
        icon: UserCheck,
        iconColor: "#4fc48e",
        title: "オンボーディング",
        description: "初回ログイン時にサブスクサービスを登録する画面を追加。",
        href: "/onboarding"
      },
      {
        icon: Zap,
        iconColor: "#f7b24f",
        title: "画像配信の高速化",
        description: "サーバープロキシを廃止し CDN から直接配信。表示が速くなりました。"
      }
    ]
  },
  {
    version: "0.6",
    date: "2026-05",
    label: "TMDb 連携 & 視聴管理強化",
    changes: [
      {
        icon: Sparkles,
        iconColor: "#4f8ef7",
        title: "TMDb Watch Providers 連携",
        description: "季節アニメカードに Netflix・Amazon 等の見放題リンクを表示。"
      },
      {
        icon: Compass,
        iconColor: "#4fc48e",
        title: "「今すぐ見放題」フィルタ",
        description: "探す画面で見放題作品だけに絞り込めるフィルタを追加。",
        href: "/explore"
      },
      {
        icon: CalendarDays,
        iconColor: "#a07ef7",
        title: "放送カレンダー",
        description: "視聴管理リストに今週の放映スケジュールカレンダーを追加。",
        href: "/watchlist"
      }
    ]
  },
  {
    version: "0.5",
    date: "2026-04",
    label: "声優・探索・モバイルナビ",
    changes: [
      {
        icon: Mic2,
        iconColor: "#f76f4f",
        title: "声優ページ",
        description: "視聴作品に出演する声優の傾向を一覧表示。",
        href: "/voice-actors"
      },
      {
        icon: Compass,
        iconColor: "#4f8ef7",
        title: "探すページ",
        description: "季節アニメをジャンル・視聴可否で絞り込んで探せるページを追加。",
        href: "/explore"
      }
    ]
  },
  {
    version: "0.4",
    date: "2026-03",
    label: "視聴管理リスト",
    changes: [
      {
        icon: ListChecks,
        iconColor: "#4fc48e",
        title: "ウォッチリスト",
        description: "追っている作品の「いつ見るか」「お気に入り度」「メモ」を管理するページを追加。",
        href: "/watchlist"
      }
    ]
  },
  {
    version: "0.3",
    date: "2026-02",
    label: "ダッシュボード & ソーシャル",
    changes: [
      {
        icon: BarChart3,
        iconColor: "#4f8ef7",
        title: "好み分析ダッシュボード",
        description: "視聴ステータスをもとにジャンル・制作会社・声優の傾向を集計。",
        href: "/dashboard"
      }
    ]
  },
  {
    version: "0.2",
    date: "2026-01",
    label: "モバイル対応 & UI 改善",
    changes: [
      {
        icon: Star,
        iconColor: "#f7b24f",
        title: "お気に入り度・チップUI",
        description: "視聴ステータスの変更をチップ型ボタンで操作できるよう改善。"
      }
    ]
  },
  {
    version: "0.1",
    date: "2025-12",
    label: "MVP リリース",
    changes: [
      {
        icon: Sparkles,
        iconColor: "#a07ef7",
        title: "アニメ Tier ボード",
        description: "AniList から季節アニメを取得し S〜D の Tier に分類して保存できる最初のバージョン。",
        href: "/"
      }
    ]
  }
];

export function ChangelogSection() {
  const [expanded, setExpanded] = useState(false);
  const latest = RELEASES[0];
  const history = RELEASES.slice(1);

  return (
    <section className="dashboard-changelog" aria-label="更新履歴">
      <header className="cl-header">
        <div className="cl-header-left">
          <span className="cl-badge">NEW</span>
          <div>
            <h2 className="cl-header-title">v{latest.version} — {latest.label}</h2>
            <time className="cl-header-date">{latest.date}</time>
          </div>
        </div>
      </header>

      <ul className="cl-icon-grid">
        {latest.changes.map((change) => {
          const Icon = change.icon;
          const inner = (
            <>
              <span className="cl-icon-wrap" style={{ background: `${change.iconColor}1a` }}>
                <Icon size={20} color={change.iconColor} />
              </span>
              <div className="cl-icon-text">
                <strong>{change.title}</strong>
                <p>{change.description}</p>
              </div>
              {change.href ? <span className="cl-icon-arrow">›</span> : null}
            </>
          );
          return (
            <li key={change.title}>
              {change.href ? (
                <Link className="cl-icon-item" href={change.href}>{inner}</Link>
              ) : (
                <div className="cl-icon-item">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      {expanded ? (
        <div className="cl-history" id="dashboard-changelog-history">
          {history.map((release) => (
            <article key={release.version} className="cl-history-release">
              <div className="cl-history-meta">
                <span className="cl-version">v{release.version}</span>
                <span className="cl-history-label">{release.label}</span>
                <time className="cl-date">{release.date}</time>
              </div>
              <ul className="cl-history-changes">
                {release.changes.map((change) => {
                  const Icon = change.icon;
                  return (
                    <li key={change.title} className="cl-history-item">
                      <span
                        className="cl-history-icon"
                        style={{ background: `${change.iconColor}1a` }}
                      >
                        <Icon size={14} color={change.iconColor} />
                      </span>
                      {change.href ? (
                        <Link className="cl-history-title" href={change.href}>
                          {change.title}
                        </Link>
                      ) : (
                        <span className="cl-history-title">{change.title}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="cl-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="dashboard-changelog-history"
      >
        {expanded ? "▲ 閉じる" : `▼ 過去 ${history.length} バージョンを見る`}
      </button>
    </section>
  );
}
