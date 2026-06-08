# エラー処理共通化 — 設計プラン（エージェント共有）

**作成**: 2026-06-08  
**オーナー**: loher（Hermes Orchestrator）  
**実装 worktree**: `error-catching`（`tnob39/chore-error-catching`）  
**ステータス**: 設計確定 → Phase 1 実装待ち

> タスク管理: GitHub Issues（`kanban-board.md` は廃止・触らない）  
> 並行タスク: [#1 TMDb UI polish](https://github.com/tnob39/anime-tier-board/issues/1)（`composer-dev`）、[#2 decide-tonight](https://github.com/tnob39/anime-tier-board/issues/2)、[#3 airing 調査](https://github.com/tnob39/anime-tier-board/issues/3)

---

## 1. 目的

| 課題 | 共通化後の目標 |
|------|----------------|
| DB（Turso）例外が route で未処理 | 全 API が **同じ JSON 形**で 4xx/5xx を返す |
| TMDb enrich 失敗が黙る | **200 のまま** `enrichWarning` でユーザーに伝える |
| クライアントの fetch 処理が重複 | `fetchJson` に集約（段階的） |
| エージェント並行でコンフリクト | **ファイル所有権**と **マージ順**を文書化 |

**スコープ外（本プランではやらない）**

- `streaming-providers` の「1作品失敗は黙る」**内部ロジックの変更**（挙動維持、統計だけ追加）
- `TierBoardApp.tsx` の大規模 `fetchJson` 置換（Phase 3）
- Sentry 導入
- `composer-dev` 上の TMDb ピル UI・CSS

---

## 2. 並行作業とのバッティング回避

### 2.1 進行中（触らない／譲る）

| Issue | Worktree | 所有ファイル（機能側が優先） |
|-------|----------|------------------------------|
| #1 | `composer-dev` | `explore-client.tsx`（ピル・フィルタ UI）、`globals.css`（配信表示スタイル）、`TierBoardApp` の **TMDb 表示まわり** |
| #2 | `feature-new-features` | `app/` 配下の新機能ページ一式 |
| #3 | 調査 | `lib/anime-sources/*` の airing 拡張（調査結果まで） |

### 2.2 本タスクの所有（error-catching が編集可）

| 種別 | パス |
|------|------|
| **新規** | `lib/errors/*`, `lib/api/with-api-route.ts`, `lib/http/fetch-json.ts` |
| **新規** | `app/error.tsx`, `app/global-error.tsx`（Phase 2） |
| **API のみ** | `app/api/**/route.ts`（handler のラップ・レスポンス形） |
| **最小 client** | `TierBoardApp.tsx` の **statuses 読込 `.catch` のみ**（1 ブロック） |
| **seasonal** | `route.ts` の enrich **統計・warning フィールド追加**（`buildProviderMap` の戻り拡張は **stats のみ**） |

### 2.3 共有ファイル — 編集ルール

| ファイル | error-catching | composer-dev (#1) |
|----------|----------------|-------------------|
| `app/api/anime/seasonal/route.ts` | ラップ・`enrichStats`/`warnings` 追加 | enrich 呼び出し順・limit は **main マージ後に rebase** で追随 |
| `lib/streaming-providers.ts` | `buildProviderMapForItems` が `{ map, stats }` を返すよう **末尾に追加**（既存 Map 返却はラッパーで互換） | ロゴ・検索改善は **stats 追加行を触らない** |
| `explore-client.tsx` | Phase 2 まで **触らない** | UI 自由 |
| `components/TierBoardApp.tsx` | Phase 1: statuses fetch のみ | それ以外は composer-dev |

### 2.4 マージ順（必須）

```
1. main に plans/error-catching-20260608.md + worktrees/error-catching.md をマージ（設計のみ）
2. error-catching ブランチで Phase 1 → PR → main
3. composer-dev は main を rebase/merge してから UI 作業継続
4. Phase 2（fetchJson + explore）は #1 close 後 or explore のみ別 PR
```

**コンフリクト時の優先**: 機能 UI は composer-dev、エラー JSON 契約は error-catching（契約は本 doc §3 に固定）。

---

## 3. API 契約（全エージェント共通）

### 3.1 エラーレスポンス

```ts
// lib/errors/types.ts
export type ApiErrorBody = {
  error: string;       // ユーザー向け日本語（必須）
  code?: string;       // 機械可読: UNAUTHORIZED | VALIDATION | UPSTREAM | DATABASE | INTERNAL
  requestId?: string;  // Phase 1 から optional（stderr と同じ ID）
};
```

| HTTP | code 例 | 用途 |
|------|---------|------|
| 400 | `VALIDATION` | JSON 不正・パラメータ |
| 401 | `UNAUTHORIZED` | 未ログイン |
| 413 | `VALIDATION` | payload 过大 |
| 502 | `UPSTREAM` | AniList/Jikan/TMDb/画像 upstream |
| 503 | `DATABASE` | Turso・設定不足 |
| 500 | `INTERNAL` | その他（本文は汎用、詳細はログのみ） |

### 3.2 季節 API 成功レスポンス（拡張）

既存フィールドは **破壊しない**。追加のみ:

```ts
type SeasonalApiResponse = {
  // 既存: year, season, items, source, cached, warning?, generatedAt, ...
  enrichWarning?: string;  // 日本語1行。例: 「配信情報の一部を取得できませんでした（3件）。」
  enrichStats?: {
    attempted: number;
    failed: number;
    credentialsMissing: boolean;
  };
};
```

**ルール**

- AniList/Jikan が失敗 → 従来どおり **502**（`error` + `code: UPSTREAM`）
- 季節取得成功 + TMDb 一部失敗 → **200** + `enrichWarning`（`failed > 0` かつ credentials あり）
- credentials なし → `enrichStats.credentialsMissing: true`、**enrichWarning は出さない**（現状どおり）

### 3.3 ログ（サーバー）

```ts
// lib/errors/log.ts — 1行 JSON を stderr
logApiError({ route, requestId, code, userId?, cause })
```

- **クライアントに stack / Turso 生メッセージを出さない**
- `expose: true` の `AppError` のみ `error` 本文に upstream メッセージを載せる（季節 502 用）

---

## 4. モジュール構成

```
lib/errors/
  app-error.ts      # class AppError
  types.ts          # ApiErrorBody, ErrorCode
  to-response.ts    # toErrorResponse(unknown): NextResponse
  log.ts            # logApiError
lib/api/
  with-api-route.ts # export function withApiRoute(name, handler)
lib/http/
  fetch-json.ts     # fetchJson<T>(url, init?) → T | throws ClientRequestError
```

### 4.1 `withApiRoute` 使用例

```ts
// app/api/statuses/route.ts
export const GET = withApiRoute("statuses.GET", async () => {
  const userId = await requireUserId(); // 401 は AppError
  return NextResponse.json({ statuses: await listStatuses(userId) });
});
```

- `requireUserId()` は `lib/api/auth-helpers.ts` に **1 箇所**（重複 auth パターン削減）
- 既存のバリデーション・413 は handler 内のまま

### 4.2 `buildProviderMapForItems` 拡張（互換）

```ts
// 新: export async function buildProviderMapWithStats(...) => { map, stats }
// 旧: buildProviderMapForItems は map のみ返す薄いラッパー（既存呼び出しを壊さない）
```

`stats.failed` = per-item catch した件数。`attempted` = slice した対象数。

---

## 5. 実装フェーズ

### Phase 1（本 PR の範囲）— バッティング最小

| # | タスク | 完了条件 |
|---|--------|----------|
| P1-1 | `lib/errors/*` + `with-api-route` + `requireUserId` | 単体で import 可能 |
| P1-2 | ラップ: `statuses`, `boards`, `watchlist`, `dashboard` | Turso 切れで 503 JSON |
| P1-3 | `seasonal/route.ts`: withApiRoute + enrichStats/warning | 200 で warning 確認可能 |
| P1-4 | `app/error.tsx` | 意図的 throw でフォールバック UI |
| P1-5 | `TierBoardApp` statuses 読込: 失敗時 `setWarning` 1 行 | 黙り失敗解消 |
| P1-6 | `image-proxy`: fetch を try/catch → 502 UPSTREAM | 接続失敗で JSON |

検証: `npx tsc --noEmit` && `npm run build`

### Phase 2（#1 マージ後）

- `fetchJson` + `explore-client` の `loadSeason` のみ
- 残り API route の withApiRoute 化

### Phase 3

- Playwright smoke、`TierBoardApp` の fetch 置換

---

## 6. エージェント向け着手プロンプト（コピペ）

```
Read plans/error-catching-20260608.md and worktrees/error-catching.md first.
Do NOT edit explore UI, globals.css TMDb styles, or TierBoardApp except statuses-fetch block (see plan §2.2).
Work on branch tnob39/chore-error-catching in worktree error-catching.
Implement Phase 1 only. Comment on GitHub Issue for error-catching when starting.
Before PR: npx tsc --noEmit && npm run build
```

---

## 7. GitHub Issue 起票案

**タイトル**: `chore: エラー処理共通化 Phase 1（API + seasonal enrichWarning）`

**ラベル**: `enhancement`, `worktree`

**本文**: 本ファイルへのリンク + Phase 1 チェックリスト（§5）

**Worktree**: `error-catching` / `tnob39/chore-error-catching`

---

## 8. 現状の「拾えているか」への対応マップ

| 経路 | Phase 1 後 |
|------|------------|
| AniList/Jikan 両方失敗 | 従来どおり 502 + 統一 `code` |
| TMDb 一部失敗 | 200 + `enrichWarning` |
| Turso 失敗 | 503 + 日本語 `error` |
| statuses GET 失敗（Tier） | 軽い警告表示 |
| image-proxy 接続失敗 | 502 JSON |

---

## 9. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-08 | 初版。並行 Issue #1–#3 とファイル所有権を定義 |