---
title: Wiki Operations Log
status: current
updated: 2026-08-18
sources:
  - ../CLAUDE.md
  - ../docs/LLM_WIKI_FOUNDATION.md
---

# Wiki Operations Log

追記のみ。過去エントリは書き換えない。

## [2026-06-27] ingest | LLM Wiki foundation（旧 branch 候補）

- `origin/tnob39/codex-llm-wiki-foundation` で、広い起動読解を index ルーティングへ置き換える草案が作られた。
- 初期 architecture / current-state / sources / log と `raw/` 予約の方針が提案された。
- 既存 `docs/`・`plans/` を `raw/` へ複製しない決定が記録された。
- 注: 当時の current-state は方針③（4 タブ）を現行として書いており、現行 main では Historical。

## [2026-08-18] ingest | Issue #240 selective recovery on current main

- merge / cherry-pick せず、旧候補を `git show` で読み、現行 `CLAUDE.md` / `AGENTS.md` / 実装と照合して再作成した。
- `CLAUDE.md` を Wiki スキーマ入口にし、`wiki/index.md` へ誘導。Contract v1.0 ACK 要件を残した。
- `wiki/` に architecture / current-state / sources / log と components・decisions ガイドを配置。
- current-state を方針④（5 タブ正本）と、MobileNav の V5 フラグ実装事実に更新。方針③は Historical。
- 一次資料リンクを維持し、既存 docs の重複コピーは行わない。
