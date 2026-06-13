import type { Metadata } from "next";
import {
  BarChart3, Bell, CalendarDays, Compass, CreditCard,
  Filter, Layers, ListChecks, Menu, Mic2, Search, Share2, Smartphone, Sparkles, Star,
  Tv2, UserCheck, Zap, Download, Loader2, Bookmark, type LucideIcon
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "更新情報 — numanie",
  description: "numanie の最新アップデート一覧"
};

type Release = {
  version: string;
  date: string;
  label: string;
  isLatest?: boolean;
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
    version: "1.6",
    date: "2026-06-13",
    label: "パーソナルホーム実装・ナビ改善・カレンダーUX刷新",
    isLatest: true,
    changes: [
      {
        icon: Tv2,
        iconColor: "#6366f1",
        title: "トップページがパーソナルホームに",
        description: "アプリを開くと「今夜放映」「視聴中」「見たい」の3レーンで自分の視聴状況が一目でわかるホーム画面になりました。",
        href: "/",
      },
      {
        icon: CalendarDays,
        iconColor: "#a07ef7",
        title: "放映カレンダーを横スクロールレーン化",
        description: "視聴管理ページの放映カレンダーが曜日ごとの横スクロールレーンに変わりました。今日の欄に自動スクロールし、見たいアニメが一目でわかるようになりました。",
        href: "/watchlist",
      },
      {
        icon: Layers,
        iconColor: "#6366f1",
        title: "Tier 表を /tier へ移設",
        description: "Tier ボードを専用の /tier ページへ移設しました。トップ（/）は今後パーソナルホームとして整備予定です。",
        href: "/tier",
      },
      {
        icon: Search,
        iconColor: "#4f8ef7",
        title: "探すアイコンを虫眼鏡に変更",
        description: "右上ナビの「探す」ボタンのアイコンをコンパスから虫眼鏡（Search）に変更しました。機能がひと目でわかりやすくなりました。",
        href: "/explore",
      },
    ]
  },
  {
    version: "1.5",
    date: "2026-06-12",
    label: "PWA ショートカット・バッジ通知",
    isLatest: false,
    changes: [
      {
        icon: Smartphone,
        iconColor: "#6366f1",
        title: "PWA ホーム画面ショートカット",
        description: "ホーム画面の numanie アイコンを長押しすると「今夜見るリスト」「ティア表」「サブスク診断」へのショートカットが表示されます（対応デバイスのみ）。",
        href: "/watchlist",
      },
      {
        icon: Bookmark,
        iconColor: "#f59e0b",
        title: "アプリバッジ通知（Badging API）",
        description: "ウォッチリストを開くと、今日放送の視聴中アニメ数がホーム画面のアプリアイコン上にバッジ表示されます（対応ブラウザ・OS のみ）。",
        href: "/watchlist",
      }
    ]
  },
  {
    version: "1.4",
    date: "2026-06-12",
    label: "numanie リブランディング・UX 改善",
    isLatest: false,
    changes: [
      {
        icon: Sparkles,
        iconColor: "#818cf8",
        title: "numanie にリブランド",
        description: "サービス名を「numanie」に変更しました。「沼に」＋ フランス語 manie（熱中・偏愛）から着想を得た名前です。ロゴ・アイコン・PWAアイコンも新デザインに刷新。",
      },
      {
        icon: Loader2,
        iconColor: "#4f8ef7",
        title: "初期ロード スケルトン表示",
        description: "ページ読み込み中に「0作品」の空白Tier表が一瞬表示される問題を修正。データ取得中はシマーアニメーション付きのスケルトンUIに切り替わります。",
        href: "/",
      },
      {
        icon: CreditCard,
        iconColor: "#4fc48e",
        title: "サブスク診断 — 結論ファースト表示",
        description: "サブスク診断ページの最上部に「ウォッチリストの XX% をカバー中」サマリーを追加。何本見られるか・追加するとお得なサービスが一目でわかるようになりました。",
        href: "/subscriptions",
      }
    ]
  },
  {
    version: "1.3",
    date: "2026-06-11",
    label: "PWA プッシュ通知対応",
    isLatest: false,
    changes: [
      {
        icon: Bell,
        iconColor: "#f7a74f",
        title: "プッシュ通知（実験的）",
        description: "設定画面からプッシュ通知を有効にすると、視聴中・見たいアニメの放送日に通知が届きます。iPhoneはホーム画面に追加後にご利用ください。",
        href: "/settings",
      }
    ]
  },
  {
    version: "1.2",
    date: "2026-06-11",
    label: "ナビゲーション大改修・初回チュートリアル追加",
    isLatest: false,
    changes: [
      {
        icon: Menu,
        iconColor: "#4f8ef7",
        title: "ハンバーガーメニュー追加",
        description: "左上 ☰ アイコンからメニューを開けるようになりました。シンプル/プロモードの切替、全ページへのナビゲーション、更新情報・設定へのリンクがここに集約されています。",
      },
      {
        icon: UserCheck,
        iconColor: "#4fc48e",
        title: "ログイン/ユーザーアイコンを右上に配置",
        description: "未ログイン時は右上のアイコンをタップするとGoogleログインができます。ログイン後はアバターをタップして設定・ログアウトにアクセスできます。",
      },
      {
        icon: Sparkles,
        iconColor: "#f7a74f",
        title: "初回訪問チュートリアル",
        description: "初めてアプリを開いたとき「何のアプリか」を説明するモーダルが表示されます。3ステップのガイドとGoogleログイン誘導ボタン付き。",
      }
    ]
  },
  {
    version: "1.1",
    date: "2026-06-11",
    label: "シンプル/プロ表示モード切り替え",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#a07ef7",
        title: "シンプルモード / プロモード切り替え",
        description: "設定ページから表示モードを選べるようになりました。シンプルモードはアニメ一覧・視聴管理・サブスクのみ。プロモードはティア追加・PNG出力・共有・過去作探索・声優・分析など全機能が使えます。",
        href: "/settings"
      }
    ]
  },
  {
    version: "1.0",
    date: "2026-06-10",
    label: "PWA 対応 — ホームに追加できるようになりました",
    isLatest: false,
    changes: [
      {
        icon: Download,
        iconColor: "#4fc48e",
        title: "ホーム画面に追加（PWA）",
        description: "Safari の「共有 → ホーム画面に追加」または Chrome の「インストール」からアプリのようにホーム画面に追加できます。アイコン・スプラッシュ・テーマカラーに対応しました。",
      }
    ]
  },
  {
    version: "0.9",
    date: "2026-06-10",
    label: "モバイル UX 改善 & カレンダーフィルター",
    changes: [
      {
        icon: Smartphone,
        iconColor: "#4fc48e",
        title: "モバイル視聴管理の表示崩れ修正",
        description: "スマートフォンでのウォッチリスト画面を改善。ステータスチップの折り返し表示、長いタイトルでのレイアウト崩れ、コピーボタンのアイコン表示を修正しました。",
        href: "/watchlist"
      },
      {
        icon: Filter,
        iconColor: "#a07ef7",
        title: "放送カレンダーフィルター変更",
        description: "放送カレンダーに表示するアニメを「視聴中」と「見たい」のみに絞り込むよう変更しました。一時停止・完了・中止は非表示になります。",
        href: "/watchlist"
      },
      {
        icon: CreditCard,
        iconColor: "#4f8ef7",
        title: "サブスク診断の詳細表示",
        description: "見放題カバー率ページで、各サービスがカバーしている作品を展開して確認できるようになりました。",
        href: "/subscriptions"
      },
      {
        icon: Tv2,
        iconColor: "#f76f4f",
        title: "今夜何見る？ ロジック改善",
        description: "週次視聴アニメを優先表示するよう修正。「今日放送」「昨日放送」「今週放送済み」などのタグと、おすすめ理由を表示するようにしました。",
        href: "/dashboard"
      }
    ]
  },
  {
    version: "0.8",
    date: "2026-06-08",
    label: "今夜何見る？",
    changes: [
      {
        icon: Tv2,
        iconColor: "#f76f4f",
        title: "今夜何見る？",
        description: "ダッシュボードから「続きを見る」「今夜完結したい」で候補を提示します。視聴リズム（毎週リアタイ / まとめて見る / ゆっくり見る）も登録できます。",
        href: "/dashboard"
      }
    ]
  },
  {
    version: "0.7",
    date: "2026-06-07",
    label: "サブスク最適化 & 布教カード",
    changes: [
      {
        icon: CreditCard,
        iconColor: "#4f8ef7",
        title: "サブスク最適化",
        description: "加入中のサービス（Netflix・U-NEXT・d アニメ等）とウォッチリストを照合して見放題カバー率を表示します。",
        href: "/subscriptions"
      },
      {
        icon: Share2,
        iconColor: "#f76f4f",
        title: "布教カード",
        description: "ウォッチリストの作品カード（⋮ メニュー）からおすすめコメント付きのシェア URL を作成できます。",
        href: "/watchlist"
      },
      {
        icon: UserCheck,
        iconColor: "#4fc48e",
        title: "オンボーディング",
        description: "初回ログイン時にサブスクサービスを登録する画面を追加しました。ダッシュボードを初めて開くと自動で表示されます。",
        href: "/onboarding"
      },
      {
        icon: Zap,
        iconColor: "#f7b24f",
        title: "画像配信の高速化",
        description: "サーバー経由のプロキシを廃止し、AniList CDN から直接画像を配信するように変更。表示速度が向上しました。"
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
        description: "季節アニメのカードに Netflix・Amazon Prime 等の見放題サービスリンクを表示します。"
      },
      {
        icon: Compass,
        iconColor: "#4fc48e",
        title: "「今すぐ見放題」フィルタ",
        description: "探す画面で見放題作品だけに絞り込めるフィルタを追加しました。",
        href: "/explore"
      },
      {
        icon: CalendarDays,
        iconColor: "#a07ef7",
        title: "放送カレンダー",
        description: "視聴管理リストに今週の放映スケジュールをカレンダー形式で表示するセクションを追加しました。",
        href: "/watchlist"
      },
      {
        icon: ListChecks,
        iconColor: "#4fc48e",
        title: "視聴管理の保存ボタン",
        description: "ウォッチリストカードに明示的な「保存する」ボタンを追加し、変更内容を確実に保存できるようにしました。"
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
        description: "視聴した作品に出演する声優の傾向を一覧で確認できるページを追加しました。",
        href: "/voice-actors"
      },
      {
        icon: Compass,
        iconColor: "#4f8ef7",
        title: "探すページ",
        description: "季節アニメをジャンル・フォーマット・視聴可否で絞り込んで探せるページを追加しました。",
        href: "/explore"
      },
      {
        icon: Sparkles,
        iconColor: "#a07ef7",
        title: "モバイルボトムナビ",
        description: "スマートフォンでの操作性を向上させるため、画面下部にナビゲーションバーを追加しました。"
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
        description: "追っている作品の「いつ見るか」「お気に入り度」「メモ」をまとめて管理できるページを追加しました。",
        href: "/watchlist"
      },
      {
        icon: CalendarDays,
        iconColor: "#f7b24f",
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
        icon: BarChart3,
        iconColor: "#4f8ef7",
        title: "好み分析ダッシュボード",
        description: "視聴ステータスをもとにジャンル・制作会社・声優の傾向を集計・グラフ表示します。",
        href: "/dashboard"
      },
      {
        icon: Share2,
        iconColor: "#f76f4f",
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
        icon: Star,
        iconColor: "#f7b24f",
        title: "ステータス選択のチップ UI",
        description: "視聴ステータスの変更をチップ型のボタンで操作できるよう改善しました。"
      },
      {
        icon: Sparkles,
        iconColor: "#a07ef7",
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
        icon: Sparkles,
        iconColor: "#a07ef7",
        title: "numanie",
        description: "AniList から季節アニメを取得し、S / A / B / C / D の Tier に分類して保存できる最初のバージョン。",
        href: "/"
      }
    ]
  }
];

