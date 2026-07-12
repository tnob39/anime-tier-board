---
title: Source Registry
status: current
updated: 2026-06-27
sources:
  - ../AGENTS.md
  - ../ORCA_GUIDE.md
  - ../docs
  - ../plans
---

# Source Registry

## Authority Order

When sources disagree, use this order:

1. Explicit current owner decision.
2. Current code behavior and merged tests.
3. Live GitHub Issue/PR state for work coordination.
4. Active source-of-truth design document.
5. Merged plans and reviews.
6. Historical or superseded documents.

Do not treat a Wiki summary as stronger evidence than its sources.

## Core Sources

| Source | Role | Volatility |
|--------|------|------------|
| `AGENTS.md` | Engineering, mobile-first, encoding, validation, and coordination rules | Medium |
| `ORCA_GUIDE.md` | Orca worktree and multi-agent operations | Low |
| `docs/UX_DIRECTION.md` | Active UI/UX direction with historical sections | Medium |
| `app/`, `components/`, `lib/` | Current implementation behavior | High |
| GitHub Issues/PRs | Current ownership, checks, review, and merge state | Very high |
| `docs/reviews/` | Persisted review evidence | Low |
| `plans/` | Implementation proposals and historical plans | Medium |
| Git history | Merged change chronology | High |
| `raw/` | Immutable imported external material | Low |

## Source Handling

- Verify code-level behavior in code.
- Verify mutable coordination state through GitHub immediately before acting.
- Mark superseded design sections as historical in Wiki synthesis.
- Prefer linking to source paths over copying source text.
- Add new external source drops to `raw/` and register them here.

## External Foundation

- Andrej Karpathy, “LLM Wiki” gist, 2026-04-04:
  `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`

The adopted concepts are the three-layer model, incremental compilation,
content index, append-only log, query filing, and periodic linting.
