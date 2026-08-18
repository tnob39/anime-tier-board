---
title: Current Project State
status: current
updated: 2026-08-18
sources:
  - ../docs/UX_DIRECTION.md
  - ../docs/UX_ABEMA_IA_REDESIGN_20260626.md
  - ../docs/UIUX_RECONSIDERATION_20260711.md
  - ../docs/architecture/release-data-ssot.md
  - ../docs/orchestration/AGENT_EXECUTION_CONTRACT.md
  - ../AGENTS.md
  - ../components/MobileNav.tsx
  - ../lib/nav-flag.ts
---

# Current Project State

実装済み事実と、方針・将来要件を混ぜない。可変状態は GitHub / コードで再確認する。

## Stable Direction（Decision）

- **スマホファースト**: 新規・変更 UI は 375px 起点、44px 以上のタップ領域。
- **現行 IA 方針は方針④（5 タブ）**: ホーム `/` · Tier `/tier` · さがす `/explore` · マイリスト `/watchlist` · マイページ `/mypage`。正本は [`docs/UX_ABEMA_IA_REDESIGN_20260626.md`](../docs/UX_ABEMA_IA_REDESIGN_20260626.md)。入口索引は [`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)。
- **方針③（4 タブ・watchlist 非タブ・マイページ不採用）は Historical**。現行として書かない。
- **表示設定**: Visual / Simple は同一機能の見た目切替。simple/pro による IA 分岐は復活させない。正本は [`docs/UIUX_RECONSIDERATION_20260711.md`](../docs/UIUX_RECONSIDERATION_20260711.md)。
- UI 文言は日本語。編集ファイルは UTF-8。

## Implemented（Current fact）

- Web: Next.js 16 / React 19 / Turso / NextAuth Google。ルート群は `app/` に存在（`/mypage`・`/watchlist`・`/tier` 等）。
- `components/MobileNav.tsx` は **4 タブ配列と 5 タブ配列（V5）の両方を保持**。V5 は `lib/nav-flag.ts` の `numanie:nav-v5`（localStorage）で切替。フラグ未設定時のデフォルト表示は 4 タブ側。
- ネイティブクライアントコードは `apps/native/` に存在（公開ゲートは別 SSOT / Issue 群で管理）。
- マルチエージェント実行契約 Contract v1.0 が [`docs/orchestration/AGENT_EXECUTION_CONTRACT.md`](../docs/orchestration/AGENT_EXECUTION_CONTRACT.md) にあり、編集または Issue claim の前に ACK 検証が必須（読み取り・質問回答・読み取り専用レビューでは不要）。
- 季節データ方針の規範文書: [`docs/architecture/release-data-ssot.md`](../docs/architecture/release-data-ssot.md)（Jikan cutoff `2026-09-15T00:00:00Z`）。実装の追随状況はコードと関連 Issue で確認する。

## Active Development Characteristics

- Claude / Codex / Grok 等が別 Orca worktree で並行する。
- 協調チャネルは GitHub Issue/PR のラベルとコメント（`todo` → `in-progress` → `review` → `ready-to-merge` → `merge-pending`）。
- 編集・マージ前に live な ownership / `in-progress` / `merge-pending` を照会する。
- watchlist 等で実験バリアントが共存しうる。現行ルート配線を確認してから仮定しない。

## Known Knowledge Risks

- 設計文書は撤回済み提案を履歴として残す。警告と最新オーナー承認セクションを優先する。
- plans / reviews は「すでにマージ済み・置換済み・破棄済み」の記述を含みうる。
- `main` は頻繁に動く。本ページをコード確認の代替にしない。
- GitHub 状態をここへ権威としてキャッシュしない。

## Near-Term Wiki Expansion（将来・未作成）

コンポーネントページは次タスクが必要とするときだけ追加する。候補:

1. Home calendar と季節境界
2. Watchlist バリアントとナビフラグ
3. Tier ランキング / 人気度 / ステータス同期
4. 共有モデルと公開ページ
5. 認証・ネイティブセッション・Turso 所有境界

## Open Questions

- どの領域がセッション横断で最も繰り返し読まれているか。
- 大きな UX 文書から小さな ADR への昇格をいつ行うか。
- Wiki 規模がどの時点で決定的な link/staleness checker を正当化するか。

## Related

- [Architecture](./architecture.md)
- [Sources](./sources.md)
- [`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)
