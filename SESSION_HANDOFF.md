# Session Handoff

## Project

- Local path: `C:\Users\Nobu\.claude\anime-tier-board`
- GitHub: `tnob39/anime-tier-board`
- Production: `https://anime-tier-board.vercel.app`
- Vercel/GitHub connection: configured
- Production check: user confirmed release is working

## Current Features

- Anime tier board
- Google authentication
- Turso-backed persistence
- `/watchlist` viewing management page
- `/dashboard` analytics page
- `/explore` historical anime discovery page
- `/voice-actors` voice actor page
- Mobile bottom navigation
- Share pages, comments, reactions
- Streaming platform candidate display
- `映画OFF` and `旧作OFF` filters
- Watchlist changes are saved explicitly via `保存する`

## Recent Commits

- `0e0eff6 Add explicit watchlist save action`
- `f754966 Add mobile bottom navigation`
- `7732f6e Add streaming filters and discovery pages`

## Important Implementation Notes

- Watchlist persistence uses:
  - `/api/statuses` for viewing status
  - `/api/watchlist` for favorite level, watch slot, and notes
  - `lib/statuses.ts` for Turso access
- Anime metadata is mostly saved as `anime_json`, so many metadata additions do not require DB schema changes.
- Streaming platform data is currently derived mainly from AniList `streamingEpisodes`; Japan availability is not guaranteed.
- `/explore` and `/voice-actors` require login and redirect to `/` when unauthenticated.
- `Hermes` may remain as an untracked local file. Ignore unless the user explicitly asks to clean it up.

## Strategy Decisions (2026-06-09)

Documented in [`plans/mobile-distribution-monetization-20260609.md`](./plans/mobile-distribution-monetization-20260609.md) and [`MONETIZATION_ROADMAP.md`](./MONETIZATION_ROADMAP.md):

- Mobile: PWA first, then Capacitor store wrapper (not full native rewrite).
- Revenue: affiliate-first on streaming links; display ads deferred.
- Competition: moat via user data, sharing culture, and brand—not tech secrecy.

## Recommended Next Work

1. Merge `tnob39/decide-tonight` to main (Issue #2 closed but not on main).
2. PWA (`manifest` + icons) per monetization Phase 0.
3. Affiliate URL wiring in `lib/streaming-services.ts` + PR disclosure UI.
4. Fix remaining mojibake / garbled Japanese UI text across the app.
5. Public readiness: Privacy Policy / Terms (`PRODUCT_REVIEW_AND_ROADMAP.md`).
6. Improve watchlist sync UX with clearer card-level saved/unsaved/error states.

## Verification Baseline

Before the latest release:

- `npx tsc --noEmit` passed
- `npm run build` passed
- User confirmed production release succeeded

