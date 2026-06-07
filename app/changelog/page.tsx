import type { Metadata } from "next";
import { ChangelogClient } from "./changelog-client";

export const metadata: Metadata = {
  title: "更新履歴 — アニメ Tier ボード",
  description: "アニメ Tier ボードの機能追加・改善履歴"
};

export type Release = {
  version: string;
  date: string;
  label: string;
  changes: Array<{
    type: "feat" | "fix" | "perf" | "refactor";
    title: string;
    description: string;
    href?: string;
  }>;
};

export const RELEASES: Release[] = [
  {
    version: "0.7",
    date: "2026-06-07",
    label: "サブスク最適化 & 布教カード",
    changes: [
      {
        type: "feat",
        title: "サブスク最適化",
        description:
          "加入中のサービス（Netflix / U-NEXT / d アニメ等）とウォッチリストを照合し、見放題カバー率を表示。ナビの「サブスク」から確認できます。",
        href: "/subscriptions"
      },
      {
        type: "feat",
        title: "布教カード",
        description:
          "ウォッチリストの作品カード（⋮ メニュー → 「布教カードを作る」）から、おすすめコメント付きのシェアURLを作成できます。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "オンボーディング",
        description:
          "初回ログイン時にサブスクサービスを登録する画面を追加。ダッシュボードを初めて開くと自動で表示されます。",
        href: "/onboarding"
      },
      {
        type: "feat",
        title: "ナビに「サブスク」を追加",
        description: "モバイルナビバーから直接サブスク最適化ページへアクセスできるようになりました。"
      },
      {
        type: "perf",
        title: "画像配信の最適化",
        description:
          "サーバー経由のプロキシを廃止し、AniList CDN から直接画像を配信するように変更。ページ表示速度が向上しました。"
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
        description:
          "季節アニメのカードに見放題サービス（Netflix・Amazonなど）のリンクを表示します。"
      },
      {
        type: "feat",
        title: "Explore「今すぐ見放題」フィルタ",
        description: "探す画面で見放題作品だけに絞り込むフィルタを追加しました。",
        href: "/explore"
      },
      {
        type: "feat",
        title: "放送カレンダー",
        description: "視聴管理リストに今週の放映スケジュールカレンダーを追加しました。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "視聴管理の保存ボタン",
        description: "ウォッチリストカードに明示的な「保存する」ボタンを追加し、編集内容を確実に保存できるようにしました。"
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
        description: "視聴した作品に出演する声優の傾向を一覧表示します。",
        href: "/voice-actors"
      },
      {
        type: "feat",
        title: "探すページ",
        description: "季節アニメをジャンル・フォーマット・視聴可否で絞り込んで探せるページを追加しました。",
        href: "/explore"
      },
      {
        type: "feat",
        title: "モバイルボトムナビ",
        description: "スマートフォンでの操作性を向上させるため、画面下部にナビバーを追加しました。"
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
        title: "視聴管理リスト（ウォッチリスト）",
        description:
          "追っている作品の「いつ見るか」「お気に入り度」「メモ」をまとめて管理するページを追加しました。",
        href: "/watchlist"
      },
      {
        type: "feat",
        title: "放送日・クール情報",
        description: "アニメカードに放送曜日・次回放送日・クール数を表示するようにしました。"
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
        description: "視聴ステータスをもとにジャンル・制作会社・声優の傾向を集計・表示します。",
        href: "/dashboard"
      },
      {
        type: "feat",
        title: "共有・コメント機能",
        description: "Tier ボードや分析結果を URL で共有し、コメントや絵文字リアクションをもらえます。"
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
        description: "視聴ステータスの変更をチップ型のボタンで操作できるよう改善しました。"
      },
      {
        type: "feat",
        title: "ドラッグ & ドロップ改善",
        description: "Tier ボード上でのカードの並び替えをより快適に操作できるようにしました。"
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
        description:
          "AniList から季節アニメを取得し、S / A / B / C / D の Tier に分類して保存できる最初のバージョン。",
        href: "/"
      }
    ]
  }
];

export default function ChangelogPage() {
  return <ChangelogClient releases={RELEASES} />;
}
