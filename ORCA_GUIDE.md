# ORCA_GUIDE — Agent Development Environment 活用ガイド

**対象**: Claude Code / Codex / Grok / Cursor / Hermes など、Orca ADE 内で動作するすべてのコーディングエージェント  
**プロジェクト**: anime-tier-board (`tnob39/anime-tier-board`)  
**更新**: 2026-06-07

> **起動時の必須指示（各エージェントの System Prompt / 初回プロンプトに貼る）**
>
> ```
> You are operating inside Orca ADE. Before acting, read and follow ORCA_GUIDE.md.
> Use separate worktrees for parallel subtasks. Prefer `orca` CLI over raw git worktree
> when Orca state matters. Update worktree comments at checkpoints. For structured
> multi-agent work, use orchestration (not ad-hoc terminal polling).
> ```

---

## 1. Orca とは

[Orca](https://onorca.dev) は **Agent Development Environment (ADE)** です。複数の CLI コーディングエージェントを **Git worktree ごとに隔離**し、ターミナル・ブラウザ・Diff レビューを **1 画面で一元管理**します。

このリポジトリでは、機能単位の並列開発（Explore フィルタ、TMDb UI、カレンダー機能など）を Orca worktree で分担する運用を想定しています。

**公式リソース**

- ドキュメント: https://www.onorca.dev/docs/
- GitHub: https://github.com/stablyai/orca
- X: [@orca_build](https://x.com/orca_build)
- Discord: https://discord.gg/fzjDKHxv8Q

---

## 2. このプロジェクトの関連ドキュメント

| ファイル | 用途 |
|----------|------|
| `ORCA_GUIDE.md`（本書） | Orca の使い方・マルチエージェント運用 |
| `AGENTS.md` | プロジェクト構成・コーディング規約・API 要点 |
| `CLAUDE.md` | Claude Code 起動時のエントリポイント |
| `docs/GITHUB_ISSUES.md` | タスク管理（GitHub Issues） |
| `worktrees/composer-dev.md` | composer-dev worktree のタスク別ミニガイド |
| `worktrees/claude-review.md` | claude-review worktree のレビュー用ミニガイド |
| `orca/AUTOMATIONS.md` | 定期レビュー Automation 定義 |
| `orca/prompts/*.txt` | Automation 詳細プロンプト本文 |
| `scripts/setup-orca-automations.ps1` | Automation 一括登録スクリプト |
| `SESSION_HANDOFF.md` | セッション引き継ぎ・本番 URL・検証ベースライン |
| `HERMES_GROK_HANDOFF.md` | 機能 WIP の詳細仕様・既知の問題 |
| `plans/*.md` | 個別機能の設計メモ |
| `README.md` | アプリのローカル起動・環境変数 |

エージェントは作業開始前に、担当タスクに応じて上記を読んでから着手してください。

---

## 3. コア機能と使い分け

### 3.1 Worktree（最重要）

**原則: 並列タスクは別 worktree。同一 worktree 内の split は補助用途のみ。**

| やること | 推奨 |
|----------|------|
| 独立した機能実装 | 新 worktree を作成 |
| 同じファイルを触る可能性がある作業 | 必ず別 worktree |
| テスト実行 + 実装の同時監視 | 同一 worktree で terminal split |
| 親タスクから派生する子タスク | `--parent-worktree active`（デフォルト推論） |
| 完全に無関係なタスク | `--no-parent` |

**CLI 例**（`orca` が PATH にある場合。Linux では `orca-ide`）:

```bash
orca status --json
orca worktree ps --json
orca worktree current --json

# 子 worktree + エージェント起動
orca worktree create --name explore-filter --agent grok --prompt "Implement filter" --json

# 進捗をワークスペース一覧に表示
orca worktree set --worktree active --comment "filter done; running tests" --json
```

**セレクタ**: `id:<id>` / `path:<abs>` / `branch:<name>` / `active` / `current`

**既知の worktree（Issue / 運用より）**

| Worktree 名 | 担当 | 状態 |
|-------------|------|------|
| `explore-instant-watch-filter` | grok-composer | Done |
| `tmdb-ui-integration` | grok-composer | In Progress |
| `calendar-next-airing` | grok-composer | Todo（予定） |

新タスクを始めるときは GitHub Issue を作成し、`orca worktree set --comment "issue #N"` を更新してください。

### 3.2 Terminal（分割・読み取り・待機）

```bash
orca terminal list --json
orca terminal read --json
orca terminal split --direction vertical --command "npm run dev:local" --json
orca terminal wait --for tui-idle --timeout-ms 300000 --json
orca terminal send --text "npm test" --enter --json
```

**ルール**

- `terminal read` → 状況把握 → `terminal send` の順。盲目送信しない。
- エージェント CLI（Claude Code / Codex / Grok 等）の完了待ちは `--for tui-idle`。必ず `--timeout-ms` を付ける。
- `--direction horizontal` = 左右分割、`vertical` = 上下分割。
- ハンドルは Orca 再起動で失効する。`terminal list` で再取得。

**ローカル開発サーバー**

```powershell
npm.cmd run dev:local
# → http://localhost:3000
```

### 3.3 Diff レビューと Annotation

Orca 内蔵のソース管理 UI で AI 生成 Diff をレビューできます。

**ベストプラクティス**

- レビュー指摘は **Diff annotation** で残す（口頭・チャットだけにしない）。
- エージェントへのフィードバックは、annotation 内容をプロンプトに引用して渡す。
- 大きな変更は worktree 単位でレビュー → マージの流れにする。

参考: https://www.onorca.dev/docs/review/annotate-ai-diff

### 3.4 組み込みブラウザ

Orca 内のブラウザタブは `orca goto` / `orca snapshot` / `orca click` で操作します。  
**Chrome / Edge など外部ブラウザ**や Orca アプリ UI 自体は `orca computer`（Computer Use）を使います。

```bash
orca goto --url http://localhost:3000/explore --json
orca snapshot --json
orca click --element @e3 --json
```

**ルール**

- 操作後は必ず `snapshot` を取り直す（ref はナビゲーションで無効化される）。
- 非同期変化のあとは `wait --text` / `--url` / `--selector` を使う。

### 3.5 Orca CLI vs 素の shell

| 状況 | 使うもの |
|------|----------|
| worktree / terminal / 内蔵 browser の状態が重要 | `orca` CLI |
| 単純なファイル編集・git log・npm test | 通常の shell |
| 外部デスクトップアプリ操作 | `orca computer` |
| 構造化マルチエージェント調整 | `orca orchestration` |

`orca` が PATH にない環境（例: 一部のリモート shell）では、通常の git / npm コマンドにフォールバックし、Orca 固有操作はスキップしてください。

**Windows**: 実行中の Orca に RPC 接続するには `Orca.exe` ではなくバンドル CLI を使う:

```powershell
$orca = "$env:LOCALAPPDATA\Programs\orca\resources\bin\orca.cmd"
& $orca status --json
```

---

## 4. マルチエージェント運用

### 4.1 役割分担（このプロジェクトの想定）

| 役割 | 例 | 主な責務 |
|------|-----|----------|
| Orchestrator | Hermes / ユーザー | タスク分解、worktree 作成、レビュー統合 |
| Implementer | Grok Composer / Codex / Claude Code | 機能実装・テスト |
| Reviewer | Codex 等 | テスト容易性・セキュリティレビュー |

### 4.2 Orchestration（実験機能）

Settings → Experimental で有効化。タスク DAG・dispatch・worker_done で構造化協調します。

**Coordinator の流れ**

```bash
orca orchestration task-create --spec "Fix login CSS" --json
orca worktree create --name login-worker --agent claude --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
orca orchestration check --wait --types worker_done,escalation --timeout-ms 300000 --json
```

**Worker の義務**（有効な dispatch preamble がある場合）

- 完了時に `worker_done` を **1 回だけ** 送信
- ブロック時は `escalation` または `ask`
- 長時間タスクは必要に応じて `heartbeat`

軽いプロンプト投げだけなら `orca terminal send` で十分。lifecycle メッセージは **live dispatch があるときだけ**。

### 4.3 Skills（エージェントが読むべき SKILL.md）

グローバルにインストール済みの Orca 関連スキル:

| スキル | パス | いつ使うか |
|--------|------|------------|
| `orca-cli` | `~/.agents/skills/orca-cli/SKILL.md` | worktree / terminal / browser / automations |
| `orchestration` | `~/.agents/skills/orchestration/SKILL.md` | マルチエージェント調整 |
| `computer-use` | `~/.agents/skills/computer-use/SKILL.md` | Orca 外のデスクトップ UI |

タスクが Orca 状態に触れるときは、まず該当 SKILL.md を読んでから CLI を叩いてください。

---

## 5. ベストプラクティス（チェックリスト）

### 作業開始前

- [ ] `ORCA_GUIDE.md` と `docs/GITHUB_ISSUES.md`（または対象 Issue）を読んだ
- [ ] 担当タスク用の worktree にいる（または作成した）
- [ ] 関連 handoff / plan ドキュメントを確認した
- [ ] `orca worktree set --comment "..."` で状態を明示した

### 実装中

- [ ] 並列タスクは別 worktree（同一ファイル編集を避ける）
- [ ] 変更は既存のコードスタイル・パターンに合わせる
- [ ] スコープ外のリファクタ・無関係ファイル編集をしない
- [ ] 日本語 UI 文字列の文字化けに注意（既知課題あり）

### 完了時

- [ ] `npx tsc --noEmit` と `npm run build` が通る
- [ ] worktree comment を更新（例: `"done; ready for review"`）
- [ ] GitHub Issue を更新（コメント / close / `review-needed` ラベル）
- [ ] orchestration 中なら `worker_done` を送信

### 検証

```powershell
npx tsc --noEmit
npm.cmd run build
npm.cmd run dev:local
# ブラウザで http://localhost:3000 を確認
```

本番: https://anime-tier-board.vercel.app

---

## 6. ユーザーが Orca UI でできること（エージェントが意識すべき点）

エージェントはターミナルだけでなく、**ユーザーが Orca 上で以下を行える**ことを前提に設計してください。

- worktree の作成・切り替え・削除
- ターミナル split でエージェントを並列起動
- ファイル・画像をプロンプトへドラッグ
- Diff への annotation でレビューフィードバック
- 組み込みブラウザでの UI 確認（Design Mode 含む）
- GitHub PR / Issue / Actions の確認
- モバイル Companion アプリからの監視・操作
- 通知（エージェント完了・要対応）

「ユーザーに手順を長々と説明する」より、「Orca 上で annotation / worktree 切替 / ブラウザ確認をしてもらう」方が効率的な場面が多いです。

---

## 7. 制限・Tips

| 項目 | 内容 |
|------|------|
| Rate limit | 各エージェントの API 制限は独立。並列数を上げすぎない。 |
| コンテキスト | handoff ドキュメントで外部化。巨大 diff を一度に読ませない。 |
| Session persistence | Orca はセッション維持が強い。worktree を跨いだ途中状態は comment / GitHub Issue で可視化。 |
| `Hermes` ファイル | ローカル untracked。ユーザー明示がない限りコミットしない。 |
| Windows shell | PowerShell では `&&` が使えないことがある。`;` または行分けで実行。 |
| CLI 未インストール | `orca` が無い shell では通常 git/npm にフォールバック。 |

---

## 8. タスク別クイックスタート例

### 単一エージェントで機能実装

```
1. orca worktree create --name <feature> --agent <agent> --json
2. plans/<feature>.md と HERMES_GROK_HANDOFF.md を読む
3. 実装 → dev server で確認
4. tsc / build
5. worktree comment 更新 + GitHub Issue 更新
```

### Orchestrator + Worker 並列

```
1. GitHub Issues でタスク分割
2. タスクごとに worktree create --no-parent または --parent-worktree active
3. orchestration task-create → dispatch --inject
4. check --wait で worker_done を待つ
5. Diff annotation でレビュー → 修正 dispatch
```

### UI 確認

```
1. terminal split で npm run dev:local
2. orca goto http://localhost:3000/<page>
3. snapshot → 要素操作 → 再 snapshot
4. 問題があれば annotation またはプロンプトで修正依頼
```

---

## 9. 起動プロンプトテンプレート

### Implementer 用

```
Read ORCA_GUIDE.md, docs/GITHUB_ISSUES.md, and the relevant GitHub Issue / plan first.
You are in Orca worktree: <name>. Implement issue #<N>. Use a separate worktree if you
need a parallel subtask. Run tsc and build before finishing. Update worktree comment
and close or comment on the GitHub Issue when done.
```

### Reviewer 用

```
Read ORCA_GUIDE.md. Review changes in worktree <name>. Focus on testability and
regressions. Leave feedback via Orca diff annotations where possible. Do not expand
scope beyond the assigned review.
```

### Coordinator 用

```
Read ORCA_GUIDE.md and docs/GITHUB_ISSUES.md. Decompose <epic> into GitHub Issues and worktrees. Use
orca orchestration for tracked dispatches. Prefer inter-worktree parallelism over
split-pane for file-editing tasks. Keep dependency chains shallow (max 3-4).
```

---

## 10. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-07 | 初版作成（anime-tier-board 向け） |## 個人開発向け推奨

個人開発では `PERSONAL_ORCA_WORKFLOW.md` を優先的に参照してください。
重いオーケストレーションは最小限に抑え、Orca の worktree + 並列ターミナルを最大限活用してください。
