# Worktree Guide — claude-review

**パス**: `C:/Users/Nobu/orca/workspaces/anime-tier-board/claude-review`  
**ブランチ**: `tnob39/claude-review`  
**担当エージェント**: Claude Code  
**更新**: 2026-06-07

> 共通ルール: [ORCA_GUIDE.md](../ORCA_GUIDE.md) / [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md)

---

## この worktree の役割

`explore-client.tsx` など Explore 関連変更の **レビュー・リファイン** 用 worktree です。  
実装の主担当は `composer-dev`、本 worktree は品質確認と annotation フィードバックに集中します。

---

## 起動プロンプト（コピペ用）

```
Read CLAUDE.md, ORCA_GUIDE.md, AGENTS.md, and docs/GITHUB_ISSUES.md first.

You are in Orca worktree claude-review (branch tnob39/claude-review).
Review explore-client and related changes. Do NOT expand scope.
Leave feedback via Orca diff annotations. Run npx tsc --noEmit if you touch code.

Update worktree comment when done:
  orca worktree set --worktree active --comment "review done; N findings" --json
```

---

## レビュー観点

- `onlyInstantWatch` フィルタと既存 `hideMovies` / `hideRerunCandidates` の整合
- `filterAnimeItems` の `TierBoardApp.tsx` との重複・乖離
- 日本語 UI 文字化け
- テスト容易性（useMemo 依存、純関数化の余地）
- スコープ外変更の有無

---

## 主な対象ファイル

- `app/explore/explore-client.tsx`
- `components/TierBoardApp.tsx`（共有フィルタロジック）
- `plans/explore-instant-watch-filter-prep.md`