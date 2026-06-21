# UX 方針③ N1a Codexレビュー（PR #148）

対象: PR #148 / branch `tnob39/issue-129-n1a-mode-removal` / base `origin/main`

確認コマンド:

- `git diff origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `rg -n "useUiMode|UiMode|isSimple|anime-tier-board:uiMode|ui-mode|hamburger-mode|global-nav-home-pc" app components lib --glob '!**/*.md'`

`node_modules` が無いため `npx tsc --noEmit` は未実行。差分と静的参照からレビューした。

## 総評

N1a の主目的である simple/pro モード撤去、下部ナビの単一4タブ化、右上ホームアイコン削除、Tier ツールバーの一軍/二軍整理は概ね達成できている。`useUiMode` / `UiMode` / `isSimple` の実コード参照は残っておらず、`lib/ui-mode.tsx` 削除による直接の import 破壊は見当たらない。

ただし、新設された Tier ツールバーの「その他」メニューは `role="menu"` を名乗っている一方で、ESC クローズ、フォーカス復帰、menuitem 構成が未完成。ここはアクセシビリティ回帰として修正したい。

## Findings

### 🟡 important: 「その他」メニューが `role="menu"` としてキーボード操作・ARIA構造を満たしていない

- file: `components/TierBoardApp.tsx:712`
- file: `components/TierBoardApp.tsx:732`
- file: `components/TierBoardApp.tsx:733`

`aria-haspopup="menu"` / `aria-expanded` と `role="menu"` は追加されているが、開いた後のフォーカス移動、ESC で閉じる処理、閉じた後にトリガーへフォーカスを戻す処理がない。さらに `role="menu"` の直下に `toolbar-more-filters` の `div` と通常の `filter-chip` button が入り、映画OFF/旧作OFF は `role="menuitem"` / `menuitemcheckbox` になっていない。

この状態だと、キーボード利用者はメニューを開いても現在位置が変わらず、ESC で閉じられない。スクリーンリーダーにも「menu」として宣言されるが、中の一部項目がメニュー項目として解釈されない可能性がある。

Suggested fix:

- トリガー button に `ref`、メニュー内の最初の操作に `ref` を持たせ、open 時に最初の項目へ focus、close 時にトリガーへ focus を戻す。
- `toolbarMenuOpen` が true の間だけ `keydown` listener を張り、`Escape` で `setToolbarMenuOpen(false)` する。
- `role="menu"` を維持するなら、映画OFF/旧作OFF は `role="menuitemcheckbox"` + `aria-checked` に寄せる。もしくは厳密な menu widget にしないなら、`role="menu"` / `aria-haspopup="menu"` を外して通常の popover/toolbar group として扱う。

### 🟢 nice-to-have: `HomePro` と `.home-pro-*` は N1c までの意図的残置として問題ないが、削除タイミングを明示したい

- file: `app/home-pro.tsx:149`
- file: `app/globals.css:4931`

`app/home-client.tsx` は `HomeSimple` に一本化され、`HomePro` は現在の Web UI から未参照になっている。N1c のホーム統合で使う可能性があるため、N1a で削除しない判断は許容できる。

Suggested fix:

- PR本文か N1c issue に「`app/home-pro.tsx` と `.home-pro-*` は N1c ホーム統合で削除/統合判断」と明記する。
- N1c 完了時点で未使用なら、`app/home-pro.tsx` と対応 CSS をまとめて削除する。

### 🟢 nice-to-have: 旧 localStorage キー `anime-tier-board:uiMode` は無害だが、将来の混乱を避けるなら整理方針を残す

- file: `app/providers.tsx:6`
- file: `components/MobileNav.tsx:20`

`UiModeProvider` が外れたため、既存ユーザーの `anime-tier-board:uiMode` は読まれず無視される。動作上は問題ない。一方で、設定や検証時に「まだモード設定が残っている」と誤解される可能性はある。

Suggested fix:

- N1a では silent ignore でよい。
- N2 の初回チュートリアル localStorage 方針と合わせて、不要キー削除を行うか、リリースノート/計画に「旧キーは読み捨て」と明記する。

## 確認メモ

- `useUiMode|UiMode|isSimple` の実コード参照はゼロ。`lib/ui-mode.tsx` 削除による import 残りは見当たらない。
- `.ui-mode-*` / `.hamburger-mode-*` / `.global-nav-home-pc` は実装 CSS から削除済み。
- `Tierを追加` は常時表示になり、`自動配置` と `リセット` の disabled 条件はそれぞれ `!board || loading || !items.length` / `!board` のまま保持されている。
- `/watchlist` は下部ナビから外れたが、N1a の暫定状態として HomeSimple のカード押下（`app/home-simple.tsx:94`）と dashboard の「視聴管理へ」（`app/dashboard/dashboard-client.tsx:92`）から到達できる。N1c でホームのカード編集導線に寄せる前提なら許容範囲。
- 右上ホームアイコンは削除済み。ロゴのトップ遷移（`components/GlobalNav.tsx:40`）は残っている。

