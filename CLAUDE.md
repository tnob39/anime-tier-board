# Claude Code — Project Schema (LLM Wiki)

You are working on **anime-tier-board** inside Orca ADE or a linked worktree.

このファイルはプロジェクト LLM Wiki のスキーマである。毎セッションで全文書を再読せず、
必要な知識だけを引き出すための入口・保守規則を定義する。

## Knowledge Layers

1. **Sources（一次資料）**: アプリコード、Git 履歴、GitHub Issues/PRs、`docs/`、`plans/`、
   および `raw/` に置いた外部取り込み資料。証拠層。`raw/` 内の取り込み原文は書き換えない。
2. **Wiki（コンパイル層）**: `wiki/` 配下の LLM 維持ナレッジ。オリエンテーションと検索はここを優先する。
3. **Schema（振る舞い層）**: 本ファイルと `AGENTS.md`。エージェント挙動・リポジトリ規則・Wiki 保守規約。

Wiki はナビと要約の層であり、コードや live な GitHub 状態の代替ではない。

## Required reading (before edits or Issue claim)

1. [`wiki/index.md`](./wiki/index.md) — Wiki 入口（タスクに必要なページだけ読む）
2. [`docs/orchestration/AGENT_EXECUTION_CONTRACT.md`](./docs/orchestration/AGENT_EXECUTION_CONTRACT.md) — Contract v1.0（役割・ACK・handoff・証拠）
3. [`AGENTS.md`](./AGENTS.md) — コーディング / モバイルファースト / 文字化け / Issue・PR 協調
4. [`ORCA_GUIDE.md`](./ORCA_GUIDE.md) — Orca worktree・端末・browser・マルチエージェント操作が必要なときのみ
5. 変更対象のソースファイル（実装前に必ず）
6. 可変状態（open Issue、PR ラベル、checks、ownership、`merge-pending`）は GitHub を live 照会

`docs/`・`plans/`・`wiki/` を毎回全走査しない。

## Startup Protocol

1. `wiki/index.md` を読む。
2. タスク種別にルーティングされた Wiki ページだけを読む。
3. 実装・協調規則は `AGENTS.md`、実行契約は Contract v1.0 に従う。
4. 編集または Issue claim の前にのみ Contract v1.0 の ACK JSON を返し、
   `python scripts/validate-orchestration-ack.py --agent <agent> <ack-file>` で検証する。
   読み取り、質問回答、読み取り専用レビューでは ACK を要求しない。
5. ACK 不正なら編集・claim・実装を開始しない。

## Query Workflow

1. `wiki/index.md` から開始する。
2. 関連 Wiki ページへのリンクを最小集合だけ辿る。
3. 挙動が変わりうる・ページが古い・正確な実装詳細が必要なときはソースで検証する。
4. 回答にはリポジトリパス、Issue、PR を明示する。
5. ユーザーが明示的に Ingest/更新を依頼し、編集許可スコープに wiki が含まれる場合のみ、該当 Wiki を更新し `wiki/log.md` に query エントリを追記する。通常の Query・読み取り専用レビューでは変更せず、必要なら更新候補を提示するだけとする。

## Ingest and Update Workflow

新しい情報（コード・文書・Issue・PR・オーナー決定）が来たら:

1. 権威ある一次資料を特定し、未登録なら `wiki/sources.md` に登録する。
2. 新規ページを作る前に既存 Wiki を更新する。
3. 関連ページ間の相対 Markdown リンクを追加・修復する。
4. 次を明確に区別する:
   - **Current fact**: 現行コードまたは live GitHub で検証済み
   - **Decision**: オーナー承認の方針（ADR または一次資料へリンク）
   - **Proposal**: 未承認
   - **Historical**: 文脈保持。現行として書かない
5. 矛盾は黙殺せず記録する。優先順: 現行オーナー決定 → 現行コード挙動 → マージ済み設計決定 → 古い plans/reviews
6. ページ追加・改名・実質変更時は `wiki/index.md` を更新する。
7. `wiki/log.md` に追記する（過去エントリは書き換えない）。

## Wiki Page Contract

簡潔な Markdown を使う。各ナレッジページは次を含む:

```yaml
---
title: Human-readable title
status: current | draft | historical
updated: YYYY-MM-DD
sources:
  - ../path/to/source
---
```

本文の規約:

- 現行の答え・モデルを先に置く。
- 関連 Wiki は相対 Markdown リンクでつなぐ。
- 一次資料へのリンクを明示する。長文のコピーは避ける。
- 未解決があるときだけ `Open questions` を置く。
- 1 ページで独立ロードできる粒度に保つ。

## Maintenance Commands

ユーザー意図の解釈:

- **Ingest**: 一次資料を Wiki にコンパイルし、相互参照を更新する。
- **Query**: Wiki から回答し、必要ならソース検証する。通常の Query・読み取り専用レビューでは変更せず、必要なら更新候補を提示するだけとする。Wiki 反映は、ユーザーが明示的に Ingest/更新を依頼し、編集許可スコープに wiki が含まれる場合のみ行う。
- **Lint the Wiki**: 壊れたリンク、古い `updated`、矛盾する現行決定、重複概念、orphan、欠落ソース、過大ページを点検する。
- **Refresh current state**: `wiki/current-state.md` を現行コード・直近コミット・live GitHub と照合する。

## Repository Rules

- [`AGENTS.md`](./AGENTS.md) の全規則に従う（UTF-8 / mojibake 検査、スマホファースト、別 worktree、検証、Issue/PR 可視化クレーム）。
- ローカル `Hermes` ファイルは明示要求がない限りコミットしない。
- 実装変更では `npx tsc --noEmit` と `npm.cmd run build` を通す。
- ユーザー向けの意味ある変更は `app/updates/page.tsx` を更新する（内部ドキュメントのみ・軽微修正は不要）。
- UI/UX の入口索引は [`docs/UX_DIRECTION.md`](./docs/UX_DIRECTION.md)。IA・ナビの現行正本は [`docs/UX_ABEMA_IA_REDESIGN_20260626.md`](./docs/UX_ABEMA_IA_REDESIGN_20260626.md)（方針④）。
- Fable は非コーディングの Architect/Reviewer、Grok 4.5 は bounded Implementer、Hermes は独立 proof。自己レビューへ役割を潰さない。

## Wiki Ownership

`wiki/` の保守は LLM、人間がレビューする。Wiki 要約を現行コードや live 状態より強い証拠として扱わない。

設計根拠とロールアウトは [`docs/LLM_WIKI_FOUNDATION.md`](./docs/LLM_WIKI_FOUNDATION.md) を参照。
