# Codex ハンドオフ — A2: ボトムナビ5タブ化 + マイページ枠 + ハンバーガー集約（Issue #212 / EPIC #211）

> 設計: `docs/UX_ABEMA_IA_REDESIGN_20260626.md` §3 / オーナー決定（2026-06-29）
> このハンドオフだけで実装可能（コード探索不要）。日本語コメント・文字列は **UTF-8** で出力（mojibake 厳禁）。

## 1. 目的（ただ1つ）

ボトムナビを **4→5タブ** にし、`/mypage` 雛形を新設、ハンバーガーの項目をマイページへ集約する。**フィーチャーフラグで段階導入**し、フラグOFF時は現状と完全に同一挙動を保つ。

## 2. 絶対制約（守らないと差し戻し）

- **フラグOFF時は現状と1px も変わらない**こと（現 `MobileNav` 4タブ・ハンバーガー健在）。
- **バックエンド/API/DB 変更なし**。純フロントのみ。
- **さがす(`/explore`) のオーナー限定(`ownerOnly`)を維持**（アクセス制御を変えない）。→ 非オーナーは実質4タブ表示になるが正しい。
- 既存ゲスト閲覧を壊さない。**新規ログインウォールを足さない**（オーナー決定: ゲストも5タブ全表示）。
- 触るのは「3. ファイル一覧」のみ。tsc/build を通す。

