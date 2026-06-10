# Product Review And Roadmap

Last updated: 2026-06-05

## Summary

Anime Tier Board is currently a personal anime evaluation and tracking app.
The strongest direction is to keep three surfaces clearly separated:

- Tier board: rank and compare anime visually.
- Watchlist: manage what the user is watching, wants to watch, when to watch, favorite level, and notes.
- Dashboard: summarize taste trends and share analysis.

The app can be released as a small MVP if it is positioned as a personal board/watchlist tool and not as a large public anime database. Before broader public release, add privacy/legal pages, basic abuse controls, and a stricter data/API policy.

## Current Feature Inventory

### Implemented

- Seasonal anime import from AniList with Jikan fallback.
- Year/season selector.
- Tier board editing with drag-and-drop and mobile move sheet.
- Google login through NextAuth.
- Turso persistence for boards, statuses, watchlist fields, comments, reactions, and share snapshots.
- Status management:
  - planned
  - watching
  - completed
  - paused
  - dropped
- Chip-based status selection on mobile.
- Watchlist page:
  - status
  - favorite level
  - watch timing
  - notes
  - broadcast / next episode / cour / streaming metadata when available
- Dashboard page:
  - status distribution
  - top genres
  - top studios
  - top voice actors
  - recent updates
- Share pages:
  - tier board share
  - watchlist share
  - dashboard share
  - comments
  - reactions
- Image proxy with HTTPS-only validation, local/private IPv4 blocking, content-type check, and 8MB max response size.

### Known Rough Edges

- Some legacy Japanese text in repository files appears mojibake in terminal output. The app currently builds, but future UI text should be normalized carefully.
- No public privacy policy, terms page, contact page, or deletion request flow.
- No rate limiting on comment/reaction/share APIs.
- No moderation controls for comments.
- Image proxy does not currently block all SSRF edge cases, such as DNS rebinding, link-local ranges, or private IPv6 ranges.
- External anime data terms need active product constraints before broad release.

## Release Readiness

### MVP Public Release: Conditional Go

Release is reasonable for a limited MVP if all of the following are true:

- The app is described as a personal anime tier/watchlist tool.
- Users sign in only with basic Google profile/email scopes.
- A privacy policy explains exactly what is stored:
  - Google user ID
  - display name/image for comments
  - board data
  - watchlist/status data
  - notes
  - reactions/comments
- A contact/deletion path is available.
- External anime data is not bulk-copied into a permanent database.
- Shared pages are understood to be public-by-link.

### Broader Public Launch: Not Yet

Do not market broadly until these are added:

- Privacy Policy page.
- Terms / acceptable use page.
- Account data export/delete request flow.
- Comment rate limit.
- Comment deletion or owner moderation.
- API usage guardrails for historical browsing.
- Image proxy allowlist or DNS/IP validation hardening.

## Legal And Copyright Review

This is not legal advice. It is an engineering risk review based on current source terms.

### AniList

AniList API terms say the API is free for non-commercial usage, prohibit using the API as backup/data storage, prohibit hoarding or mass collection, require naming compliance, and restrict competing noncomplementary anime/manga list or tracker services. Commercial apps under $150/month revenue can use the API without express permission; above that needs a license discussion.

Source: https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use

Implications:

- Current seasonal fetching is acceptable only if it stays user-facing, on-demand, and lightly cached.
- The app should not present itself as AniList/AniChart.
- The app should not become a full AniList replacement or bulk anime database.
- Historical ranking must avoid background crawling 20-30 years of seasons into local storage.
- If revenue exceeds the stated threshold or if the app becomes a broad tracker, contact AniList.

### Jikan / MyAnimeList Data

Jikan is an unofficial API for MyAnimeList. Its docs indicate users agree to Jikan terms and can be rate limited. Because it fronts MyAnimeList data unofficially, it should be treated as fallback/reference metadata, not as a guaranteed commercial-grade data source.

Sources:

- https://docs.api.jikan.moe/
- https://jikan.moe/

Implications:

- Keep Jikan fallback on-demand.
- Avoid mass crawling historical data.
- Add cache and rate-limit behavior before adding large historical browsing.
- Prefer linking to source pages instead of reproducing full database pages.

### Images And Posters

Anime cover images are likely copyrighted by rights holders. The current app displays third-party image URLs through a proxy and caches them briefly. This is still a risk area.

Recommended constraints:

- Use small thumbnails only.
- Link back to the source anime page.
- Do not offer bulk image export as a standalone image pack.
- Avoid long-term poster storage in Turso.
- Add a contact/removal request path.
- Consider switching image proxy to an allowlist of known image hosts.
- For public landing/marketing pages, avoid using copyrighted anime posters without permission.

### Google OAuth

Google OAuth verification guidance says apps using sensitive or restricted scopes need verification. Apps using only non-sensitive scopes may not need full verification, but brand verification is needed for displaying app name/logo on the consent screen. Google also requires privacy policy disclosures for how Google user data is accessed, used, stored, and shared.

Sources:

- https://support.google.com/cloud/answer/13463073
- https://support.google.com/cloud/answer/13464321

Implications:

- Keep scopes minimal: profile/email only.
- Add privacy policy before broader launch.
- If Google shows unverified warnings, complete brand verification.
- Do not add Google Drive/Calendar/Gmail scopes unless there is a concrete shipped feature.

## Security Review

### Current Positive Controls

