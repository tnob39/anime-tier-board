---
title: Anime Tier Board Wiki Index
status: current
updated: 2026-06-27
sources:
  - ../AGENTS.md
  - ../CLAUDE.md
---

# Wiki Index

Use this page as the first routing step. Read only the pages relevant to the
active task, then verify against source code or live GitHub state.

## Core

- [Architecture](./architecture.md) — runtime, data flow, major boundaries, and
  route map.
- [Current State](./current-state.md) — current direction, active risks, and
  information that needs frequent verification.
- [Sources](./sources.md) — source authority and document registry.
- [Log](./log.md) — append-only history of Wiki maintenance.

## Task Routing

| Task | Read first | Then verify |
|------|------------|-------------|
| UI/UX or navigation | [Current State](./current-state.md), `docs/UX_DIRECTION.md` | affected components and mobile view |
| Home or broadcast calendar | [Architecture](./architecture.md) | `app/home-client.tsx`, `components/WeeklyBroadcastCalendar.tsx`, `lib/broadcast-calendar.ts` |
| Watchlist | [Architecture](./architecture.md), [Current State](./current-state.md) | `app/watchlist/`, `lib/statuses.ts` |
| Tier board | [Architecture](./architecture.md) | `components/TierBoardApp.tsx`, `lib/boards.ts` |
| API or database | [Architecture](./architecture.md), [Sources](./sources.md) | `app/api/`, `lib/turso.ts`, domain library |
| Multi-agent/GitHub work | `AGENTS.md` | live Issues, PR labels, checks, and worktrees |
| New product decision | [Current State](./current-state.md), [Sources](./sources.md) | owner decision and relevant design source |
| Wiki maintenance | `CLAUDE.md`, [Sources](./sources.md), [Log](./log.md) | changed source files |

## Planned Component Pages

See [Component Page Guide](./components/README.md).

Create these only when a task needs durable synthesis:

- `components/home-calendar.md`
- `components/watchlist.md`
- `components/tier-board.md`
- `components/sharing.md`
- `components/auth-and-data.md`

## Planned Decision Pages

See [Decision Page Guide](./decisions/README.md).

Accepted decisions should use ADR-style pages under `decisions/`, including
mobile-first UI, single-IA navigation, and visible Issue/PR coordination.