## 3. 作成/編集するファイル一覧

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/nav-flag.ts` | **新規** | フラグ read/write + `useNavV5()` フック |
| `components/ThemeSwitch.tsx` | **新規** | ハンバーガー内テーマ切替UIを部品として抽出（DRY） |
| `app/mypage/page.tsx` | **新規** | マイページ雛形（server） |
| `app/mypage/mypage-client.tsx` | **新規** | マイページ本体（client・リンク集＋テーマ＋ログアウト） |
| `components/MobileNav.tsx` | 編集 | フラグONで5タブ配列に分岐 |
| `components/GlobalNav.tsx` | 編集 | フラグONでハンバーガー非表示＋マイページ導線 |
| `components/HamburgerMenu.tsx` | 編集 | テーマ部を `ThemeSwitch` に置換（挙動不変） |
| `app/settings/settings-client.tsx` | 編集 | フラグ切替トグル追加 |
| `app/globals.css` | 編集 | `/mypage` 用の最小スタイル（既存 hamburger 系クラス流用可） |
| `app/updates/page.tsx` | 編集 | RELEASES 追記（`isLatest: true`） |

## 4. データ契約 / 既存仕様（探索不要）

- 既存 `MobileNav` の現行4タブ: `ホーム(/, exact) / Tier(/tier) / 分析(/dashboard) / さがす(/explore, ownerOnly)`。active判定は `exact ? pathname===href : pathname===href || startsWith(href+"/")`。owner判定は `isOwnerEmail(session?.user?.email)`（`@/lib/owner`）。
- 既存 `HamburgerMenu`: テーマ切替(`useTheme`/`ThemePref`=light/dark/system, `@/lib/theme`)＋「その他」リンク(サブスク`/dashboard?section=subscriptions`・声優`/voice-actors`・設定`/settings`)＋更新情報`/updates`。`GlobalNav` が `isDrawerOpen` で開閉。
- `GlobalNav`: 左=Menuボタン(ハンバーガー起動)＋ロゴ`numanie`(→/)。右=アバター(ログイン時ドロップダウンにログアウト / 未ログイン時 `signIn("google")`)。
- アイコンは `lucide-react`。新タブ用に `ListChecks`(マイリスト)・`User`(マイページ) を使う。

## 5. 実装仕様

### 5.1 `lib/nav-flag.ts`（新規）
```ts
"use client";
import { useEffect, useState } from "react";
export const NAV_V5_KEY = "numanie:nav-v5";
export const NAV_FLAG_EVENT = "numanie-nav-flag";
export function readNavV5(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NAV_V5_KEY) === "1";
}
export function setNavV5(on: boolean): void {
  window.localStorage.setItem(NAV_V5_KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(NAV_FLAG_EVENT));
}
export function useNavV5(): boolean {
  const [on, setOn] = useState(false); // SSR/初回は false=現状ナビ
  useEffect(() => {
    const sync = () => setOn(readNavV5());
    sync();
    window.addEventListener(NAV_FLAG_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(NAV_FLAG_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return on;
}
```
> 初回SSRは false（現状ナビ）→ マウント後にフラグ反映。`MobileNav`/`GlobalNav` は既に `"use client"` なのでちらつきは許容。

### 5.2 `components/ThemeSwitch.tsx`（新規）
- 現 `HamburgerMenu` 内のテーマ切替セクション（`themeOptions` + `theme-switch` ラジオ群 + `useTheme`）を**そのまま**部品化。props 不要。

### 5.3 `components/MobileNav.tsx`（編集）
- `useNavV5()` を呼ぶ。フラグONなら下記5タブ配列、OFFなら現行配列を使う（既存ロジックは維持）。
```ts
const NAV_ITEMS_V5: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/tier", label: "Tier", icon: Table2, exact: false },
  { href: "/explore", label: "さがす", icon: Search, exact: false, ownerOnly: true },
  { href: "/watchlist", label: "マイリスト", icon: ListChecks, exact: false },
  { href: "/mypage", label: "マイページ", icon: User, exact: false },
];
```
- 分析(`/dashboard`)は5タブ版には**含めない**（マイページへ降格）。ownerOnly フィルタは現行同様に適用（非オーナーは さがす が消え4タブ表示）。

### 5.4 `components/HamburgerMenu.tsx`（編集）
- テーマ切替セクションを `<ThemeSwitch />` に置換するのみ（見た目・挙動は不変）。その他は無変更。

### 5.5 `components/GlobalNav.tsx`（編集）
- `useNavV5()` を呼ぶ。**フラグON時**:
  - 左の Menu(ハンバーガー)ボタンを **マイページ導線** に変更: `<Link href="/mypage" aria-label="マイページ">`（アイコンは `User`）。`<HamburgerMenu>` は**レンダリングしない**（`isDrawerOpen` 関連は OFF 時のみ動作で可）。
  - 右のアバター/ログアウトは現状維持。
- **フラグOFF時**: 現状のまま（ハンバーガー健在）。

### 5.6 `app/mypage/page.tsx` + `mypage-client.tsx`（新規・雛形）
- `page.tsx`(server): `<MyPageClient />` を返すだけ（認証はクライアントの `useSession` で扱う）。`export const metadata = { title: "マイページ | numanie" }` を付ける。
- `mypage-client.tsx`(client): ABEMA 風の凝った作りは **A3(#213) で実装**。本スライスは**雛形＝リンク集**で良い。最低限:
  - アカウント: `useSession()` で名前/メール表示＋ログアウト(`signOut`)。未ログインなら「Googleでログイン」(`signIn("google")`)。
  - リンク行: 分析(`/dashboard`) / サブスク(`/dashboard?section=subscriptions`) / 声優(`/voice-actors`) / 設定(`/settings`) / 更新情報(`/updates`)。各行は `<Link>`＋右矢印(`ChevronRight`)。
  - テーマ: `<ThemeSwitch />` を1セクションとして配置（ハンバーガー廃止でテーマ操作が失われないように）。
- スタイルは既存 `.hamburger-nav-item` 等を流用してよい。新規クラスは `.mypage-*` で最小限。

### 5.7 `app/settings/settings-client.tsx`（編集）
- 「新しいナビを試す」トグルを追加。`readNavV5()` で初期状態、変更時 `setNavV5(checked)`。ラベル例「新しいナビ（5タブ＋マイページ）を試す（ベータ）」。既存トグルUIがあれば同じ見た目に合わせる。

### 5.8 `app/updates/page.tsx`（編集）
- RELEASES 先頭に新バージョン追記、`isLatest: true`（旧最新の `isLatest` を外す）。内容例: 「ナビゲーションを刷新（ベータ）: 設定から『新しいナビ』をONにすると5タブ＋マイページを試せます」。

## 6. 受け入れ条件（完了の定義）

- フラグOFF（既定）: 現状と完全同一（4タブ・ハンバーガー）。
- フラグON: ボトムナビが5タブ（非オーナーは さがす 抜き4タブ）、`/mypage` 表示、ハンバーガー非表示でマイページ導線あり、テーマ操作がマイページから可能。
- 設定ページのトグルで ON/OFF 切替でき、再読込なしで反映（custom event）。
- 未ログインでも5タブ表示・マイページ閲覧でき、新規ログインウォール無し。
- `npx tsc --noEmit` 通過 / `npm run build` 通過。

## 7. スコープ外（やらない）

- マイページの ABEMA 風デザイン・視聴データサマリー・Tier分布（→ A3 #213）。
- さがす(`/explore`) のオーナー限定解除。分析ページ自体の改変。
- PWA manifest 変更（既存 `/watchlist` `/tier` ショートカットは動作継続。任意）。

## 8. 起動メモ（オペレーター用）

- worktree: `feat/a2-nav5tab-mypage`（origin/main ベース）。
- Codex には短い ASCII 指示＋本ファイルパスを渡す。
- 受領後: `git diff` で mojibake/スコープ逸脱チェック → Claude が tsc/build 検収 → コミット代行。
