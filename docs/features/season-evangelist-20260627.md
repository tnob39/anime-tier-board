# 機能設計: 期まとめ布教（シーズン単位・ライブ共有）

> **決定者**: Nobu（オーナー） / **決定日**: 2026-06-27
> **位置づけ**: 布教（エバンジェリスト）機能の拡張。既存の「1作品布教」「全件リスト共有」とは別の新機能。

---

## 1. 要望（オーナー）

- 布教を**1枚ずつ**ではなく**期（シーズン）ごと**にまとめて作れるようにしたい。
- 「視聴中のものを全部布教」だと**期が変わると前期の作品が残って不要**になる。**期を切り替えられる**ようにしたい。

## 2. 現状（コード確認 2026-06-27）

| 機能 | 実体 | 単位 | 形式 |
|------|------|------|------|
| 1作品布教 | `lib/evangelist-cards.ts` / `components/EvangelistCreateModal.tsx` / `/share/evangelist/[cardId]` | 1作品 | スナップショット（作成時に固定） |
| リスト共有 | `lib/shares.ts` / `/watchlist/share/[shareId]` | 全件 | スナップショット・**シーズン区別なし** |

→ 「期スコープ＋切替＋ライブ」の布教は**未実装**。

## 3. 決定事項

1. **期まとめ布教を新設**（専用の共有カード/ページ）。「〇〇の 2026春 アニメ」のように、その期の作品を集約。
2. **ライブ**: 共有リンクは閲覧時に**常に最新**の「その期の対象作品」を反映（作成時スナップショットではない）。
3. **対象ステータス**: `watching`（視聴中）/ `planned`（見たい）/ `completed`（完了）。`paused`/`dropped` は除外。
4. **シーズンごとに1本の共有リンク**: リンク自体が1期スコープなので**前期は自然に除外**される。期を選ぶ＝「切替」。

> これにより「全部布教して前期が残る」問題は構造的に解消。新しい期になったらその期のリンクを共有すればよい。

## 4. データモデル（最小・スキーマ追加のみ）

新テーブル `season_share`（ライブなので作品データは持たず、誰の・どの期・どのステータスかだけ保持）:

```
season_share(
  id          text primary key,   -- 共有ID（URL）
  user_id     text not null,
  season      text not null,      -- WINTER/SPRING/SUMMER/FALL
  season_year integer not null,
  statuses    text not null,      -- 例: "watching,planned,completed"
  comment     text,               -- 任意のひとこと（≤50字、既存 normalizeComment 流用）
  created_at  text not null default (datetime('now')),
  unique(user_id, season, season_year)   -- 同一ユーザー・同一期は1本（再作成は upsert）
)
```

- `unique(user_id, season, season_year)` により**同じ期を再作成しても同じリンク**になる（リンクが散らからない）。

## 5. API

- `POST /api/share/season` body `{ season, seasonYear, statuses?, comment? }` → `{ shareId }`
  - `statuses` 既定 = `["watching","planned","completed"]`。
  - `season/seasonYear` 既定 = `getCurrentAnimeSeason()`（`lib/season.ts`）。
  - upsert（`unique` 制約で同期は同ID）。
- 閲覧は **SSR ページ**で実施（API 不要）。`/share/season/[shareId]`:
  1. `season_share` から `user_id/season/season_year/statuses` を取得。
  2. `listStatuses(userId)` を呼び（**ライブ**）、`anime.season===season && anime.seasonYear===seasonYear && statuses.includes(status)` でフィルタ。
  3. レンダリング。

## 6. UI

### 作成・切替（オーナー側）
- 入口: マイリスト（V2 #214 のヘッダー「共有」内、または布教メニュー）に「**今期まとめを布教**」。
- **シーズンセレクタ**: ユーザーの登録作品から存在する期を列挙し選択（既定は現在の期）。選ぶと該当期のリンクを作成/取得 → コピー/ネイティブ共有。
- 既存のリスト共有（全件）と並列で提供。

### 共有ページ `/share/season/[shareId]`
- ヘッダー: 「{authorName} の {2026春} アニメ」＋任意コメント。
- 本文: 対象作品をポスターカードのグリッド/レーンで表示（配信サービスチップ付き、`getStreamingProviders` 流用）。ステータス別にセクション分けも可。
- フッター: アプリ導線（numanie で自分も作る）。
- 既存の `/share/evangelist` の共有UI・OGP の作りを参考に再利用。

## 7. バックエンド再利用

- `listStatuses`（`anime.season`/`anime.seasonYear` を保持）→ フィルタはアプリ側。
- `lib/season.ts`（`getCurrentAnimeSeason` / `normalizeSeason`）。**JP表記ヘルパー（例 `seasonLabelJa("SPRING",2026)→"2026春"`）を追加**。
- `getStreamingProviders`（`lib/streaming-services.ts`）、`normalizeComment`（`lib/evangelist-cards.ts`）。
- 共有ID 生成・共有ページ構成は `lib/shares.ts` / `/watchlist/share` パターンを踏襲。

## 8. スコープ外 / 既存維持

- 既存の「1作品布教」「全件リスト共有」は残す（置き換えない）。
- `paused`/`dropped` は対象外。
- スナップショット版は作らない（ライブ一本）。

## 9. 未決事項（実装前に確認）

1. 共有ページで**閲覧者が期タブを切り替えられる**ようにするか（既定: 1リンク=1期。切替は作成者側のみ）。
2. ステータス別セクション分けの有無（視聴中/見たい/完了で分けるか、フラット表示か）。
3. OGP 画像（期まとめ用のカードビジュアル生成）を作るか後回しか。

## 10. 実装スライス（→ Issue 子タスク候補）

- **E1**: `season_share` スキーマ + `POST /api/share/season`（upsert）+ `lib/season.ts` JP表記ヘルパー。
- **E2**: `/share/season/[shareId]` ライブ表示ページ（フィルタ・カード・配信チップ）。
- **E3**: 作成/切替UI（シーズンセレクタ + 共有導線）。V2(#214) のヘッダーへ統合。
- **E4**（任意）: OGP 画像・ステータス別セクション・閲覧者側の期切替。
