# Hermes / Grok Composer Handoff

Last updated: 2026-06-05

## Purpose

This document is a handoff note for continuing development in Hermes / Grok Composer.
The current branch contains unfinished work for two internal-use brush-up features:

1. Historical anime exploration and personal recommendations.
2. Voice actor discovery from saved anime metadata.

The app is not being prepared for broad public release right now. Optimize for a small trusted group using the app.

## Current Worktree State

Expected dirty state:

- Modified:
  - `app/globals.css`
  - `components/TierBoardApp.tsx`
- Untracked:
  - `app/explore/`
  - `app/voice-actors/`
  - `Hermes` exists but is unrelated and should not be committed unless the user explicitly asks.

Do not revert unrelated work. Continue from this state.

## Already Implemented In This WIP

### `/explore`

Files:

- `app/explore/page.tsx`
- `app/explore/explore-client.tsx`

Intended behavior:

- Requires Google login.
- Reads saved statuses through `listStatuses`.
- Lets the user choose year and anime season.
- Calls existing `/api/anime/seasonal?year=...&season=...`.
- Sort modes:
  - personal fit
  - popularity
  - score
- Adds selected anime to watchlist by saving `planned` through `/api/statuses`.
- Uses only on-demand fetches. Do not bulk crawl historical anime data.

### `/voice-actors`

Files:

- `app/voice-actors/page.tsx`
- `app/voice-actors/voice-actors-client.tsx`

Intended behavior:

- Requires Google login.
- Reads saved statuses through `listStatuses`.
- Groups saved anime by `anime.voiceActors`.
- Shows actor name, native name, image if available, profile link, and saved anime appearances.
- Search by actor name, native name, or anime title.

### Top Navigation

File:

- `components/TierBoardApp.tsx`

Added mobile-first icon links:

- `/explore` with `Compass`
- `/voice-actors` with `Mic2`

Existing icon links:

- `/dashboard` with `BarChart3`
- `/watchlist` with `ListChecks`

### CSS

File:

- `app/globals.css`

Added styles for:

- `.explore-*`
- `.voice-*`

The intended visual style is the existing mobile-first white surface, thin border, 8px radius design.

## Known Issues To Fix First

1. Japanese text mojibake

Some newly added and existing files show mojibake in terminal output. Before finalizing, inspect rendered UI or source encoding and normalize visible Japanese strings.

Examples likely needing correction:

- `app/explore/explore-client.tsx`
- `app/voice-actors/voice-actors-client.tsx`
- Some existing strings in `components/TierBoardApp.tsx`
- Some existing strings in `lib/types.ts` for `SEASON_LABELS`

Recommended visible labels:

```ts
const seasonLabels = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋"
};

const statusLabels = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "保留",
  dropped: "中止"
};
```

2. Type/build not yet run after WIP

After fixing text and obvious issues, run:

```powershell
cmd /c npx tsc --noEmit
cmd /c npm run build
```

3. No commit yet for this WIP

After verification, commit only relevant files:

```powershell
git add app/explore app/voice-actors app/globals.css components/TierBoardApp.tsx
git commit -m "Add explore and voice actor discovery"
```

Leave `Hermes` untracked unless instructed.

## Recommended MVP Spec

### Explore Page

Goal:

Let a trusted user browse older anime by year/season and quickly add candidates to the watchlist.

MVP controls:

- Year selector: 1990 to current year.
- Season selector: winter / spring / summer / fall.
- Sort chips:
  - Recommended
  - Popular
  - Score
- Fetch button.

MVP cards:

- Poster thumbnail.
- Rank number.
- Title.
- Popularity.
- Score.
- Fit score.
- Short reason.
- Current saved status if already saved.
- `見たい` button if not saved.
- External detail link.

Recommendation heuristic:

- Use saved user data only.
- Positive signals:
  - favorite level
  - completed/watching status
  - genre match
  - studio match
  - voice actor match
  - public score
  - public popularity
- Negative signal:
  - already completed or dropped.

Do not add AI recommendations yet. Start with transparent local scoring.

### Voice Actors Page

Goal:

Let the user discover saved anime by voice actor and find patterns in their preferences.

MVP controls:

- Search input.

MVP cards:

- Actor image or fallback icon.
- Actor name.
- Native name.
- Source profile link if available.
- Saved works list:
  - anime poster
  - anime title
  - saved status
  - character name
  - role if available

Limitations:

- This MVP only uses voice actor metadata already present in saved anime snapshots.
- Do not fetch full external person pages yet.
- Do not build a local full voice actor database.

## Important Product Constraints

Because this app uses AniList/Jikan metadata:

- Keep historical browsing on-demand.
- Do not crawl 20-30 years of anime in the background.
- Do not bulk store external anime catalog data in Turso.
- Store user actions and minimal snapshots needed for saved items only.
- Link back to source pages.

This keeps the internal-use feature aligned with the current app and reduces API/legal risk.

## Files Worth Reading Before Continuing

- `PRODUCT_REVIEW_AND_ROADMAP.md`
- `lib/types.ts`
- `lib/statuses.ts`
- `lib/anime-sources/index.ts`
- `app/api/anime/seasonal/route.ts`
- `components/TierBoardApp.tsx`
- `app/watchlist/watchlist-client.tsx`
- `app/dashboard/dashboard-client.tsx`

## Suggested Grok Composer Prompt

Paste this into Hermes / Grok Composer:

```text
You are continuing development in C:\Users\Nobu\.claude\anime-tier-board.

Read HERMES_GROK_HANDOFF.md and continue from the current dirty worktree. Do not revert unrelated user changes. Do not commit or track the unrelated Hermes file.

Goal:
Finish the internal-use MVP for:
1. /explore historical anime exploration with on-demand year/season fetch, recommendation/popularity/score sorting, and add-to-watchlist.
2. /voice-actors voice actor discovery from saved anime metadata.

First fix visible Japanese mojibake in the new pages and any touched navigation labels. Then run:
cmd /c npx tsc --noEmit
cmd /c npm run build

If tests pass, commit only relevant files with:
git add app/explore app/voice-actors app/globals.css components/TierBoardApp.tsx
git commit -m "Add explore and voice actor discovery"

Keep the app mobile-first. Do not add bulk historical crawling. Do not store full external catalogs.
```

## Done Criteria For This Handoff

Hermes/Grok Composer can take over when:

- This file exists.
- The WIP files remain in the working tree.
- The next agent knows not to touch `Hermes`.
- The next agent knows the first task is text normalization plus type/build verification.
