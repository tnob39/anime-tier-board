# Worktree Guide — error-catching

**パス（作成後）**: `C:/Users/Nobu/orca/workspaces/anime-tier-board/error-catching`  
**ブランチ**: `tnob39/chore-error-catching`（`main` から作成）  
**担当**: loher / 実装は grok-composer-2.5-fast 可  
**設計**: [`plans/error-catching-20260608.md`](../plans/error-catching-20260608.md)

> 共通: [AGENTS.md](../AGENTS.md) / [docs/GITHUB_ISSUES.md](../docs/GITHUB_ISSUES.md) / [ORCA_GUIDE.md](../ORCA_GUIDE.md)

---

## 役割

**composer-dev（Issue #1）とファイルを競合させない**エラー基盤専用 worktree。  
Phase 1 のみ。UI polish・TMDb ピルは **ここではやらない**。

---

## worktree 作成（Orca）

```bash
cd /c/Users/Nobu/.claude/anime-tier-board
git checkout main
git pull origin main   # 設計 doc マージ後

orca worktree create --name error-catching --agent grok \
  --prompt "Read worktrees/error-catching.md and plans/error-catching-20260608.md. Implement Phase 1 only." \
  --parent-worktree active --json
```

ブランチが無い場合（手動）:

```bash
git branch tnob39/chore-error-catching main
# Orca が worktree 作成時に checkout する想定
```

着手コメント:

```bash
orca worktree set --worktree active --comment "error-catching P1: lib/errors" --json
```

---

## Phase 1 で触ってよいファイル

- `lib/errors/**`（新規）
- `lib/api/with-api-route.ts`, `lib/api/auth-helpers.ts`（新規）
- `app/api/statuses/route.ts`
- `app/api/boards/route.ts`
- `app/api/watchlist/route.ts`
- `app/api/dashboard/route.ts`
- `app/api/anime/seasonal/route.ts`
- `app/api/image-proxy/route.ts`
- `lib/streaming-providers.ts`（`buildProviderMapWithStats` 追加のみ）
- `app/error.tsx`（新規）
- `components/TierBoardApp.tsx`（**statuses の fetch ブロックのみ**）

## 触らない

- `app/explore/explore-client.tsx`（composer-dev）
- `app/globals.css` の `.explore-*` 配信スタイル
- `TierBoardApp.tsx` の TMDb 表示・DnD・board 保存ロジック
- `kanban-board.md`

---

## 検証

```bash
npx tsc --noEmit
npm run build
```

手動:

1. `/api/anime/seasonal?year=2024&season=SPRING` → JSON、`enrichStats` キー存在
2. （可能なら）TMDb キーありで一部タイトルが enrich 失敗 → `enrichWarning`
3. ログイン後 Tier 表 → statuses API を意図的に失敗させず通常動作

---

## PR / マージ後

1. `composer-dev` で `git merge origin/main` または rebase  
2. `seasonal/route.ts` コンフリクト時は **enrichStats 行を残し**、UI 側の変更は composer-dev を優先  
3. Issue close（error-catching 用）

---

## 完了 comment 例

```bash
orca worktree set --worktree active --comment "P1 done; API 503/502 unified; build OK" --json
```