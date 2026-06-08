---

## プロジェクト概要

AniList / Jikan から季節アニメを取得し、Tier 表を作成・共有する Next.js アプリ。

| 項目 | 値 |
|------|-----|
| リポジトリ | `tnob39/anime-tier-board` |
| 本番 | https://anime-tier-board.vercel.app |
| ローカル | http://localhost:3000 |
| フレームワーク | Next.js 16 (App Router) + React 19 |
| DB | Turso (libSQL) |
| 認証 | NextAuth v5 (Google OAuth) |

---

## ディレクトリ構成

```
app/                  # App Router ページ・API routes
  api/                # REST endpoints（statuses, watchlist, anime, shares 等）
  explore/            # 過去作探索（要ログイン）
  watchlist/          # 視聴管理（要ログイン）
  voice-actors/       # 声優発見（要ログイン）
  dashboard/          # 分析（要ログイン）
  share/[shareId]/    # 共有ページ（コメント・リアクション）
components/           # 共有 UI（TierBoardApp, MobileNav 等）
lib/                  # ビジネスロジック・Turso アクセス・外部 API
  anime-sources/      # AniList / Jikan クライアント
  statuses.ts         # 視聴ステータス CRUD
  streaming-providers.ts  # TMDb Watch Providers enrich
plans/                # 機能別設計メモ
```

---

## コーディング規約

### 一般

- **スコープを守る**: 依頼されたタスク以外のリファクタ・無関係ファイル編集をしない
- **既存パターンに合わせる**: 命名、import スタイル、コンポーネント構造を踏襲
- **日本語 UI**: 表示文言は日本語。文字化け（mojibake）がないか確認する（既知課題）
- **コメント**: 自明な処理に冗長コメントを付けない

### TypeScript / React

- クライアントコンポーネントは `"use client"` を明示
- データ取得は既存の API route パターンに従う（`/api/anime/seasonal` 等）
- メタデータ追加は `anime_json` スナップショットで済むことが多い（DB スキーマ変更は最小限）

### スタイル

- `app/globals.css` にモバイルファーストの白背景・細ボーダー・8px 角丸
- 新ページは `.explore-*` / `.voice-*` 等の既存クラス命名に合わせる
- 詳細は `DESIGN.md` を参照

### Git

- **`Hermes` ファイル**: untracked ローカル用。ユーザー明示がない限りコミットしない
- 並列タスクは **別 Orca worktree / 別ブランチ** で行う
- コミット前に `npx tsc --noEmit` と `npm run build` を通す

---

## API・データの要点

| エンドポイント | 用途 |
|----------------|------|
| `/api/statuses` | 視聴ステータス（planned / watching / completed 等） |
| `/api/watchlist` | お気に入り度・視聴スロット・メモ |
| `/api/anime/seasonal` | 季節アニメ取得 + streaming enrich |
| `/api/shares` | 共有 URL 作成 |

- 視聴管理の保存は **明示的「保存する」** 操作（自動保存ではない箇所に注意）
- 配信情報: AniList `streamingEpisodes` + TMDb `streamingProvidersJp.flatrate`
- `/explore` と `/voice-actors` は未ログイン時 `/` へリダイレクト

---

## 検証コマンド

```powershell
npx tsc --noEmit
npm.cmd run build
npm.cmd run dev:local
```

ブラウザ確認: http://localhost:3000（Orca 内蔵ブラウザまたは `orca goto`）

---

## エージェント別の注意

| エージェント | 補足 |
|--------------|------|
| Grok / Composer | 実装担当。対応 GitHub Issue を更新・close |
| Codex | レビュー・テスト容易性。Diff annotation でフィードバック |
| Claude Code | 本書 + `CLAUDE.md` を起動時自動読み込み |
| Hermes | Orchestrator。worktree 作成・タスク分解・`orchestration` 利用 |
| Cursor | `AGENTS.md` を Rules / Docs に登録推奨 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [ORCA_GUIDE.md](./ORCA_GUIDE.md) | Orca 操作・マルチエージェント |
| [CLAUDE.md](./CLAUDE.md) | Claude Code 向けエントリポイント |
| [orca/AUTOMATIONS.md](./orca/AUTOMATIONS.md) | 定期レビュー Automation 定義 |
| [worktrees/composer-dev.md](./worktrees/composer-dev.md) | composer-dev worktree ミニガイド |
| [worktrees/error-catching.md](./worktrees/error-catching.md) | エラー処理共通化（Phase 1）専用 worktree |
| [plans/error-catching-20260608.md](./plans/error-catching-20260608.md) | API エラー契約・並行タスクのファイル所有権 |
| [worktrees/claude-review.md](./worktrees/claude-review.md) | claude-review worktree ミニガイド |
| [docs/GITHUB_ISSUES.md](./docs/GITHUB_ISSUES.md) | タスク管理（GitHub Issues） |
| [SESSION_HANDOFF.md](./SESSION_HANDOFF.md) | セッション引き継ぎ |
| [HERMES_GROK_HANDOFF.md](./HERMES_GROK_HANDOFF.md) | WIP 機能仕様 |
| [DESIGN.md](./DESIGN.md) | UI デザイン方針 |
| [README.md](./README.md) | ローカル起動・環境変数 |