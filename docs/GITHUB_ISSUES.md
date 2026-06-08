# GitHub Issues 運用（kanban 廃止後）

**リポジトリ**: [tnob39/anime-tier-board](https://github.com/tnob39/anime-tier-board)  
**更新**: 2026-06-07

`kanban-board.md` は廃止しました。タスクの唯一のソース・オブ・トゥルースは **GitHub Issues** です。

## 基本ルール

| 操作 | コマンド / 場所 |
|------|----------------|
| 一覧 | `gh issue list --repo tnob39/anime-tier-board` |
| 詳細 | `gh issue view <番号> --repo tnob39/anime-tier-board` |
| 着手 | Issue にコメント + `orca worktree set --comment "issue #N in progress"` |
| 完了 | PR マージ後 `gh issue close <番号>` |
| レビュー待ち | ラベル `review-needed` を付与 |

## ラベル

| ラベル | 用途 |
|--------|------|
| `enhancement` | 機能追加・改善 |
| `worktree` | Orca worktree で実装するタスク |
| `review-needed` | 実装完了・レビュー待ち |
| `documentation` | ドキュメントのみ |

## Issue 本文テンプレート

```markdown
## 概要
（1〜2文）

## Worktree
- 表示名: `composer-dev`
- ブランチ: `tnob39/composer-dev`

## 参照
- `plans/xxx.md`

## 完了条件
- [ ] ...
- [ ] `npx tsc --noEmit` / `npm run build` 成功

## 運用
完了時に本 Issue を close。
```

## エージェント向け

1. 着手前に **Issue 番号** を確認（`gh issue list` または URL）
2. worktree 作成時: `orca worktree create --name <name> --comment "issue #N" ...`
3. 動的指示は `.claude/orchestration/instructions/` に置き、Issue 番号を `Task ID` に含める
4. **kanban-board.md は更新しない**（参照もしない）

## 現在の Open Issues

| # | タイトル | Worktree |
|---|----------|----------|
| [#1](https://github.com/tnob39/anime-tier-board/issues/1) | TMDb Watch Providers カード表示 polish | composer-dev |
| [#2](https://github.com/tnob39/anime-tier-board/issues/2) | 今夜何見る？（decide-tonight） | feature-new-features |
| [#3](https://github.com/tnob39/anime-tier-board/issues/3) | airing データ調査・改善 | （調査） |
| [#4](https://github.com/tnob39/anime-tier-board/issues/4) | エラー処理共通化 Phase 1 | error-catching |

---

Orca 操作の詳細: [ORCA_GUIDE.md](../ORCA_GUIDE.md)