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
- **日本語 UI / エンコーディング**: 表示文言は日本語。ファイルは必ず UTF-8 で書く。**特に Codex は Windows / PowerShell 経由の書き込みで日本語を文字化け（mojibake）させる既知問題があり、`tsc`/`build` は通ってしまうため見落としやすい**（マージすると本番が文字化け表示になる）。実装後は `rg "縺|繝|ｱ|ｦ|莉|謾"` 等で mojibake を検査し、差分レビューで日本語表示を目視確認する
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

### Issue / PR ステータス運用（必須・マルチセッション協調）

複数の Claude Code セッション・Codex・Grok が **同一の GitHub アカウント** で並行し、
`gh pr merge` などファイル書き込みを伴わない操作は承認ゲートを通らずに実行できる。
二重マージ・コンフリクト事故を防ぐため、**作業状態を GitHub の Issue/PR ラベルとコメントで
常に可視化する**。これがセッション横断の唯一の調整チャネルである。

**ステータスラベルのライフサイクル**（Issue に付与。対応する PR にも同じラベルをミラーする）:

| ラベル | 意味 | 付与タイミング |
|--------|------|----------------|
| `todo` | 未着手 | Issue 作成時 |
| `in-progress` | あるセッション / エージェントが作業中 | 着手直後（下記コメント必須） |
| `review` | レビュー依頼中 | PR を作成しレビューに出した時 |
| `ready-to-merge` | レビュー合格・マージ可 | レビュー OK 時 |
| `merge-pending` | **マージ実行を特定セッションがクレーム中** | マージ直前（下記コメント必須） |

**ルール:**

1. **着手**: Issue を `todo` → `in-progress` に張り替え、自分を assign し、コメントで
   `着手: <エージェント/セッションID> (worktree: <名>) @ <ISO時刻>` を残す。
   既に他者名義の `in-progress` が付いていたら **勝手に着手しない**（ユーザーに確認）。
2. **マージ直前（最重要）**: マージする前に必ず対象 PR（および対応 Issue）に `merge-pending` を付け、
   コメントで `マージ予定: <エージェント/セッションID> @ <ISO時刻>` を残してから `gh pr merge` する。
   既に他者名義の `merge-pending` または `in-progress` が付いている PR は **マージしない**（重複マージ防止）。
3. **完了**: マージ後、Issue に `完了・PR #<番号>` を追記して close。ステータスラベルは除去する。
4. ラベルが実態と食い違っていたら、気付いたセッションが正す（コメントで理由を残す）。

> この可視化が機能している限り、docs PR 等の小さな変更は **クレーム（`merge-pending` + コメント）を
> 立てた上でマージしてよい**。クレームなしの無断マージは引き続き禁止。
> 同一ファイルを別 Issue で同時編集中と分かった場合は、両 Issue にコメントしてマージ順序を調整する。

### 設計ドキュメント・計画・レビューの永続化（必須）

設計方針・実装計画・エージェントのレビュー結果は **必ずリポジトリにコミットして共有する**（PR で `main` へ）。
端末出力のまま／ローカルのみ／side ブランチ放置で終わらせない。**全員が `main` で参照できる状態**にして初めて完了とする。

- **設計方針 / IA**: `docs/`（UIUX は `docs/UX_DIRECTION.md` が source of truth）
- **実装計画**: `plans/`（命名 `plans/<topic>-<YYYYMMDD>.md`）
- **エージェントのレビュー結果**（Codex / Claude など）: `docs/reviews/`（命名 `docs/reviews/<topic>-<reviewer>-<YYYYMMDD>.md`）
- Codex / Grok にレビューや調査を依頼するときは、**「結果をファイルに書いてコミットする」ところまで指示**する（端末出力だけで終わらせると共有されない）。
- Codex / Grok に**実装**を委任するときは、プロンプトに **「ファイルはすべて UTF-8 で書き、日本語を文字化け（mojibake）させない」** を明記する。受領後は **必ず差分レビュー＋mojibake 検査**を行ってから commit する（Codex は Windows/PowerShell 経由の書き込みで日本語を破損させる既知問題があり、`tsc`/`build` は通るため見落としやすい。委任スコープ外のファイルを勝手に書き換えることもあるので想定外差分は revert する）。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| **[docs/UX_DIRECTION.md](./docs/UX_DIRECTION.md)** | **【UIUX必読】改善の共有方針・IA再設計・FV刷新（全エージェント source of truth）** |
| [ORCA_GUIDE.md](./ORCA_GUIDE.md) | Orca 操作・マルチエージェント |
| [CLAUDE.md](./CLAUDE.md) | Claude Code 向けエントリポイント |
| [orca/AUTOMATIONS.md](./orca/AUTOMATIONS.md) | 定期レビュー Automation 定義 |
| [worktrees/composer-dev.md](./worktrees/composer-dev.md) | composer-dev worktree ミニガイド |
| [worktrees/error-catching.md](./worktrees/error-catching.md) | エラー処理共通化（Phase 1）専用 worktree |
| [plans/error-catching-20260608.md](./plans/error-catching-20260608.md) | API エラー契約・並行タスクのファイル所有権 |
| [worktrees/claude-review.md](./worktrees/claude-review.md) | claude-review worktree ミニガイド |
| [docs/GITHUB_ISSUES.md](./docs/GITHUB_ISSUES.md) | タスク管理（GitHub Issues） |
| [docs/reviews/](./docs/reviews/) | エージェントのレビュー結果アーカイブ（例: 方針③ Codexレビュー） |
| [docs/research/](./docs/research/) | 市場・競合調査アーカイブ（例: Annict競合分析） |
| [MONETIZATION_ROADMAP.md](./MONETIZATION_ROADMAP.md) | 収益化ロードマップ（アフィリエイト・IAP方針） |
| [plans/native-web-monetization-brainstorm-20260622.md](./plans/native-web-monetization-brainstorm-20260622.md) | Web/ネイティブ決済導線の決定・ネイティブ差別化機能アイデア |
| [plans/screen-composition-annict-comparison-20260622.md](./plans/screen-composition-annict-comparison-20260622.md) | Annict風ワイヤーフレームとの画面構成比較・改善提案 |
| [SESSION_HANDOFF.md](./SESSION_HANDOFF.md) | セッション引き継ぎ |
| [HERMES_GROK_HANDOFF.md](./HERMES_GROK_HANDOFF.md) | WIP 機能仕様 |
| [DESIGN.md](./DESIGN.md) | UI デザイン方針 |
| [README.md](./README.md) | ローカル起動・環境変数 |