# Codex ハンドオフ — S1: WatchlistClientV2（設定トグルで切替）

> **このファイルは自己完結のハンドオフです。記載のファイル以外は原則読まなくて実装できます。**
> **文字コード必須**: すべて UTF-8 で書き込むこと。日本語 UI 文字列の mojibake（文字化け）を出さない。完了後に日本語表示を目視確認すること。
> 上位方針: `docs/UX_ABEMA_IA_REDESIGN_20260626.md`（方針④ §3.5・§4・§6）。ビジュアル仕様: `docs/mockups/watchlist-abema-mock.html`（ブラウザで開いて AFTER 側を見る）。

---

## 1. 目的（ただ1つ）

`/watchlist` に **ABEMA 風の新UI `WatchlistClientV2`** を追加し、**設定ページのトグルで現状UIと切り替えられる**ようにする。
**バックエンドは変更しない。既存の `WatchlistClient`（V1）も変更しない**（フォールバックとして残す）。

## 2. 絶対制約（守らないと差し戻し）

- `app/watchlist/watchlist-client.tsx`（V1）を**編集しない**（参照のみ可）。
- `lib/statuses.ts` / `app/api/**` を**編集しない**（API は既存契約をそのまま叩く）。
- DB スキーマ変更・マイグレーション**なし**。
- V2 のスタイルは**専用 CSS ファイル** `app/watchlist/watchlist-v2.css` に `wl2-` プレフィックスのクラスで書く（既存グローバルCSSのクラス名と衝突させない）。色はベタ書き可だが mock の配色（ダーク `#0f0f0f`/`#1a1a1a`、アクセント `#22d3ee`）に合わせる。
- トグル OFF（既定）では**現状と完全に同一**の画面が出ること。

## 3. 作成/編集するファイル一覧

**新規作成（5ファイル）**
1. `lib/watchlist-flag.ts` — フラグ helper（localStorage）
2. `app/watchlist/watchlist-switch.tsx` — V1/V2 切替クライアントラッパー
3. `app/watchlist/watchlist-client-v2.tsx` — 新UI本体
4. `app/watchlist/watchlist-v2.css` — V2 専用スタイル
5. （任意）`components/WatchlistV2Toggle.tsx` — 設定トグル UI（settings-client に直接書いてもよい）

**編集（2ファイル・最小差分）**
6. `app/watchlist/page.tsx` — `<WatchlistClient .../>` を `<WatchlistSwitch .../>` に差し替えるのみ
7. `app/settings/settings-client.tsx` — `settings-panel` セクションを1つ追加してトグル設置

## 4. データ契約（これだけで実装可能・探索不要）

```ts
// lib/statuses.ts（既存・編集禁止）より抜粋
export type ViewingStatus = "planned" | "watching" | "completed" | "paused" | "dropped";
export type AnimeStatusRecord = {
  animeId: string;
  status: ViewingStatus;
  anime: AnimeItem | null;
  favoriteLevel: number | null;   // 1..5
  watchSlot: string | null;
  notes: string | null;
  watchRhythm: "weekly" | "batch" | "slow" | null;
  watchedEpisodes: number | null; // ← 進捗（視聴済み話数）。既存。
  updatedAt: string;
};
// lib/types.ts（既存）AnimeItem 抜粋
// title: string; proxiedImageUrl: string; siteUrl: string; episodes?: number | null;
// airing?: {...}; streamingProvidersJp?: {...}; streamingEpisodes?: {...}[];
```

**API（既存・そのまま叩く / 編集禁止）**
- `GET /api/watchlist` → `{ items: AnimeStatusRecord[] }`（※ page.tsx が SSR で `listStatuses` を渡すので V2 は初期データを props で受ける。再取得は任意）
- `PUT /api/watchlist` body `{ animeId, favoriteLevel?, watchSlot?, notes?, watchedEpisodes? }` → トラッキング保存
- `PUT /api/statuses` body `{ animeId, status, anime }` → ステータス変更
- `DELETE /api/statuses?animeId=<id>` → 視聴解除（削除）
- `POST /api/watchlist/shares` → `{ shareId }`（共有URL: `${origin}/watchlist/share/${shareId}`）

> V1 (`watchlist-client.tsx`) に上記を叩く `updateItem` / `updateStatus` / `saveTrackingDraft` / `removeItem` / `createShare` の実装例がある。**ロジックは参照してV2に再実装してよい**（V1は編集しない）。

## 5. 実装仕様

### 5.1 `lib/watchlist-flag.ts`
```ts
"use client";
import { useEffect, useState } from "react";
export const WATCHLIST_V2_KEY = "numanie:watchlist-v2";
export function readWatchlistV2(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WATCHLIST_V2_KEY) === "1";
}
export function writeWatchlistV2(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_V2_KEY, on ? "1" : "0");
}
export function useWatchlistV2(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false); // SSR/初回は false（V1）でハイドレーション一致
  useEffect(() => { setOn(readWatchlistV2()); }, []);
  return [on, (v: boolean) => { writeWatchlistV2(v); setOn(v); }] as const;
}
```

### 5.2 `app/watchlist/watchlist-switch.tsx`
- `"use client"`。`useWatchlistV2()` で分岐し、`true` なら `WatchlistClientV2`、`false` なら `WatchlistClient` を描画。両方に `initialItems` をそのまま渡す。

