---
title: System Architecture
status: current
updated: 2026-06-27
sources:
  - ../AGENTS.md
  - ../package.json
  - ../app
  - ../lib
---

# System Architecture

## Overview

Anime Tier Board is a Next.js 16 App Router application using React 19. It
fetches seasonal anime from AniList and Jikan, stores user state in Turso
through libSQL, and authenticates through NextAuth v5 with Google OAuth.

## Runtime Boundaries

- `app/`: routes, server components, client entry points, and REST endpoints.
- `components/`: shared interactive UI, including the Tier board, navigation,
  card lanes, home add flow, and broadcast calendar.
- `lib/`: domain logic, database access, external API clients, caching, sharing,
  subscriptions, and error contracts.
- `docs/` and `plans/`: human-authored source documents and historical plans.
- `wiki/`: compiled agent knowledge and routing.

## Major User Routes

| Route | Purpose |
|-------|---------|
| `/` | Home and weekly broadcast calendar |
| `/tier` | Seasonal Tier board |
| `/dashboard` | Subscription and viewing analysis |
| `/explore` | Discovery and historical anime search |
| `/watchlist` | Detailed viewing-status management |
| `/voice-actors` | Voice actor discovery |
| `/settings` | Account and application settings |
| `/share/*` | Public sharing experiences |

Route behavior and labels can change. Verify against `app/` and the active UX
decision source before implementation.

## Data Flow

1. Anime metadata comes from `lib/anime-sources/` and seasonal API routes.
2. User viewing state is stored through `lib/statuses.ts` and
   `/api/statuses`.
3. Tier board persistence uses `lib/boards.ts` and `/api/boards`.
4. Streaming enrichment uses AniList streaming data and TMDb provider data.
5. Sharing uses snapshot or live-share domain modules under `lib/` and
   `/api/shares`.

## Client and Server Pattern

- App Router pages load authenticated server data where appropriate.
- Client components own interactive state and optimistic updates.
- API routes follow shared auth and error wrappers under `lib/api/` and
  `lib/errors/`.
- Seasonal client caching and prefetching live under
  `lib/seasonal-anime-client-cache.ts` and `lib/use-seasonal-prefetch.ts`.

## Validation Baseline

For implementation changes:

```powershell
npx tsc --noEmit
npm.cmd run build
```

User-facing UI changes also require smartphone-width verification and mojibake
inspection as defined in `AGENTS.md`.

## Related

- [Current State](./current-state.md)
- [Sources](./sources.md)
- [`docs/UX_DIRECTION.md`](../docs/UX_DIRECTION.md)
