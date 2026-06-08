# Worktree Guide — composer-dev

**パス**: `C:/Users/Nobu/orca/workspaces/anime-tier-board/composer-dev`  
**ブランチ**: `tnob39/composer-dev`  
**担当エージェント**: Grok Composer (`grok-composer-2.5-fast`)  
**更新**: 2026-06-07

> 共通ルール: [ORCA_GUIDE.md](../ORCA_GUIDE.md) / [AGENTS.md](../AGENTS.md) を先に読むこと

---

## この worktree の役割

composer-dev は **Grok Composer による機能実装の主戦場** です。  
Explore フィルタ、TMDb UI、視聴管理カレンダーなど、UI 中心の WIP をここで進めます。

| 項目 | 値 |
|------|-----|
| Orca 表示名 | `composer-dev`（推奨） |
| 親 worktree | anime-tier-board メイン（派生タスクは `--parent-worktree active`） |
| 並列子タスク | 別名 worktree を切る（例: `calendar-next-airing`） |

---

## 起動プロンプト（コピペ用）

```
Read ORCA_GUIDE.md, AGENTS.md, docs/GITHUB_ISSUES.md, and worktrees/composer-dev.md first.

You are in Orca worktree composer-dev (branch tnob39/composer-dev).
Implement only the assigned task. Use a separate worktree for parallel subtasks
that touch different files.

After meaningful progress:
  orca worktree set --worktree active --comment "<short status>" --json

Before finishing:
  npx tsc --noEmit && npm run build
  Comment on or close the GitHub Issue
```

---

## 現在のタスク（GitHub Issues）

| Issue | タスク | 状態 |
|-------|--------|------|
| [#1](https://github.com/tnob39/anime-tier-board/issues/1) | TMDb Watch Providers UI polish | Open |

タスク着手時は Issue と `plans/` を開き、完了時は Issue を close してください。

---

## 触ることが多いファイル

| 領域 | パス |
|------|------|
| Explore UI | `app/explore/explore-client.tsx` |
| 視聴管理 | `app/watchlist/watchlist-client.tsx` |
| 共通フィルタ | `components/TierBoardApp.tsx`（`filterAnimeItems`） |
| TMDb enrich | `lib/streaming-providers.ts`, `app/api/anime/seasonal/route.ts` |
| スタイル | `app/globals.css` |
| 型 | `lib/types.ts`（`StreamingProvidersJp` 等） |

**注意**: `TierBoardApp.tsx` と `explore-client.tsx` の両方にフィルタロジックがある場合、両方を整合させる。

---

## ローカル開発

```powershell
npm.cmd run dev:local
```

| URL | 用途 |
|-----|------|
| http://localhost:3000/explore | フィルタ・TMDb カード確認 |
| http://localhost:3000/watchlist | カレンダーセクション確認 |
| http://localhost:3000 | Tier 表・ナビ |

Orca 内蔵ブラウザ:

```bash
orca goto --url http://localhost:3000/explore --json
orca snapshot --json
```

Google ログインが必要なページは、テスト用アカウントでログインしてから確認。

---

## 検証チェックリスト

- [ ] `onlyInstantWatch` トグルで flatrate あり作品のみ表示される
- [ ] `streamingProvidersJp.flatrate` のピル表示（最大2 + more）
- [ ] 映画OFF / 旧作OFF との併用で破綻しない
- [ ] 日本語ラベルに文字化けがない
- [ ] `npx tsc --noEmit` / `npm run build` 成功

---

## 子 worktree の切り方（並列タスク）

同一ブランチでファイル競合する作業は避け、機能単位で分離:

```bash
# 例: カレンダー機能を独立 worktree へ
orca worktree create --name calendar-next-airing --agent grok \
  --prompt "Read worktrees/composer-dev.md and plans. Implement next-airing calendar on watchlist." \
  --parent-worktree active --json
```

作成後、GitHub Issue に worktree 名をコメントで追記。

---

## 既知の制約

- `Hermes` ファイルはコミットしない
- TMDb providerMap は現状空 Map 注入の準備段階あり（`seasonal/route.ts`）
- 配信情報の日本国内正確性は保証されない（AniList + TMDb ベース）
- PowerShell では `&&` が使えない場合あり → `;` または行分け

---

## 完了時の worktree comment 例

```bash
orca worktree set --worktree active --comment "tmdb pills done; build OK" --json
orca worktree set --worktree active --comment "blocked: need TMDb API key" --json
orca worktree set --worktree active --comment "ready for Codex review" --json
```