"use client";

import Link from "next/link";
import { useState } from "react";

type ChangeType = "feat" | "fix" | "perf" | "refactor";

type Release = {
  version: string;
  date: string;
  label: string;
  changes: Array<{
    type: ChangeType;
    title: string;
    description: string;
    href?: string;
  }>;
};

const TYPE_LABELS: Record<ChangeType, string> = {
  feat: "新機能",
  fix: "修正",
  perf: "改善",
  refactor: "内部"
};

const TYPE_CLASS: Record<ChangeType, string> = {
  feat: "cl-tag-feat",
  fix: "cl-tag-fix",
  perf: "cl-tag-perf",
  refactor: "cl-tag-refactor"
};

const RELEASES: Release[] = [
  {
    version: "0.7",
    date: "2026-06-07",
    label: "サブスク最適化 & 布教カード",
    changes: [
      {
        type: "feat",
        title: "サブスク最適化",
        description: "加入中サービスとウォッチリストを照合し、見放題カバー率を表示。",
        href: "/subscriptions"
      },
      {
        type: "feat",
        title: "布教カード",
        description: "ウォッチリストの ⋮ メニューからおすすめコメント付きシェアURLを作成。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "オンボーディング",
        description: "初回ログイン時にサブスクサービスを登録する画面を追加。",
        href: "/onboarding"
      },
      {
        type: "feat",
        title: "ナビに「サブスク」追加",
        description: "モバイルナビバーから直接サブスク最適化ページへアクセス可能に。"
      },
      {
        type: "perf",
        title: "画像配信の最適化",
        description: "サーバープロキシを廃止し AniList CDN から直接配信。表示速度が向上。"
      }
    ]
  },
  {
    version: "0.6",
    date: "2026-05",
    label: "TMDb 連携 & 視聴管理強化",
    changes: [
      {
        type: "feat",
        title: "TMDb Watch Providers 連携",
        description: "季節アニメカードに見放題サービス（Netflix・Amazon 等）のリンクを表示。"
      },
      {
        type: "feat",
        title: "Explore「今すぐ見放題」フィルタ",
        description: "探す画面で見放題作品だけに絞り込むフィルタを追加。",
        href: "/explore"
      },
      {
        type: "feat",
        title: "放送カレンダー",
        description: "視聴管理リストに今週の放映スケジュールカレンダーを追加。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "視聴管理の保存ボタン",
        description: "ウォッチリストカードに明示的な「保存する」ボタンを追加。"
      }
    ]
  },
  {
    version: "0.5",
    date: "2026-04",
    label: "声優・探索・モバイルナビ",
    changes: [
      {
        type: "feat",
        title: "声優ページ",
        description: "視聴作品に出演する声優の傾向を一覧表示。",
        href: "/voice-actors"
      },
      {
        type: "feat",
        title: "探すページ",
        description: "季節アニメをジャンル・フォーマット・視聴可否で絞り込んで探せるページを追加。",
        href: "/explore"
      },
      {
        type: "feat",
        title: "モバイルボトムナビ",
        description: "スマートフォンでの操作性向上のため画面下部にナビバーを追加。"
      }
    ]
  },
  {
    version: "0.4",
    date: "2026-03",
    label: "視聴管理リスト",
    changes: [
      {
        type: "feat",
        title: "ウォッチリスト",
        description: "追っている作品の「いつ見るか」「お気に入り度」「メモ」を管理するページを追加。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "放送日・クール情報",
        description: "アニメカードに放送曜日・次回放送日・クール数を表示。"
      }
    ]
  },
  {
    version: "0.3",
    date: "2026-02",
    label: "ダッシュボード & ソーシャル",
    changes: [
      {
        type: "feat",
        title: "好み分析ダッシュボード",
        description: "視聴ステータスをもとにジャンル・制作会社・声優の傾向を集計。",
        href: "/dashboard"
      },
      {
        type: "feat",
        title: "共有・コメント機能",
        description: "Tier ボードや分析結果を URL で共有し、コメントやリアクションをもらえる機能を追加。"
      }
    ]
  },
  {
    version: "0.2",
    date: "2026-01",
    label: "モバイル対応 & UI 改善",
    changes: [
      {
        type: "feat",
        title: "ステータス選択のチップ UI",
        description: "視聴ステータスの変更をチップ型ボタンで操作できるよう改善。"
      },
      {
        type: "feat",
        title: "ドラッグ & ドロップ改善",
        description: "Tier ボード上でのカード並び替えをより快適に操作できるように改善。"
      }
    ]
  },
  {
    version: "0.1",
    date: "2025-12",
    label: "MVP リリース",
    changes: [
      {
        type: "feat",
        title: "アニメ Tier ボード",
        description: "AniList から季節アニメを取得し S / A / B / C / D の Tier に分類して保存できる最初のバージョン。",
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
          <h2>更新履歴</h2>
        </div>
      </header>

      <div className="cl-timeline">
        <ReleaseItem release={latest} isLatest />

        {expanded
          ? history.map((r) => <ReleaseItem key={r.version} release={r} />)
          : null}
      </div>

      <button
        type="button"
        className="cl-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? "▲ 閉じる" : `▼ 過去 ${history.length} バージョンを見る`}
      </button>
    </section>
  );
}

function ReleaseItem({ release, isLatest = false }: { release: Release; isLatest?: boolean }) {
  return (
    <article className={`cl-release ${isLatest ? "is-latest" : ""}`}>
      <div className="cl-release-meta">
        <span className={`cl-version ${isLatest ? "is-latest" : ""}`}>v{release.version}</span>
        <time className="cl-date">{release.date}</time>
      </div>
      <div className="cl-release-body">
        <h3 className="cl-release-title">{release.label}</h3>
        <ul className="cl-changes">
          {release.changes.map((change) => (
            <li key={change.title} className="cl-change">
              <span className={`cl-tag ${TYPE_CLASS[change.type]}`}>
                {TYPE_LABELS[change.type]}
              </span>
              <div>
                {change.href ? (
                  <Link className="cl-change-title" href={change.href}>
                    {change.title}
                  </Link>
                ) : (
                  <strong className="cl-change-title">{change.title}</strong>
                )}
                <p className="cl-change-desc">{change.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
