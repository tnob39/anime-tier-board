# TASK: Analytics event instrumentation (GitHub issue #388)

You are implementing measurement events in this Next.js (App Router) anime
tracking app. Design source: docs/native-ia-redesign-20260710.md section 9.

## Goal

Instrument the user-behavior events needed to validate the IA redesign
(EPIC #384), with a thin abstraction so the backend (GA4/Firebase or other)
can be decided later without touching call sites.

## Step 1: Investigate (before writing code)

- Check whether any analytics SDK (GA4/gtag, Firebase, Vercel Analytics,
  Plausible, etc.) is already integrated (package.json, app/layout.tsx,
  <Script> tags, env vars in .env.example).
- If one exists, wire the abstraction to it. If NONE exists, implement the
  abstraction with a console.debug (dev only) + no-op (production) fallback,
  so events are visible in dev tools and the call sites are ready.

## Step 2: Abstraction

- New file `lib/analytics.ts`:
  - `track(event: AnalyticsEvent): void` - fire-and-forget, never throws,
    SSR-safe (no-op on server).
  - `AnalyticsEvent` = discriminated union of typed events (below), so a
    typo in an event name is a compile error.
- NO new npm dependencies. NO PII in any payload (no email, no user id from
  the session - anonymous usage only).

## Step 3: Events to instrument

| event name | params | fire where |
|---|---|---|
| home_card_tap | card_type: "calendar" \| "context_tier" \| "context_subsc" \| "add_section" | home card taps (incl. HomeContextCards CTA) |
| context_card_dismiss | card_type: "tier" \| "subsc" | HomeContextCards dismiss buttons |
| status_update | from, to (ViewingStatus), source: "bottom_sheet" \| "edit_sheet" \| "quick_add" | StatusBottomSheet + watchlist editor + quickSetStatus |
| episode_update | source: "bottom_sheet" \| "edit_sheet" | watchedEpisodes changes |
| tab_switch | to: pathname | MobileNav item clicks |
| tier_share_create | (none) | tier share creation |
| watchlist_share_create | (none) | watchlist share creation |
| search | query_type: "explore" | explore search submit (if a search box exists) |

- If a listed fire-point does not exist in the code, skip it and say so in
  the final summary. Do not invent UI.
- Keep call-site changes minimal (one line per site where possible).

## Step 4: Event dictionary doc

- New file `docs/analytics-events.md`: table of every event, its params,
  where it fires, and the question it answers (tie back to
  docs/native-ia-redesign-20260710.md section 9 metrics).

## Process rules

- Run `npm install` first if node_modules is absent.
- Verify with `npx tsc --noEmit`. Do NOT run `npm run build` (the acceptance
  agent will).
- Do NOT add a RELEASES entry (internal change, not user-facing).
- Do not commit files named AGENT_TASK*.md or `Hermes`.
- All source files UTF-8; user-visible strings unchanged.
- Final summary: files changed, events wired vs skipped, how to see events
  in dev (console).
