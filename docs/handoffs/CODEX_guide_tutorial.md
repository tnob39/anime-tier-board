# Codex ハンドオフ — 使い方チュートリアルページ /guide（Issue #262）

> このハンドオフだけで実装可能（コード探索は最小限）。日本語コメント・文字列は **UTF-8** で出力（mojibake 厳禁）。
> 新規 npm 依存を追加しない。バックエンド/API/DB 変更なし。純フロントのみ。

## 1. 目的（ただ1つ）

アプリの使い方を説明する**恒久チュートリアルページ `/guide`**（使い方）を新設し、ハンバーガーメニューと（nav-v5 の）マイページメニューから常時アクセスできるようにする。**CSS アニメーション**によるステップ送りで主要機能を短時間で理解させる。

## 2. 絶対制約（守らないと差し戻し）

- **新規 npm 依存を入れない**。アニメーションは**純 CSS keyframes / transition のみ**（Lottie・framer-motion・GIF・動画アセット禁止）。
- **バックエンド/API/DB 変更なし**。純フロント。
- **未ログインでも閲覧可**（新規ログインウォールを足さない）。
- `prefers-reduced-motion: reduce` で自動再生とアニメを抑制する（必須）。
- 触るのは「3. ファイル一覧」のみ。tsc / build を通す。

## 3. 作成/編集するファイル一覧

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/guide/page.tsx` | **新規** | server。`<GuideClient />` を返す＋`metadata`（title「使い方 \| numanie」）|
| `app/guide/guide-client.tsx` | **新規** | client。ステップカルーセル本体（自動送り＋手動＋ドット） |
| `components/HamburgerMenu.tsx` | 編集 | 「その他」navItems に「使い方」(`/guide`) を追加 |
| `app/mypage/mypage-client.tsx` | 編集 | links 配列に「使い方」(`/guide`) を追加（nav-v5 一貫性） |
| `app/globals.css` | 編集 | `.guide-*` スタイル＋keyframes を末尾に追加 |
| `app/updates/page.tsx` | 編集 | RELEASES 先頭に追記（`isLatest: true`、旧最新の `isLatest` を外す） |

## 4. 既存仕様（探索不要）

- **HamburgerMenu**（`components/HamburgerMenu.tsx`）: `navItems` 配列に `{ href, label, icon }` を並べ、`.hamburger-nav-item` の `<Link>` で描画。アイコンは `lucide-react`。「使い方」には `BookOpen`（lucide）を使う。`onClick={onClose}` を付けること（他項目と同じ）。追加位置は「その他」セクションの navItems 先頭（サブスクの上）。
- **mypage-client**（`app/mypage/mypage-client.tsx`）: `links` 配列（`{ href, label, icon }`）を `.hamburger-nav-item` で描画。ここにも `{ href: "/guide", label: "使い方", icon: BookOpen }` を先頭に追加。
- **updates**（`app/updates/page.tsx`）: `RELEASES: Release[]`。先頭要素が最新。`Release = { version, date, label, isLatest, changes: {icon, iconColor, title, description, href?}[] }`。アイコンは lucide。現在の最新は v1.34。今回は **v1.35** を追加し `isLatest: true`、v1.34 を `isLatest: false` に変更。
- CSS 変数: `--accent` `--surface` `--line` `--muted` `--bg` などが既存（globals.css）。既存のトーンに合わせる。

## 5. 実装仕様

### 5.1 `app/guide/page.tsx`（新規・server）
```tsx
import type { Metadata } from "next";
import { GuideClient } from "./guide-client";

export const metadata: Metadata = {
  title: "使い方 | numanie",
};

