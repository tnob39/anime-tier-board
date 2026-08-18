---
title: Anime Tier Board Wiki Index
status: current
updated: 2026-08-18
sources:
  - ../AGENTS.md
  - ../CLAUDE.md
  - ../docs/LLM_WIKI_FOUNDATION.md
---

# Wiki Index

最初のルーティング先。アクティブタスクに必要なページだけ読み、ソースコードまたは
live な GitHub 状態で検証する。

## Core

- [Architecture](./architecture.md) — ランタイム、データフロー、境界、主要ルート
- [Current State](./current-state.md) — 現行方針、実装済みと将来の区別、ドリフト注意
- [Sources](./sources.md) — 一次資料の権威順とレジストリ
- [Log](./log.md) — Wiki 操作の追記専用履歴

## Guides（ページ追加時の契約）

- [Component Page Guide](./components/README.md) — 領域別ページの作り方（中身は将来追加）
- [Decision Page Guide](./decisions/README.md) — ADR 風決定ページの作り方（中身は将来追加）

## Task Routing

| Task | Read first | Then verify |
|------|------------|-------------|
| UI/UX・ナビ | [Current State](./current-state.md)、[`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)、[`docs/UX_ABEMA_IA_REDESIGN_20260626.md`](../docs/UX_ABEMA_IA_REDESIGN_20260626.md) | 影響コンポーネントと 375px 表示 |
| Home・放送カレンダー | [Architecture](./architecture.md) | `app/home-client.tsx`、`components/WeeklyBroadcastCalendar.tsx`、`lib/broadcast-calendar.ts` |
| Watchlist / マイリスト | [Architecture](./architecture.md)、[Current State](./current-state.md) | `app/watchlist/`、`lib/statuses.ts`、`components/MobileNav.tsx` |
| Tier board | [Architecture](./architecture.md) | `components/TierBoardApp.tsx`、`lib/boards.ts` |
| API / DB | [Architecture](./architecture.md)、[Sources](./sources.md) | `app/api/`、`lib/turso.ts`、対象ドメイン lib |
| 季節データ / Jikan | [Current State](./current-state.md)、[`docs/architecture/release-data-ssot.md`](../docs/architecture/release-data-ssot.md) | `lib/anime-sources/`、季節 API |
| マルチエージェント / GitHub | Contract v1.0、`AGENTS.md` | live Issues、PR ラベル、checks、worktree |
| 新プロダクト決定 | [Current State](./current-state.md)、[Sources](./sources.md) | オーナー決定と関連設計一次資料 |
| Wiki 保守 | `CLAUDE.md`、[Sources](./sources.md)、[Log](./log.md) | 変更したソースファイル |

## Planned Component Pages（将来・未作成）

必要になったときだけ作成する。ガイドは [components/README.md](./components/README.md)。

- `components/home-calendar.md`
- `components/watchlist.md`
- `components/tier-board.md`
- `components/sharing.md`
- `components/auth-and-data.md`

## Planned Decision Pages（将来・未作成）

ガイドは [decisions/README.md](./decisions/README.md)。候補例:

- スマホファースト UI
- 方針④（5 タブ IA）
- Issue/PR 可視クレーム運用
- 表示設定 Visual / Simple