### 5.3 `app/watchlist/page.tsx`（編集）
- import を `WatchlistSwitch` に変え、`return <WatchlistSwitch initialItems={items} />;` にするだけ。auth/`listStatuses` 部分は変更しない。

### 5.4 `app/settings/settings-client.tsx`（編集）
- 既存の `settings-panel` 群の末尾に新セクションを追加:
  - 見出し例「新しいマイリスト（ベータ）」、説明「ABEMA 風の新しい視聴管理画面を試せます。いつでも元に戻せます。」
  - `useWatchlistV2()` を使ったトグル（チェックボックス or スイッチ）。ON/OFF 即時保存。

### 5.5 `app/watchlist/watchlist-client-v2.tsx`（本体）
props: `{ initialItems: AnimeStatusRecord[] }`。`anime` が null の項目は除外。

**レイアウト（mock AFTER 準拠）**
- sticky ヘッダー: タイトル「マイリスト」+ アバター丸 + 検索入力（`anime.title` の部分一致フィルタ）+ 共有ボタン（`POST /api/watchlist/shares`、結果URLをクリップボードコピー）。
- フィルタチップ（横スクロール）: `すべて / 視聴中 / 予定 / 完了 / 未視聴話あり`。
  - 「未視聴話あり」= `status==="watching" && anime.episodes != null && (watchedEpisodes ?? 0) < anime.episodes`。
- 表示:
  - フィルタ=すべて のとき**セクション分け**（各セクション横スクロールレーン）:
    - 「▶ 現在視聴中」= `watching`
    - 「☆ 気になっている」= `planned`
    - 「✓ 視聴完了」= `completed`
    - 「⏸ 保留中」= `paused` または `dropped`
  - フィルタ指定時は該当集合をグリッド/レーンで一覧。
  - 各セクションは項目0件なら非表示。
- **ポスターカード**:
  - 画像 `anime.proxiedImageUrl`（無ければ `@/components/AnimeCardPlaceholder` を使用）。
  - 右上: ステータスバッジ（視聴中/完了/見たい/保留）。
  - 下部グラデーション + タイトル（2行省略）。
  - `watching` かつ `anime.episodes` 既知なら**進捗バー** + 「`watchedEpisodes ?? 0` / `anime.episodes` 話」。`completed` は「全 N 話 視聴済」。
  - **Tier バッジ（左上 S/A/B）は S1 では出さない**（S3 で対応）。
  - カードタップで編集シートを開く。
- **編集シート（モーダル or ボトムシート）**: 対象作品の編集。
  - ステータスチップ5種（変更時 `PUT /api/statuses`）
  - ★お気に入り 1-5（`favoriteLevel`）
  - **視聴済み話数ステッパー**（−/＋、0..`anime.episodes`、`watchedEpisodes`）
  - いつ見る `watchSlot`（select。選択肢は V1 と同じ: 放送日に見る/週末にまとめて見る/配信されたら見る/時間がある時に見る/未設定）
  - メモ `notes`（textarea, maxLength 500）
  - 保存ボタン（`PUT /api/watchlist` で favoriteLevel/watchSlot/notes/watchedEpisodes を保存。ステータス差分があれば先に `PUT /api/statuses`）
  - 「視聴解除（削除）」（`DELETE /api/statuses?animeId=...`、`window.confirm` 確認）
  - 楽観更新 + 失敗時ロールバック（V1 の実装を踏襲）
- 空状態: 「まだ作品がありません」+「作品を探す」`<Link href="/explore">` + 人気/今期への導線（任意）。
- 既存のグローバルダイアログ（alert/confirm）は `window.confirm` のみ使用可（V1 と同様）。

## 6. 受け入れ条件（完了の定義）

- [ ] 設定トグル OFF（既定）で `/watchlist` が**現状と完全同一**（V1 そのまま）。
- [ ] 設定トグル ON で V2（ポスターカード/セクション/バッジ/進捗/検索/フィルタ/編集シート）が表示。
- [ ] V2 で ステータス変更 / ★ / 話数 / watchSlot / メモ / 削除 / 共有 が既存APIで動作。
- [ ] `app/watchlist/watchlist-client.tsx` と `lib/statuses.ts` と `app/api/**` に差分が無い。
- [ ] `npx tsc --noEmit` と `npm run build` が通る。
- [ ] 日本語文字列に mojibake が無い（目視）。
- [ ] `app/updates/page.tsx` の `RELEASES` に「新しいマイリスト（ベータ）を設定から試せます」を追記し最新版に `isLatest: true`（CLAUDE.md ルール）。

## 7. スコープ外（やらない）

- ナビ5タブ化・マイページ（A2/A3 = 別フラグ・別スライス）。
- Tier バッジのカード表示（S3）。
- おすすめ横スクロール行（S3）。
- バックエンド/スキーマ変更。

## 8. 起動メモ（オペレーター用・Codex には短いASCII指示で渡す）

- worktree: 本スライス専用に main から1つ切る。
- Codex への初手指示（ASCII 短文推奨）: `Read docs/handoffs/CODEX_S1_watchlist_v2.md and implement S1. UTF-8 only.`
- 受領後: 日本語 mojibake 検査 + 差分が §3 の対象ファイルに限定されているか確認 + tsc/build。
