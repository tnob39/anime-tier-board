# Codex ハンドオフ — 期まとめ布教（シーズン単位・ライブ共有）E1+E2+E3min

> **自己完結ハンドオフ。記載ファイル以外は原則読まずに実装できる。**
> **文字コード必須: すべて UTF-8。日本語 mojibake 厳禁。完了後に日本語表示を目視確認。**
> 設計: `docs/features/season-evangelist-20260627.md`（必読・これに従う）。

## 1. 目的（1つ）
ユーザーの視聴リストから「**その期(シーズン)の作品をまとめてライブ共有**」できる布教機能を追加する。期ごとに1リンク（前期は自然に除外＝期を選ぶ＝切替）。

## 2. スコープ
- **E1**: DBスキーマ `season_share` + `POST /api/share/season`（upsert）+ シーズンJP表記ヘルパー。
- **E2**: `/share/season/[shareId]` の**ライブ表示**ページ（閲覧時に最新の視聴状況を反映）。
- **E3min**: 作成/期切替UIを **`/lab/promote`**（サンドボックスRoute、本番ナビ非掲載）に置く。
- **スコープ外**: 本番ナビ/マイリストヘッダーへの統合（S1マージ後に別途）。OGP画像。閲覧者側の期タブ切替。

## 3. 絶対制約
- `app/watchlist/watchlist-client.tsx` / `lib/statuses.ts` を**編集しない**（参照のみ）。
- 既存の `lib/evangelist-cards.ts` / `lib/shares.ts` / `/api/watchlist/shares` を**壊さない**（参照・流用は可、破壊的変更不可）。
- ビルド検証は `npx tsc --noEmit` と **`npx next build --webpack`**（既定Turbopackはこの環境のnode_modules junctionで失敗する＝環境要因）。
- UTF-8・mojibakeなし。

## 4. データ契約（既存・流用）
```ts
// lib/statuses.ts（編集禁止）
type ViewingStatus = "planned" | "watching" | "completed" | "paused" | "dropped";
type AnimeStatusRecord = { animeId; status; anime: AnimeItem|null; favoriteLevel; watchSlot; notes; watchRhythm; watchedEpisodes; updatedAt };
async function listStatuses(userId: string): Promise<AnimeStatusRecord[]>; // ライブ取得元
// lib/types.ts（既存）: AnimeItem に title, proxiedImageUrl, siteUrl, genres?, season?(AnimeSeason|string|null), seasonYear?(number|null)
// lib/season.ts（既存）: getCurrentAnimeSeason(): {season:AnimeSeason; year:number}; normalizeSeason(v): AnimeSeason|null; type AnimeSeason="WINTER"|"SPRING"|"SUMMER"|"FALL"
// lib/streaming-services.ts（既存）: getStreamingProviders(anime): StreamingProvider[]
// lib/evangelist-cards.ts（既存）: normalizeComment(s): string|null  // ≤50字
// lib/turso.ts（既存）: getTursoClient()  // execute({sql,args})
// auth: import { auth } from "@/auth"; const userId = (session?.user as {id?:string})?.id;
```

## 5. 実装仕様

### E1-a スキーマ + helper（新規 `lib/season-share.ts`）
- `ensureSeasonShareSchema()`（`lib/statuses.ts` の ensure パターン踏襲・`create table if not exists` + `catch(()=>undefined)` の alter）:
```
season_share(
  id text primary key,
  user_id text not null,
  season text not null,
  season_year integer not null,
  statuses text not null,           -- "watching,planned,completed"
  comment text,
  created_at text not null default (datetime('now')),
  unique(user_id, season, season_year)
)
```
- `createSeasonShare({userId, season, seasonYear, statuses, comment})`: upsert（`on conflict(user_id,season,season_year) do update set statuses=..., comment=...`）→ 既存IDを返す（無ければ新ID。ID生成は `randomBytes(9).toString("base64url")`）。
- `getSeasonShare(id)`: 1件取得 → `{id,userId,season,seasonYear,statuses:string[],comment}`。
- `lib/season.ts` に **`seasonLabelJa(season, year): string`** を追加（"SPRING"→`${year}春` / SUMMER→夏 / FALL→秋 / WINTER→冬）。

### E1-b API（新規 `app/api/share/season/route.ts`）
- `POST`: auth 必須。body `{ season?, seasonYear?, statuses?, comment? }`。
  - 既定 season/seasonYear = `getCurrentAnimeSeason()`。statuses 既定 `["watching","planned","completed"]`（許可値のみ通す）。comment は `normalizeComment`。
  - `createSeasonShare(...)` → `{ shareId }`。未ログインは 401。

### E2 ライブ共有ページ（新規 `app/share/season/[shareId]/page.tsx` + client）
- SSR: `getSeasonShare(shareId)`。無ければ `notFound()`。
- `listStatuses(rec.userId)` を呼び、`item.anime && normalizeSeason(item.anime.season)===rec.season && item.anime.seasonYear===rec.seasonYear && rec.statuses.includes(item.status)` でフィルタ（**ライブ**）。
- 表示: ヘッダー「{seasonLabelJa} のアニメ」＋comment。本文はポスターカードのグリッド（`anime.proxiedImageUrl`、無ければ既存 `@/components/AnimeCardPlaceholder`）＋配信チップ（`getStreamingProviders`）。ステータス別セクション分けは任意（フラットでも可）。
- メタ情報（データソース/件数デバッグ）は出さない。`app/share/evangelist/[cardId]` の構成・スタイルを参考に。

### E3min 作成/期切替UI（新規 `app/lab/promote/page.tsx` + client）
- `listStatuses` から、ユーザーの作品に存在する (season, seasonYear) を集計して**シーズンセレクタ**を作る（既定=現在の期）。
- 期を選ぶ → `POST /api/share/season` → 返った `shareId` で `/share/season/${shareId}` のURLを表示＋コピー（既存 `lib/share-url.ts` の `shareOrCopyUrl` があれば流用、無ければクリップボード）。
- これが「期切替」: 別の期を選べば別リンク。noindex（`/lab` 配下）。

## 6. 受け入れ条件
- [ ] `season_share` 作成・`POST /api/share/season` upsert 動作（同一期は同ID）。
- [ ] `/share/season/[shareId]` が所有者の最新状況をライブ反映（対象ステータス・期で正しくフィルタ）。
- [ ] `/lab/promote` で期を選んで共有URL生成・期切替できる。
- [ ] V1 `watchlist-client.tsx` / `lib/statuses.ts` 無変更。既存共有・布教を壊さない。
- [ ] `npx tsc --noEmit` ✅ / `npx next build --webpack` ✅ / mojibakeなし。
- [ ] 変更後 commit（このファイルと AGENT_TASK は commit しない）。push/PRはしない（親が実施）。

## 7. スコープ外（やらない）
- マイリスト/ナビへの本統合（S1=#214 マージ後）。OGP画像。閲覧者側 期タブ切替。paused/dropped。