export default function UpdatesPage() {
  return (
    <main className="app-main updates-main">
      <header className="updates-header">
        <Link className="updates-back" href="/dashboard">← 戻る</Link>
        <h1>更新情報</h1>
      </header>

      <div className="updates-timeline">
        {RELEASES.map((release) => {
          const Icon0 = release.changes[0].icon;
          return (
            <article key={release.version} className="updates-release">
              <div className="updates-release-header">
                <div className="updates-release-meta">
                  {release.isLatest ? (
                    <span className="updates-latest-badge">最新</span>
                  ) : null}
                  <span className="updates-version">v{release.version}</span>
                  <time className="updates-date">{release.date}</time>
                </div>
                <h2 className="updates-release-title">{release.label}</h2>
              </div>

              <ul className="updates-changes">
                {release.changes.map((change) => {
                  const Icon = change.icon;
                  const inner = (
                    <>
                      <span
                        className="updates-icon-wrap"
                        style={{ background: `${change.iconColor}1a` }}
                      >
                        <Icon size={22} color={change.iconColor} />
                      </span>
                      <div className="updates-change-text">
                        <strong>{change.title}</strong>
                        <p>{change.description}</p>
                      </div>
                      {change.href ? (
                        <span className="updates-arrow">›</span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={change.title}>
                      {change.href ? (
                        <Link className="updates-change" href={change.href}>
                          {inner}
                        </Link>
                      ) : (
                        <div className="updates-change">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </main>
  );
}
