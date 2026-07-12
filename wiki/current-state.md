---
title: Current Project State
status: current
updated: 2026-06-27
sources:
  - ../docs/UX_DIRECTION.md
  - ../AGENTS.md
  - ../app
  - ../components
  - ../lib
---

# Current Project State

## Stable Direction

- The application is smartphone-first. New and changed UI starts at 375px,
  uses touch-friendly controls, and expands for desktop.
- The active navigation direction is a single four-tab information
  architecture: Home, Tier, Analysis, and Search.
- Home centers the weekly broadcast calendar and quick seasonal additions.
- Watchlist is detailed management rather than a primary bottom-navigation tab.
- UI copy is Japanese and all edited text files must remain UTF-8.

## Active Development Characteristics

- Multiple Claude, Codex, and Grok sessions work in parallel through separate
  Orca worktrees.
- GitHub Issue/PR labels and comments are the coordination channel.
- Live PR ownership, `in-progress`, and `merge-pending` state must be queried
  before editing or merging.
- Experimental and production variants may coexist, especially around
  watchlist UI. Verify current route wiring before assuming a variant is active.

## Known Knowledge Risks

- Design documents preserve superseded proposals for history. Read status
  warnings and prefer the latest owner-approved section.
- Plans and reviews can describe work that is already merged, replaced, or
  abandoned.
- `main` changes frequently; this page must not be used as a substitute for
  checking current code and recent commits.
- GitHub state is intentionally not cached here as authoritative.

## Near-Term Wiki Expansion

Add component pages when the next task requires them. Highest-value candidates:

1. Home calendar visibility and season-boundary behavior.
2. Watchlist variants and feature-flag routing.
3. Tier ranking, popularity, and status synchronization.
4. Sharing models and public-page behavior.
5. Authentication, native sessions, and Turso ownership boundaries.

## Open Questions

- Which component areas produce the most repeated context loading across
  sessions?
- Should accepted product decisions be promoted from large UX documents into
  small ADR pages?
- At what Wiki size does a deterministic link/staleness checker become useful?

## Related

- [Architecture](./architecture.md)
- [Sources](./sources.md)
- [`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)
