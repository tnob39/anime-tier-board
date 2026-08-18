---
title: System Architecture
status: current
updated: 2026-08-18
sources:
  - ../AGENTS.md
  - ../package.json
  - ../app
  - ../lib
  - ../apps/native
---

# System Architecture

## Overview

Anime Tier Board（ブランド: numanie）は Next.js 16 App Router + React 19 の Web アプリである。
季節アニメを AniList / Jikan から取得し、ユーザー状態を Turso（libSQL）に保存する。
認証は NextAuth v5（Google OAuth）。ネイティブクライアントは `apps/native/` に存在する。

## Runtime Boundaries

- `app/`: ルート、サーバ/クライアント入口、REST API
- `components/`: 共有 UI（Tier board、ナビ、カードレーン、ホーム追加、放送カレンダー等）
- `lib/`: ドメインロジック、DB、外部 API、キャッシュ、共有、購読、エラー契約
- `apps/native/`: Expo 系ネイティブクライアント（Web と別パッケージ）
- `docs/` / `plans/`: 人間作成の一次資料と計画
- `wiki/`: エージェント向けコンパイル知識とルーティング
- `raw/`: 外部取り込みの不変ソース（リポジトリ文書の複製置き場ではない）

## Major User Routes

| Route | Purpose |
|-------|---------|
| `/` | ホーム（視聴サポート / 放送カレンダー中心） |
| `/tier` | 季節 Tier 表 |
| `/explore` | 探索・過去作（要ログイン。未ログインは `/` へ） |
| `/watchlist` | 視聴管理（マイリスト） |
| `/mypage` | マイページ（分析・設定等へのハブ） |
| `/dashboard` | 分析（底部ナビ本体ではなく、方針④ではマイページ経由） |
| `/subscriptions` | サブスク管理 |
| `/voice-actors` | 声優発見（要ログイン） |
| `/settings` | 設定 |
| `/guide` / `/onboarding` / `/updates` / `/feedback` | ガイド・オンボーディング・更新・フィードバック |
| `/share/*` | 公開共有体験 |
| `/lab/*` | 実験用サンドボックス（本番導線外） |

ラベルや活性タブは変わりうる。実装前に `app/` と現行 UX 正本を確認する。

## Data Flow

1. アニメメタデータ: `lib/anime-sources/` と季節 API（例: `/api/anime/seasonal`）。
2. 視聴ステータス: `lib/statuses.ts` と `/api/statuses`。
3. Watchlist 拡張（お気に入り度・スロット・メモ等）: `/api/watchlist`。
4. Tier 永続化: `lib/boards.ts` と `/api/boards`。
5. 配信 enrich: AniList `streamingEpisodes` + TMDb `streamingProvidersJp.flatrate`。
6. 共有: `lib/` 配下の share 系と `/api/shares`。

## Client and Server Pattern

- App Router ページは必要に応じて認証済みサーバデータを読む。
- クライアントコンポーネントがインタラクティブ状態を持つ。
- API は `lib/api/`・`lib/errors/` の共通ラッパに寄せる。
- 季節クライアントキャッシュ / prefetch:
  `lib/seasonal-anime-client-cache.ts`、`lib/use-seasonal-prefetch.ts`。

## Validation Baseline

実装変更:

```powershell
npx tsc --noEmit
npm.cmd run build
```

ユーザー向け UI は `AGENTS.md` のスマホ幅確認と mojibake 検査も必須。

## Related

- [Current State](./current-state.md)
- [Sources](./sources.md)
- [`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)
