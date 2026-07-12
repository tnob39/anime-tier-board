# LLM Wiki Foundation

## Goal

Introduce a compiled project-knowledge layer so agents can orient from a small
index and load only task-relevant context instead of rereading all design,
handoff, review, and planning documents.

## Recommended Architecture

```text
CLAUDE.md                 # Schema: retrieval and maintenance rules
AGENTS.md                 # Engineering and coordination rules
raw/                      # Immutable external source drops only
wiki/
  index.md                # Primary routing table
  architecture.md         # Stable system model
  current-state.md        # Current priorities and known drift
  sources.md              # Source registry and authority
  log.md                  # Append-only Wiki operations
  components/             # Added incrementally by product area
  decisions/              # ADR-style accepted decisions
```

## Project-Specific Choice

Existing repository files under `docs/`, `plans/`, application code, Git
history, and GitHub Issues/PRs already form the project's source layer. Copying
all of them into `raw/` would create two mutable copies and unclear ownership.

Therefore:

- `raw/` is reserved for imported external material that must remain unchanged.
- Existing repository documents remain in place and are registered in
  `wiki/sources.md`.
- `wiki/` contains compact synthesis and routing, with links back to evidence.
- Live GitHub state is queried rather than cached as authoritative Wiki fact.

## Retrieval Model

Agents should normally load:

1. `CLAUDE.md`
2. `wiki/index.md`
3. one to three routed Wiki pages
4. relevant source code or live GitHub state

This replaces the previous startup pattern of loading several broad operational
and design documents for every task.

## Maintenance Model

### Ingest

Register the source, update existing pages, add links, update the index, then
append a log entry.

### Query

Route through the index, verify unstable claims, answer with source paths, and
file reusable conclusions back into the Wiki.

### Lint

Check:

- broken relative links
- stale `updated` dates
- current pages based only on historical sources
- contradictory active decisions
- duplicate pages or aliases
- orphan pages
- pages that are too broad to load efficiently

## Rollout

### Phase 1: Foundation

- Replace `CLAUDE.md` with the Wiki schema.
- Add index, architecture, current state, source registry, and log.
- Keep the initial Wiki small and source-linked.

### Phase 2: High-Value Components

Add pages only when actively used, starting with:

- `wiki/components/home-calendar.md`
- `wiki/components/watchlist.md`
- `wiki/components/tier-board.md`
- `wiki/components/sharing.md`
- `wiki/components/auth-and-data.md`

### Phase 3: Decisions

Convert active owner-approved choices into ADR-style pages under
`wiki/decisions/`. Keep superseded decisions marked historical rather than
deleting context.

### Phase 4: Lightweight Automation

Only after the Wiki grows enough to justify it:

- link checker
- stale-page report
- orphan-page report
- compact source manifest

Avoid vector search or a new service until index-based routing becomes
insufficient.

## Success Criteria

- A new agent can identify the relevant source files from `wiki/index.md`.
- Routine tasks do not require scanning all of `docs/` and `plans/`.
- Wiki claims expose their evidence and freshness.
- New decisions and reusable investigations survive beyond chat history.
- The Wiki remains smaller and easier to load than the source corpus.
