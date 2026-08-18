---
title: Source Registry
status: current
updated: 2026-08-18
sources:
  - ../AGENTS.md
  - ../ORCA_GUIDE.md
  - ../docs/orchestration/AGENT_EXECUTION_CONTRACT.md
  - ../docs
  - ../plans
---

# Source Registry

## Authority Order

ソースが矛盾したら次の順:

1. 明示された現行オーナー決定
2. 現行コード挙動とマージ済みテスト
3. 作業協調のための live GitHub Issue/PR 状態
4. 現行の source-of-truth 設計文書
5. マージ済み plans / reviews
6. Historical / 撤回済み文書

Wiki 要約を、その一次資料より強く扱わない。

## Core Sources

| Source | Role | Volatility |
|--------|------|------------|
| `docs/orchestration/AGENT_EXECUTION_CONTRACT.md` | マルチエージェント役割・ACK・証拠契約 | Low |
| `AGENTS.md` | 実装規則・モバイル・文字化け・検証・Issue/PR 協調 | Medium |
| `ORCA_GUIDE.md` | Orca worktree / マルチエージェント操作 | Low |
| `docs/UX_DIRECTION.md` | UI/UX 入口索引（主題別正本へ誘導） | Medium |
| `docs/UX_ABEMA_IA_REDESIGN_20260626.md` | 現行 IA（方針④・5 タブ）正本 | Medium |
| `docs/UIUX_RECONSIDERATION_20260711.md` | 表示設定・ガードレール横断記録 | Medium |
| `docs/architecture/release-data-ssot.md` | Jikan sunset / リリースデータ規範 | Medium |
| `app/` / `components/` / `lib/` / `apps/native/` | 現行実装挙動 | High |
| GitHub Issues/PRs | ownership・checks・review・merge | Very high |
| `docs/reviews/` | 永続化されたレビュー証拠 | Low |
| `plans/` | 実装提案と歴史的計画 | Medium |
| Git history | マージ済み変更の時系列 | High |
| `raw/` | 不変の外部取り込み | Low |
| `docs/LLM_WIKI_FOUNDATION.md` | Wiki 導入の設計根拠 | Low |

## Source Handling

- コード挙動はコードで検証する。
- 可変な協調状態は行動直前に GitHub で検証する。
- 撤回済み設計は Wiki 合成で Historical と明示する。
- 本文コピーよりパスリンクを優先する。
- 新しい外部ドロップは `raw/` に置き、ここに登録する。

## External Foundation

- Andrej Karpathy, “LLM Wiki” gist, 2026-04-04:
  `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`

採用概念: 3 層モデル、増分コンパイル、コンテンツ index、追記専用 log、query filing、定期 lint。
