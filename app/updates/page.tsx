import type { Metadata } from "next";
import {
  BarChart3, Bell, BookOpen, CalendarDays, Compass, CreditCard,
  Filter, Layers, ListChecks, Menu, Mic2, PlayCircle, Search, Share2, Smartphone, Sparkles, Star,
  Trash2, Tv2, UserCheck, Zap, Download, Loader2, Bookmark, type LucideIcon
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
    version: "1.41",
    date: "2026-07-04",
    label: "マイリストに今期のおすすめレーン",
    isLatest: true,
    changes: [
      {
        icon: Compass,
        iconColor: "#6366f1",
        title: "マイリストの下に「今期のおすすめ」を表示",
        description: "マイリストのジャンル傾向に合わせた今期作品を横スクロールで提案します。気になる作品は「見たい」ですぐ追加できます。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.40",
    date: "2026-07-03",
    label: "マイリストにも配信サービスを表示",
    isLatest: false,
    changes: [
      {
        icon: Tv2,
        iconColor: "#0f766e",
        title: "マイリストのカードに配信サービスを表示",
        description: "マイリストページの各カードにも、どのサブスクで見られるかをロゴで表示するようにしました。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.39",
    date: "2026-07-03",
    label: "配信サービス表示とPC向けナビ改善",
    isLatest: false,
    changes: [
      {
        icon: Tv2,
        iconColor: "#0f766e",
        title: "ホームのカードに配信サービスを表示",
        description: "放映カレンダー・視聴中/見たいレーン・今期から追加の各カードに、どのサブスクで見られるかをロゴで表示するようにしました。",
      },
      {
        icon: Menu,
        iconColor: "#6366f1",
        title: "パソコンでも主要ページへ移動しやすく",
        description: "PCなど広い画面でもヘッダーからホーム・Tier・分析・マイリストへ直接移動できるようになりました。",
      },
      {
        icon: BarChart3,
        iconColor: "#f59e0b",
        title: "分析ページがすぐ開けるように",
        description: "サブスク未登録でもジャンルや声優の分析をすぐ確認できるようになりました。サブスク登録は分析ページからいつでも行えます。",
      },
      {
        icon: Zap,
        iconColor: "#ec4899",
        title: "サブスク設定は変更した瞬間に保存",
        description: "設定画面のサブスクのチェックは変更するとすぐに保存されるようになりました。",
      },
    ]
  },
  {
    version: "1.38",
    date: "2026-07-03",
    label: "配色修正とはじめての方向けの改善",
    isLatest: false,
    changes: [
      {
        icon: Sparkles,
        iconColor: "#0f766e",
        title: "ライトテーマの配色を修正",
        description: "ライトテーマでボタンや強調表示の色が表示されない不具合を修正しました。",
      },
      {
        icon: Compass,
        iconColor: "#6366f1",
        title: "はじめての画面を刷新",
        description: "ログイン前のトップからTier表と使い方ガイドへすぐ移動できるようになり、できることを一目で確認できます。",
        href: "/guide",
      },
      {
        icon: UserCheck,
        iconColor: "#f59e0b",
        title: "ログインが必要な場面の案内を追加",
        description: "ログインが必要なページや操作では、突然画面が切り替わらず理由とログイン導線を表示するようにしました。",
      },
    ]
  },
  {
    version: "1.37",
    date: "2026-07-01",
    label: "シェア画面に配信サービスを表示",
    isLatest: false,
    changes: [
      {
        icon: Tv2,
        iconColor: "#6366f1",
        title: "Tier表にサブスクアイコンを表示",
        description: "シェアされたTier表の各作品に配信中のサブスクアイコンを表示しました。",
        href: "/tier",
      },
    ]
  },
  {
    version: "1.36",
    date: "2026-07-01",
    label: "シェアページを刷新",
    isLatest: false,
    changes: [
      {
        icon: Share2,
        iconColor: "#6366f1",
        title: "コメントと作成導線に集約",
        description: "シェアページからいいねを廃止し、コメントと「自分のシェアカードを作る」導線に集約しました。",
        href: "/tier",
      },
    ]
  },
  {
    version: "1.35",
    date: "2026-07-01",
    label: "使い方ガイドを追加",
    isLatest: false,
    changes: [
      {
        icon: BookOpen,
        iconColor: "#6366f1",
        title: "使い方ガイドを追加しました",
        description: "メニューの「使い方」から、主要機能をアニメーション付きで確認できます。",
        href: "/guide",
      },
    ]
  },
  {
    version: "1.34",
    date: "2026-06-29",
    label: "新しいナビゲーション（ベータ）",
    isLatest: false,
    changes: [
      {
        icon: Smartphone,
        iconColor: "#6366f1",
        title: "5タブ＋マイページを試せるようになりました",
        description: "設定から「新しいナビ」をONにすると、マイリストとマイページを含む5タブのナビゲーションを試せます。",
        href: "/settings",
      },
    ]
  },
  {
    version: "1.33",
    date: "2026-06-28",
    label: "マイリストからワンタップで削除",
    isLatest: false,
    changes: [
      {
        icon: Trash2,
        iconColor: "#ef4444",
        title: "カードからすぐに削除",
        description: "マイリストのポスターカードに削除ボタンを追加しました。編集画面を開かず、カードからワンタップで作品を削除できます。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.32",
    date: "2026-06-28",
    label: "マイリストにTierランクバッジを表示",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#f59e0b",
        title: "マイリストカードにTierバッジ",
        description: "視聴リストのポスターカードに、Tier表でユーザーが付けたS/A/Bなどのランクバッジを表示するようになりました。ステータスバッジの反対側（左上）に色付きの小さいピルで表示され、一覧で自分の評価がわかります。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.31",
    date: "2026-06-28",
    label: "ホームから今期 / 来期の作品を横スワイプで追加",
    isLatest: false,
    changes: [
      {
        icon: Bookmark,
        iconColor: "#6366f1",
        title: "今期 / 来期から横スワイプで追加",
        description: "ホームの追加セクションを横スワイプのポスターレーンに刷新しました。今期 / 来期を切り替えながら、気になる作品を「見たい」「視聴中」でワンタップ追加できます。",
        href: "/",
      },
    ]
  },
  {
    version: "1.30",
    date: "2026-06-27",
    label: "ホームを「マイリスト」に刷新（横スワイプのレーン表示）",
    isLatest: false,
    changes: [
      {
        icon: ListChecks,
        iconColor: "#6366f1",
        title: "ホームを「マイリスト」に刷新",
        description: "ホームを視聴管理リスト中心に作り直しました。「続きを見る」「今期 / 来期 / その他」「見たい」を横スワイプで一覧でき、下に今週の放映カレンダーを表示します。",
        href: "/",
      },
      {
        icon: Sparkles,
        iconColor: "#f59e0b",
        title: "新しい視聴管理リストを全員に",
        description: "ポスターカードと話数の進捗バーで見やすくした新デザインの視聴管理リストを全ユーザーに導入しました。ライト / ダークのテーマにも追従します。",
        href: "/watchlist",
      },
      {
        icon: BarChart3,
        iconColor: "#10b981",
        title: "分析タブをシンプルに",
        description: "分析タブは加入中サブスクのカバー率を中心に整理し、ひと目で分かるようにしました。",
        href: "/dashboard",
      },
      {
        icon: Menu,
        iconColor: "#0ea5e9",
        title: "ナビをすっきり整理",
        description: "下部ナビをホーム / Tier / 分析に整理しました。",
      },
    ]
  },
  {
    version: "1.29",
    date: "2026-06-27",
    label: "ヘッダー・フッター・メニューのダークモード対応",
    isLatest: false,
    changes: [
      {
        icon: Menu,
        iconColor: "#0ea5e9",
        title: "ヘッダー・フッター・メニューのダークモード対応",
        description: "GlobalNav、MobileNav、ハンバーガードロワーをテーマトークンに追従させ、ダークモードでも適切な配色で表示されるようにしました。",
      },
    ]
  },
  {
    version: "1.28",
    date: "2026-06-27",
    label: "共有された視聴リストも今期/来期セクションごとに横スライドで見やすく",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#6366f1",
        title: "共有リストを「今期 / 来期 / その他」に分けて横スライダー表示",
        description: "視聴管理リストを共有したとき、相手の画面でも今期・来期・その他のセクションに分かれ、それぞれ横スワイプで作品を見られるようにしました。自分の視聴管理リストと同じ並びで共有相手にも伝わります。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.27",
    date: "2026-06-26",
    label: "共有ボタンがスマホのシェアシートに対応してよりライトに",
    isLatest: false,
    changes: [
      {
        icon: Share2,
        iconColor: "#0ea5e9",
        title: "視聴リスト・Tier表・分析の共有がOSのシェアシートに対応",
        description: "これまで共有ボタンはURLをコピーするだけでしたが、スマホではタップするとそのままLINEやXなどのシェアシートが開くようにしました。共有先をすぐ選べてよりライトに共有できます（非対応の環境では従来どおりURLをコピーします）。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.26",
    date: "2026-06-26",
    label: "視聴管理リストを今期/来期で分けて表示＋作品ごとに1タップでシェア",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#6366f1",
        title: "視聴管理リストを「今期 / 来期 / その他」に分けて表示",
        description: "今期と来期の変わり目に向けて、視聴中の今期作品とこれから見たい来期作品を別々のセクションで管理できるようにしました。各セクションには年・シーズン・件数を表示します。",
        href: "/watchlist",
      },
      {
        icon: Share2,
        iconColor: "#0ea5e9",
        title: "各作品から1タップで布教カードをシェア",
        description: "これまでメニューの中に隠れていた布教カード作成を、各作品のシェアアイコンから直接呼び出せるようにしました。気に入った作品をよりライトに共有できます。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.25",
    date: "2026-06-26",
    label: "放映カレンダーに「これから放送」の作品を放送開始日つきで表示",
    isLatest: false,
    changes: [
      {
        icon: CalendarDays,
        iconColor: "#0f766e",
        title: "まだ放送が先の作品も薄め表示＋放送開始日でわかるように",
        description: "登録した作品のうち放送開始がまだ先のものを、これまでは非表示にしていました。今後は同じ曜日レーンに薄め表示し、放送開始日（例: 4/10〜）を添えて「これから放送」だとわかるようにしました。表示ルールは見出しの ⓘ から確認できます。",
        href: "/",
      },
    ]
  },
  {
    version: "1.24",
    date: "2026-06-26",
    label: "視聴管理リストの放映カレンダーから放送中の作品が消える不具合を修正",
    isLatest: false,
    changes: [
      {
        icon: CalendarDays,
        iconColor: "#16a34a",
        title: "視聴管理リストの週間カレンダーに放送中の作品が出ない不具合を修正",
        description: "ホームと同じく、追加した時点の放送予定を使い続けていたため、放送中の作品でもカレンダーに表示されないことがありました。最新の放送スケジュールで曜日別に表示されるようになりました。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.23",
    date: "2026-06-26",
    label: "ホームの放映カレンダーに今期の視聴中作品が表示されない不具合を修正",
    isLatest: false,
    changes: [
      {
        icon: CalendarDays,
        iconColor: "#16a34a",
        title: "今週の放映カレンダーに視聴中・見たい作品が出ない不具合を修正",
        description: "追加した時点の放送予定を使い続けていたため、放送中の今期作品でもカレンダーに表示されないことがありました。最新の放送スケジュールで曜日別に表示されるようになりました。",
        href: "/",
      },
    ]
  },
  {
    version: "1.22",
    date: "2026-06-24",
    label: "さがすページで上位50件しか見られなかった不具合を修正",
    isLatest: false,
    changes: [
      {
        icon: Search,
        iconColor: "#0ea5e9",
        title: "さがすページが上位50件で打ち止めになっていた不具合を修正",
        description: "年代を選んで探した結果が上位50件しか表示されない問題を修正。「もっと見る」で残りの作品も表示できるようになりました。",
        href: "/explore",
      },
    ]
  },
  {
    version: "1.21",
    date: "2026-06-24",
    label: "今期/来期から追加リストで8件以上見られるように",
    isLatest: false,
    changes: [
      {
        icon: ListChecks,
        iconColor: "#0ea5e9",
        title: "「今期/来期から追加」で8件しか見えなかった不具合を修正",
        description: "リストが8件で打ち止めになっていた問題を修正。「もっと見る」で残りの作品も表示できるようになりました。",
        href: "/",
      },
    ]
  },
  {
    version: "1.20",
    date: "2026-06-24",
    label: "ホームの放映カレンダーをスマホ対応・来期アニメも追加できるように",
    isLatest: false,
    changes: [
      {
        icon: Smartphone,
        iconColor: "#0ea5e9",
        title: "放映カレンダーのスマホ表示崩れを修正",
        description: "曜日ごとのカードレーンが画面幅を超えて横にずれる不具合を修正しました。",
        href: "/",
      },
      {
        icon: CalendarDays,
        iconColor: "#16a34a",
        title: "今週の放映カレンダーに来期作品が混ざらないように",
        description: "曜日が一致するだけで来期作品の初回放送日が今週の枠に表示されていた不具合を修正しました。",
        href: "/",
      },
      {
        icon: Bookmark,
        iconColor: "#7c3aed",
        title: "ホームから来期アニメを「見たい」に追加できるように",
        description: "「今期から追加」セクションに今期/来期の切り替えを追加。来期作品はまだ放送前のため「見たい」のみ選べます。",
        href: "/",
      },
    ]
  },
  {
    version: "1.19",
    date: "2026-06-22",
    label: "Tier表の初回読み込み高速化",
    isLatest: false,
    changes: [
      {
        icon: Zap,
        iconColor: "#f59e0b",
        title: "Tier の読み込みを高速化（リロード・直アクセス対応）",
        description: "季節アニメを sessionStorage に永続化し、/tier ページでサーバーシード。カレンダーカードからの遷移も prefetch。ロゴクリックでフルリロードしなくなりました。",
        href: "/tier",
      },
    ]
  },
  {
    version: "1.18",
    date: "2026-06-21",
    label: "ホームを今週の放映カレンダーに刷新",
    isLatest: false,
    changes: [
      {
        icon: CalendarDays,
        iconColor: "#6366f1",
        title: "ホームが今週の放映カレンダーに",
        description: "ホームを開くと、視聴中・見たい作品が曜日別の放映カレンダーで表示されるようになりました。今日の曜日へ自動でスクロールします。",
        href: "/",
      },
    ]
  },
  {
    version: "1.17",
    date: "2026-06-21",
    label: "表示モード廃止・ナビを4タブに統一",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#6366f1",
        title: "シンプル / プロの表示モードを廃止",
        description: "表示モードの切り替えをなくし、すべての機能を1つの画面で使えるようにしました。設定からモード切替の項目も削除しています。",
      },
      {
        icon: Menu,
        iconColor: "#0ea5e9",
        title: "下部ナビを4タブに統一",
        description: "下部ナビゲーションを「ホーム / Tier / 分析 / さがす」の4タブに統一しました。",
      },
      {
        icon: Sparkles,
        iconColor: "#f59e0b",
        title: "Tier表のツールバーを整理",
        description: "よく使う操作（年・期の切り替え／再取得／共有）を前面に残し、フィルタや自動配置・リセットは「⋯」メニューにまとめました。",
        href: "/tier",
      },
    ]
  },
  {
    version: "1.16",
    date: "2026-06-19",
    label: "探すナビ・探索フィルタの整理",
    isLatest: false,
    changes: [
      {
        icon: Search,
        iconColor: "#6366f1",
        title: "「探す」アイコンを虫眼鏡に統一",
        description: "下部ナビと探索ページの「探す」ボタンを、コンパスから虫眼鏡アイコンに変更しました。",
        href: "/explore",
      },
      {
        icon: Filter,
        iconColor: "#0ea5e9",
        title: "探索を年単位のフィルタに簡素化",
        description: "季節（春夏秋冬）の選択を廃止し、年代だけ選べばその年の作品をまとめて探せるようにしました。",
        href: "/explore",
      },
    ]
  },
  {
    version: "1.15",
    date: "2026-06-19",
    label: "放映カレンダーを横スクロールレーンに復元",
    isLatest: false,
    changes: [
      {
        icon: CalendarDays,
        iconColor: "#a07ef7",
        title: "放映カレンダーを横スクロールレーンに復元",
        description: "視聴管理ページの放映カレンダーを、曜日ごとの横スクロールレーンで表示するように戻しました。今日の曜日レーンへ自動スクロールし、ハイライト表示します。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.14",
    date: "2026-06-17",
    label: "ヘッダー集約・視聴解除・サブスク連動フィルタ",
    isLatest: false,
    changes: [
      {
        icon: Menu,
        iconColor: "#6366f1",
        title: "ヘッダーを集約",
        description: "ヘッダーの「探す」アイコンを削除。ユーザーメニューの設定項目をハンバーガードロワーに統合し、サブスクへの導線もドロワーに追加しました。",
      },
      {
        icon: Layers,
        iconColor: "#10b981",
        title: "Tier表のタップヒント・ヘッダー・未分類欄を調整",
        description: "カードタップ時の移動ヒントは初回のみ表示に。スクロール時はヘッダーが自動でコンパクト化。未分類プールはトリガー式のアコーディオンドロワーに変更しました。",
        href: "/tier",
      },
      {
        icon: Trash2,
        iconColor: "#ef4444",
        title: "視聴解除アクションを追加",
        description: "視聴管理リストの作品を視聴解除（削除）できるアクションを追加しました。",
        href: "/watchlist",
      },
      {
        icon: PlayCircle,
        iconColor: "#0ea5e9",
        title: "「今すぐ見放題」がサブスク連動に",
        description: "探索ページの「今すぐ見放題」フィルタが、登録済みのサブスクサービスと連動するようになりました。未登録の場合は従来の動作にフォールバックします。",
        href: "/explore",
      },
    ]
  },
  {
    version: "1.13",
    date: "2026-06-16",
    label: "分析・Tier・探索のUXをスッキリ整理",
    isLatest: false,
    changes: [
      {
        icon: BarChart3,
        iconColor: "#6366f1",
        title: "分析タブを整理してスッキリ",
        description: "「今夜何見る」「最近更新した作品」「更新情報リンク」を削除。ジャンルと声優を横棒グラフで表示し、制作会社欄を廃止。ジャンル名も日本語に変換しました。",
        href: "/dashboard",
      },
      {
        icon: Layers,
        iconColor: "#10b981",
        title: "Tierツールバーを整理",
        description: "使われにくい「表出力（PNG）」ボタンを削除。「Tier追加」ボタンをリスト末尾に移動し、「リセット」ボタンに文字ラベルを追加しました。",
        href: "/tier",
      },
      {
        icon: Compass,
        iconColor: "#0ea5e9",
        title: "探索ページの案内を統合",
        description: "「ボードに戻る」ボタンを削除し、重複していたページタイトルとから文言案内を一本化しました。",
        href: "/explore",
      },
    ]
  },
  {
    version: "1.12",
    date: "2026-06-15",
    label: "Tierデータをホームで先読みして高速化",
    isLatest: false,
    changes: [
      {
        icon: Zap,
        iconColor: "#f59e0b",
        title: "Tierデータをホームで先読みして高速化",
        description: "ホーム表示時に今期アニメをバックグラウンドで先読みし、Tierページとキャッシュを共有。ホームからTierへ遷移したときの表示を速くしました。",
        href: "/tier",
      },
    ]
  },
  {
    version: "1.11",
    date: "2026-06-15",
    label: "ホームに「今期から追加」導線を実装",
    isLatest: false,
    changes: [
      {
        icon: Compass,
        iconColor: "#6366f1",
        title: "ホームに「今期から追加」セクションを追加",
        description: "未登録の今期アニメを人気順で表示し、その場で「見たい」「視聴中」に登録できます。登録後は視聴中・見たいセクションへ即時反映されます。",
        href: "/",
      },
    ]
  },
  {
    version: "1.10",
    date: "2026-06-15",
    label: "視聴済み話数の手入力廃止",
    isLatest: false,
    changes: [
      {
        icon: ListChecks,
        iconColor: "#10b981",
        title: "視聴済み話数の手入力を廃止",
        description: "視聴管理の「何話まで見た？」ステッパーを削除しました。ホームは視聴中の作品を手入力なしで一覧表示するシンプルな構成に戻しています。",
        href: "/watchlist",
      },
      {
        icon: Tv2,
        iconColor: "#6366f1",
        title: "ホームを視聴中ベースに簡素化",
        description: "シンプル・プロ両モードで「今すぐ見られる」を「視聴中」に変更。未視聴話数の計算に依存せず、ステータスが視聴中の作品をそのまま表示します。",
        href: "/",
      },
    ]
  },
  {
    version: "1.9",
    date: "2026-06-14",
    label: "ナビ・バッジ・視聴リズム整理",
    isLatest: false,
    changes: [
      {
        icon: Smartphone,
        iconColor: "#6366f1",
        title: "下部ナビをモード別に出し分け",
        description: "シンプルはホーム／視聴中／さがす／サブスク、プロはホーム／Tier／分析／探索の4本に。HOME_DESIGN_OPTIONS の宿題を反映。",
      },
      {
        icon: Bookmark,
        iconColor: "#f59e0b",
        title: "PWAバッジを未視聴最新話の作品数に変更",
        description: "今日放送の本数ではなく、視聴中で未視聴話が残っている作品数をホーム画面アイコンに表示します（watchedEpisodes 入力済みのみ）。",
        href: "/watchlist",
      },
      {
        icon: ListChecks,
        iconColor: "#10b981",
        title: "視聴リズム設定を廃止",
        description: "ペルソナ議論で不要と判断された「毎週リアタイ／まとめて見る／ゆっくり見る」の選択UIを削除しました。",
        href: "/watchlist",
      },
    ]
  },
  {
    version: "1.8",
    date: "2026-06-14",
    label: "モード別ホーム刷新",
    isLatest: false,
    changes: [
      {
        icon: Layers,
        iconColor: "#6366f1",
        title: "ホームをモード別（シンプル S3 / プロ P3）に刷新",
        description: "アンケート結果（サブスク派メイン、C案最多）を反映。シンプルは「今すぐ見られる／これから配信／見たい」、プロは進捗バー＋未視聴キャッチアップ＋最近の記録＋Tierリンク。watchedEpisodes未入力時の未視聴過大表示を調整。",
        href: "/",
      },
    ]
  },
  {
    version: "1.6",
    date: "2026-06-13",
    label: "パーソナルホーム実装・ナビ改善・カレンダーUX刷新",
    isLatest: false,
    changes: [
      {
        icon: Tv2,
        iconColor: "#6366f1",
        title: "トップページがパーソナルホームに",
        description: "アプリを開くと「今夜放映」「視聴中」「見たい」の3レーンで自分の視聴状況が一目でわかるホーム画面になりました。",
        href: "/",
      },
      {
        icon: Smartphone,
        iconColor: "#10b981",
        title: "下部ナビを4本に整理",
        description: "モバイル下部タブをホーム・視聴中・Tier・分析の4本に集約しました。サブスクはハンバーガーメニューからアクセスできます。",
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
