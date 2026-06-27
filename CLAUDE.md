# Claude Code Project Schema

You are working on **anime-tier-board** inside Orca ADE or a linked worktree.

This file is the schema for the project LLM Wiki. It defines how to retrieve,
maintain, and extend project knowledge without rereading the repository's full
document set on every task.

## Knowledge Layers

1. **Sources**: application code, Git history, GitHub Issues/PRs, `docs/`,
   `plans/`, and externally supplied material under `raw/`. Sources are the
   evidence layer. Do not rewrite imported files in `raw/`.
2. **Wiki**: LLM-maintained, compiled knowledge under `wiki/`. Prefer this layer
   for orientation and retrieval.
3. **Schema**: this file plus `AGENTS.md`. These files define agent behavior,
   repository rules, and Wiki maintenance conventions.

The Wiki is a navigation and synthesis layer, not a replacement for code or
current GitHub state.

## Startup Protocol

Before acting:

1. Read [`wiki/index.md`](./wiki/index.md).
2. Read only the Wiki pages routed by the active task.
3. Read [`AGENTS.md`](./AGENTS.md) for coding, mobile-first, encoding, testing,
   and Issue/PR coordination rules.
4. Read [`ORCA_GUIDE.md`](./ORCA_GUIDE.md) only when the task involves Orca
   worktrees, terminals, browser automation, or multi-agent orchestration.
5. Inspect the relevant source files before changing code.
6. Query GitHub live for mutable state such as open Issues, PR labels, checks,
   ownership claims, and merge status.

Do not scan every file in `docs/`, `plans/`, or `wiki/` by default.

## Query Workflow

When answering a project question:

1. Start from `wiki/index.md`.
2. Follow links to the smallest relevant set of Wiki pages.
3. Verify claims against source files when behavior may have changed, when the
   Wiki page is stale, or when exact implementation details matter.
4. Cite repository paths, Issues, or PRs in the answer.
5. If the answer creates reusable knowledge, update the relevant Wiki page and
   append a query entry to `wiki/log.md`.

## Ingest and Update Workflow

When new information arrives through code, documents, Issues, PRs, or user
decisions:

1. Identify the authoritative source and record it in `wiki/sources.md` if it is
   not already registered.
2. Update existing Wiki pages before creating new pages.
3. Add or repair relative Markdown links between related pages.
4. Distinguish clearly between:
   - **Current fact**: verified against current code or live GitHub state.
   - **Decision**: owner-approved direction, ideally linked to an ADR or source.
   - **Proposal**: not yet accepted.
   - **Historical**: retained for context but no longer active.
5. Record contradictions instead of silently choosing one source. Prefer, in
   order: current owner decision, current code behavior, merged design decision,
   then older plans or reviews.
6. Update `wiki/index.md` when adding, renaming, or materially changing a page.
7. Append an entry to `wiki/log.md`; never rewrite prior log entries.

## Wiki Page Contract

Use concise Markdown. Each knowledge page should contain:

```yaml
---
title: Human-readable title
status: current | draft | historical
updated: YYYY-MM-DD
sources:
  - ../path/to/source
---
```

Page body conventions:

- Put the current answer or model first.
- Link related Wiki pages with normal relative Markdown links.
- Link source evidence explicitly.
- Avoid copying long source passages.
- Include an `Open questions` section only when unresolved items exist.
- Keep page scope narrow enough that an agent can load it independently.

## Maintenance Commands

Interpret these user intents as follows:

- **Ingest**: compile a source into the Wiki and update cross-references.
- **Query**: answer from the Wiki, verify against sources as needed, and file
  reusable conclusions.
- **Lint the Wiki**: check broken links, stale dates, contradictions, duplicate
  concepts, orphan pages, missing sources, and oversized pages.
- **Refresh current state**: compare `wiki/current-state.md` with current code,
  recent commits, and live GitHub state.

## Repository Rules

- Follow all rules in [`AGENTS.md`](./AGENTS.md), including UTF-8/mojibake
  checks, smartphone-first UI, separate worktrees, validation, and visible
  Issue/PR claims.
- Do not commit the local `Hermes` file unless explicitly requested.
- Run `npx tsc --noEmit` and `npm.cmd run build` for implementation changes.
- Update `app/updates/page.tsx` for meaningful user-facing changes; skip it for
  internal-only documentation or trivial corrections.
- Treat [`docs/UX_DIRECTION.md`](./docs/UX_DIRECTION.md) as the source of truth
  for active UI/UX direction until a newer owner-approved decision supersedes
  it.

## Wiki Ownership

The LLM owns maintenance of `wiki/`; humans review it. Do not present Wiki
summaries as stronger evidence than current code or live project state.

See [`docs/LLM_WIKI_FOUNDATION.md`](./docs/LLM_WIKI_FOUNDATION.md) for the
architecture rationale and rollout plan.
