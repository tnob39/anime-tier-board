# N4 Prefetch Optimization — Implementation Report (2026-06-22)

Related: GitHub Issue #134

## Summary
Implemented all four items in TASK_N4_SPEC.md to make `/tier` load fast via cache persistence + SSR seed, prefetch home cards, and eliminate full-page reloads on GlobalNav logo.

Base: post N1/N2/N3 (home is broadcast calendar + 4-tab nav; /subscriptions merged into dashboard).

## Files Changed
- `lib/seasonal-anime-client-cache.ts` — sessionStorage persistence + restore on read miss
- `app/tier/page.tsx` — async server component; fetches current season and passes initial to TierBoardApp
- `components/TierBoardApp.tsx` — accept initial props, sync seed on first render, prefill items/cached/loading for current season
- `app/home-client.tsx` — add `router.prefetch("/watchlist")` and `router.prefetch("/tier")` (home broadcast-calendar cards benefit)
- `components/GlobalNav.tsx` — `<a href="/">` → Next.js `<Link href="/">` (same class/aria/label)
- `app/updates/page.tsx` — added 1.19 release entry (user-visible perf + no-reload), marked isLatest

## Cache-Key Scheme (sessionStorage)
- Versioned key pattern: `atb:seasonal:<year>:<season>` (e.g. `atb:seasonal:2026:SPRING`)
- Stored value: `{ storedAt: number, data: SeasonalAnimeClientResponse }`
- TTL: reuses `CACHE_TTL_MS` (10min). On restore, if expired remove and fall back to network.
- On any `writeCache` (network response or `seedSeasonalAnimeCache`), we also `persistToSessionStorage`.
- `readCache` on miss/expired: attempts `tryRestoreFromSessionStorage`; if valid, populates in-memory Map with fresh TTL and returns.
- Graceful: all sessionStorage access wrapped in try/catch; JSON parse errors and quota silently ignored (fall back to fetch).
- Data shape returned to callers unchanged (`SeasonalAnimeClientResponse`).

In-memory Map remains the hot path; sessionStorage is the reload/direct-access survival layer.

## /tier SSR Seed
- `app/tier/page.tsx` is now an async Server Component.
- On server: `getCurrentAnimeSeason()` + `fetchCurrentSeasonAnimeForHome()` (same source/enrich path used by home).
- Passes `initialSeasonalAnime`, `initialYear`, `initialSeason` to `<TierBoardApp ... />`.
- In TierBoardApp (client):
  - Sync guard: `if (initial && !seededRef.current) { seedSeasonalAnimeCache(...) }`
  - Initial `useState` for `items` / `cached` / `loading` prefill when the starting selection matches the seeded current season.
  - `loadAnime` still runs (to reconcile boards, set source/warning etc.) but `fetchSeasonalAnimeClient` hits the seeded in-memory cache → resolves synchronously with no network.
- Result: direct hit / reload / logo-nav to /tier serves the seasonal list from SSR seed without client waterfall for the initial current season. User can still switch year/season (triggers normal fetch).
- Consistent with home seeding via `useSeasonalPrefetch` + `seedSeasonalAnimeCache`.

No changes to API response shapes or other pages.

## Home Cards Prefetch
- `app/home-client.tsx` (post-N1c broadcast calendar structure) now calls:
  - `router.prefetch("/watchlist")`
  - `router.prefetch("/tier")`
- This covers the WeeklyBroadcastCalendar cards (rendered via CardLane/LaneCard buttons using `onItemClick` → router.push).
- Existing `useSeasonalPrefetch` already primes seasonal data on home mount (for both logged-in and guest).
- MobileNav `<Link href="/tier">` provides additional route prefetch by Next.js.

## GlobalNav Logo
- Changed from native `<a href="/">` (full reload) to `<Link href="/">`.
- Visual, aria-label, and class preserved exactly.
- Stops full reload when clicking logo from anywhere.

## Verification Results
- `npx tsc --noEmit`: PASS (exit 0)
- `npm run build`: PASS (exit 0). All routes compiled; /tier remains dynamic (server fetch) as expected.
- No mojibake introduced (rg for common garble patterns only hit AGENTS.md doc; Japanese in RELEASES verified round-tripped via node fs read).

## Assumptions / Risks
- SSR seed only for *current* season on initial render of /tier. Non-current year/season or "再取得" still go to network (correct per design).
- Prefill of items/board state: we prefill items + cached/loading for instant first paint. Board reconciliation (remote/local) still happens in loadAnime; if storage differs slightly there may be a micro correction after mount (low risk).
- sessionStorage is per-tab/session; cross-tab or private mode may not share (acceptable; in-memory + API remain fallback).
- We did not convert broadcast calendar cards from `<button>` to `<Link>` (would have required larger refactor of CardLane/LaneCard + onItemClick model for /watchlist). Used `router.prefetch` as explicitly allowed by spec.
- Did not touch /dashboard, /subscriptions, or subscription-related nav links (per constraints).
- Updates RELEASES updated only because faster load + no logo reload are user-visible.
- Cache key deliberately uses "atb:" prefix to avoid collision with other local keys (e.g. board storage uses different prefix).

## Why reload / direct /tier is now faster
1. Server component runs `fetchCurrentSeasonAnimeForHome` during render and ships the items in the initial HTML payload.
2. Client hydrates and immediately calls `seedSeasonalAnimeCache`, writing into the module Map.
3. TierBoardApp's first `fetchSeasonalAnimeClient` call sees the entry → `Promise.resolve(cached)` (no `/api/anime/seasonal` request).
4. On full browser reload or new tab direct navigation: in-memory Map is gone, but first `readCache` miss triggers restore from `sessionStorage` (if within TTL), repopulating the Map before the fetch call.

## Why logo no longer full-reloads
`<Link>` from Next.js performs client-side navigation (SPA). The page component for "/" is reused; no full document reload occurs.

## Open Items / Follow-ups
- None for this scoped task. Future: could prefetch other seasons on demand or add pointerenter prefetch hooks to specific calendar cards if needed.