- Server-side auth checks for board/status/watchlist/dashboard share creation.
- Turso env vars are server-side.
- Comments are rendered through React, reducing direct XSS risk.
- Image proxy blocks non-HTTPS URLs and common private IPv4 hosts.
- Payload size limits exist for board, status, and share creation.
- Share IDs are random and hard to guess.

### Gaps To Fix Before Broader Release

1. Rate limiting

Add per-user/IP rate limits for:

- comments
- reactions
- share creation
- anime seasonal fetch
- image proxy

2. Image proxy SSRF hardening

Current host string checks do not cover:

- DNS rebinding
- 169.254.0.0/16
- private IPv6 ranges
- encoded or unusual IP formats
- redirects to private hosts

Recommended MVP fix:

- Restrict image proxy to known CDN/image hosts returned by AniList/Jikan.
- Disable redirects or validate final URL after redirect.
- Add 2-3 second timeout.

3. Comment moderation

Add:

- owner delete comment
- report/hide comment
- basic spam throttle

4. User data management

Add:

- privacy policy
- delete account/data request
- shared page visibility warning
- note that share URLs are public by link

5. Security headers

Review Next/Vercel headers:

- Content-Security-Policy
- Referrer-Policy
- X-Content-Type-Options
- Permissions-Policy

## Next Brush-Up Ideas

### 1. Historical Anime Explorer

Goal:

Users can browse anime from 20-30 years ago, compare generations, and find what to watch next.

Recommended MVP:

- Add `/explore` page.
- Filters:
  - decade
  - year
  - season
  - genre
  - status: unseen / watching / completed
- Ranking modes:
  - popularity
  - score
  - favorites
  - personal fit
- Show 20-50 items per user-triggered query.
- Do not prefetch all years.

Data strategy:

- Fetch on demand by selected year/season.
- Cache response for a short period.
- Store only user interactions and minimal anime snapshot needed for the user feature.
- Do not run background jobs that crawl all seasons.

Recommendation strategy:

- Use existing dashboard signals:
  - top genres
  - studios
  - voice actors
  - statuses
  - favorite levels
- Score candidates with a transparent local heuristic first.
- Later add AI summaries/reasons if needed, but avoid sending unnecessary user data.

### 2. Generation Ranking

Goal:

Create rankings such as "1990s classics", "2000s gateway anime", "2010s high-score shows".

Recommended UI:

- Mobile-first decade tabs.
- Ranking cards with poster, title, year, score/popularity, and "why recommended".
- One-tap actions:
  - add to watchlist
  - mark interested
  - hide

Risk control:

- Rankings should be generated from on-demand results, not a permanently copied historical database.
- Link to source pages.

### 3. Voice Actor Pages

Goal:

Users can inspect a voice actor and see related roles/works, then discover new anime.

Recommended MVP:

- Add `/people/[id]` or `/voice-actors/[id]`.
- Entry points:
  - dashboard top voice actors
  - anime detail/card metadata
- Show:
  - name
  - native name
  - character/role in saved anime
  - related anime already in user's watchlist
  - recommended unseen works

Data strategy:

- Use AniList person/character data on demand.
- Cache briefly.
- Store only user actions, not a full person database.

### 4. Anime Detail Sheet

Goal:

Reduce clutter in Tier cards and Watchlist cards.

Recommended MVP:

- Tap anime card opens bottom sheet.
- Sections:
  - synopsis link/source
  - airing/cour
  - studios
  - voice actors
  - streaming links
  - actions

### 5. Recommendation Engine

Goal:

Tell users "what should I watch next?" based on their own behavior.

MVP heuristic:

- + genre match
- + studio match
- + voice actor match
- + high public score/popularity
- + same decade preference
- - already completed/dropped
- - hidden by user

Output:

- 5 recommendations.
- Explain each recommendation in 1-2 short reasons.

## Recommended Implementation Order

1. Public readiness baseline

- Add Privacy Policy page.
- Add Terms / acceptable use page.
- Add data deletion/contact note.
- Add share visibility copy.
- Add image proxy allowlist.
- Add comment/share rate limits.

2. Anime detail sheet

- Move metadata into a consistent mobile bottom sheet.
- Use this sheet from Tier, Watchlist, Dashboard recent, and future Explorer.

3. Historical Explorer MVP

- Add year/decade browsing.
- On-demand fetch only.
- Add to watchlist action.

4. Recommendation MVP

- Use current dashboard/watchlist data.
- Add "次に見るおすすめ" section to Watchlist and Dashboard.

5. Voice actor pages

- Link top voice actors from Dashboard.
- Add voice actor profile page and related works.

## Competitive And Distribution Strategy

See [`plans/mobile-distribution-monetization-20260609.md`](./plans/mobile-distribution-monetization-20260609.md) for:

- Mobile distribution roadmap (PWA → Capacitor, not full native)
- Affiliate-first monetization and when to add ads
- Defensible moats: cross-season user data, sharing/network effects, brand
- Store submission prerequisites (AniList commercial license, legal pages)

Tier-list UI alone is easy to copy. Prioritize features that compound per user and per season.

## Product Positioning

Use this wording:

"自分のアニメ視聴・評価を整理するための個人用ボード/ウォッチリスト"

Avoid this wording:

- "AniList alternative"
- "MyAnimeList replacement"
- "complete anime database"
- "all anime posters archive"

This positioning lowers API and copyright risk and keeps the product focused.

## Decision

Recommended next engineering task:

Add public-readiness pages and guardrails before implementing the historical explorer:

- `/privacy`
- `/terms`
- share visibility copy
- image proxy allowlist
- comment/share rate limiting

After that, implement `/explore` with on-demand historical browsing and no bulk crawling.