export default function GuidePage() {
  return <GuideClient />;
}
```

### 5.2 `app/guide/guide-client.tsx`（新規・client）
- `"use client"`。`useState` で現在ステップ、`useEffect` で自動送り（`setInterval`、既定 5 秒）。
- **ステップ定義（配列）** — 4〜6 枚。各ステップ: `{ key, title, description, demo }`。`demo` は CSS アニメーションを見せる小さな図（下記 5.4 のダミー UI を JSX で組む。実データ不要）。推奨内容:
  1. **ホーム** — 「今期アニメと放映カレンダーをひと目で」。demo=カード群がフェードイン。
  2. **Tier** — 「作品を S/A/B にドラッグでランク付け」。demo=カードが Tier 行にスッと移動するアニメ。
  3. **マイリスト** — 「視聴中をワンタップで管理」。demo=チェック/削除ボタンのタップ波紋。
  4. **サブスク連動** — 「加入サービスで“今すぐ見れる”がわかる」。demo=サービスバッジが順に点灯。
  5. **シェア** — 「布教カードで友達に共有」。demo=共有カードがポップイン。
- **操作 UI**: 「次へ / 戻る」ボタン、ドットインジケーター（クリックでジャンプ）、最後のステップで「はじめる」→ `<Link href="/">`。
- **自動送り**: `prefers-reduced-motion` が reduce のとき、または手動操作後は `setInterval` を張らない/クリアする。`window.matchMedia("(prefers-reduced-motion: reduce)")` で判定。
- ステップ切替は CSS transition（フェード＋スライド）。アクティブなステップだけ表示。
- SSR 安全: 初期ステップ 0 固定。matchMedia は `useEffect` 内で参照（SSR で `window` を触らない）。

### 5.3 導線の追加
- HamburgerMenu: `import { BookOpen, ... }`、navItems 先頭に `{ href: "/guide", label: "使い方", icon: BookOpen }`。
- mypage-client: `import { BookOpen, ... }`、links 先頭に `{ href: "/guide", label: "使い方", icon: BookOpen }`。

### 5.4 `app/globals.css`（末尾に追加）
- `.guide-main`（`app-main` に相当する中央寄せ・max-width 640px 程度）、`.guide-stage`（demo 表示枠）、`.guide-step`（`opacity`/`transform` transition）、`.guide-dots`/`.guide-dot`、`.guide-actions`。
- demo 用 keyframes 例: `@keyframes guide-fade-in`, `guide-slide-in`, `guide-pop-in`, `guide-ripple`, `guide-glow`。
- **`@media (prefers-reduced-motion: reduce)` で `animation: none; transition: none;`** を必ず入れる。
- 既存クラス（`.hamburger-nav-item` 等）を流用してよい。新規は `.guide-*` 名前空間。

### 5.5 `app/updates/page.tsx`
- v1.35 を先頭に追加。例:
  - `version: "1.35"`, `date: "2026-07-01"`, `label: "使い方ガイドを追加"`, `isLatest: true`
  - changes: `{ icon: BookOpen(あるいは既存 import 済アイコン), iconColor: "#6366f1", title: "使い方ガイドを追加しました", description: "メニューの「使い方」から、主要機能をアニメーション付きで確認できます。", href: "/guide" }`
- v1.34 の `isLatest` を `false` に変更。

## 6. 受け入れ条件（完了の定義）

- ハンバーガーの「使い方」から `/guide` に遷移できる（mypage からも）。
- ステップが自動送り＋「次へ/戻る」＋ドットで操作でき、各ステップに CSS アニメーションが付く。
- `prefers-reduced-motion: reduce` で自動送り・アニメが止まる。
- 未ログインでも閲覧可能。
- `npx tsc --noEmit` 通過 / `npx next build --webpack` 通過（`/guide` ルート生成を確認）。新規 npm 依存なし。

## 7. スコープ外（やらない）

- `WelcomeModal`（初回モーダル）の改変。
- 画像/GIF/動画アセット追加、アニメーションライブラリ導入。
- バックエンド/API/DB 変更、ログインウォール追加。

## 8. 起動メモ（オペレーター用）

- worktree: `feat/guide-tutorial`（origin/main=25c6e55 ベース）。node_modules は claude-review から junction 済。
- build は **`npx next build --webpack`**（junction node_modules は Turbopack が弾くため）。
- Codex には短い ASCII 指示＋本ファイルパスを渡す。workspace-write で commit 不可 → Claude が git diff で mojibake/スコープ確認 → tsc/build 検収 → コミット代行 → PR。
