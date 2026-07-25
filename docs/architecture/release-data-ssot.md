# Release Data SSOT — Jikan Sunset & Native Release Gates

| Field | Value |
|---|---|
| Status | **Normative sole source of truth** |
| Parent | [#314](https://github.com/tnob39/anime-tier-board/issues/314) Jikan Public API 終了への対応とデータソース戦略の見直し |
| Issue | [#670](https://github.com/tnob39/anime-tier-board/issues/670) docs(data): Jikan sunset とネイティブ公開ゲートを SSOT 化 |
| Applies to | Server seasonal fetch (`lib/anime-sources`), durable store (Turso), Web + Native clients |
| Native applicability | `apps/native` package version **`>= 1.0.0`** (current `package.json` version is `1.0.0`) |
| Document owner | Data Platform (primary), Release Manager (gates & rollback), Product Owner (UI contract) |
| Last decided | 2026-07-25 |

This file is the **sole normative** policy for seasonal anime acquisition after Jikan Public API sunset planning under [#314](https://github.com/tnob39/anime-tier-board/issues/314). Implementation PRs, release checklists, runbooks, and client UX must conform to this document. Contradictory prose elsewhere is non-normative and must be updated or deferred to this SSOT.

---

## 1. Hard cutoff (server-enforced)

| Parameter | Decision |
|---|---|
| Cutoff instant | **`2026-09-15T00:00:00Z`** (inclusive start of post-cutoff regime) |
| Enforcement locus | **Server only** — API route / `lib/anime-sources` (or successor) evaluates wall clock in UTC |
| Client clocks | Clients must not decide Jikan network eligibility; they consume server responses and provenance |
| Pre-cutoff | `request_time < 2026-09-15T00:00:00Z` |
| Post-cutoff | `request_time >= 2026-09-15T00:00:00Z` |
| Relation to Jikan public end | Jikan Public API ends 2026-10-01; our cutoff is **16 days earlier** to absorb migration risk before external hard-stop |

After cutoff, the server **must not open any new outbound HTTP(S) connection** to Jikan hosts (`api.jikan.moe` and documented successors used by this codebase), **except** the single explicit emergency path in §9.

**Post-cutoff Jikan network predicates (normative):**

| Predicate | Result |
|---|---|
| Default post-cutoff | Jikan network **forbidden** |
| §9 emergency active (all of: Release Manager flag on, within strict 24h TTL, `request_time < 2026-10-01T00:00:00Z`, server-side evaluation) | **One** logical paginated Jikan fallback operation allowed (§3.0 caps) |
| Flag off, expired, client-side, or `request_time >= 2026-10-01T00:00:00Z` | Jikan network **forbidden** (`jikan_outcome=disabled`) |

No other feature flag, env var, or local override may re-enable Jikan network past cutoff.

---

## 2. Current vs future behavior

### 2.1 Current behavior (code as of SSOT authorship; pre-policy implementation)

Observed in `lib/anime-sources/index.ts` and related clients:

| Topic | Current |
|---|---|
| Primary source | AniList seasonal fetch first |
| Fallback | On **any** AniList throw, one Jikan seasonal fetch |
| AniList attempt budget | Unbounded single call path (no hard 6s abort in source layer) |
| Jikan attempt budget | One attempt after AniList failure |
| Empty AniList results | Treated as success with empty list (no Jikan fallback for empty) |
| In-process cache | 10 minutes TTL (`CACHE_TTL_MS = 10 * 60 * 1000`) |
| Durable DB as seasonal SSOT | Not the primary seasonal path; Turso holds user data + snapshots where implemented |
| Freshness model | Home snapshot helper supports `fresh` / `stale` / `unavailable`; seasonal source layer does not yet emit the 24h / 7d / >7d product tiers |
| Source attribution | `source: "anilist" \| "jikan"` on results; warning string on Jikan fallback |
| Native version | `apps/native` at **1.0.0** |

### 2.2 Future / required behavior (normative target)

| Topic | Required |
|---|---|
| Primary source | **AniList only** for all new live seasonal acquisition |
| Pre-cutoff Jikan | Allowed **only** under §3 fail-over rules (not on arbitrary errors) |
| Post-cutoff Jikan network | **Disabled** by default — zero new Jikan requests, **except** §9 emergency (Release Manager, server-side, 24h TTL, before 2026-10-01) |
| Attempt budget | Exactly **one** AniList **logical attempt** (≤6s wall, §3.0) then, if eligible, exactly **one** Jikan **logical attempt** (pre-cutoff fail-over, or §9 emergency) |
| Empty / malformed AniList | Eligible for pre-cutoff Jikan fail-over (§3) |
| In-process / edge cache | Subordinate to durable snapshot rules; product freshness uses §5 tiers |
| Durable snapshot | Last successful AniList (or pre-cutoff / §9 emergency attributed) payload retained for stale serve under the **7-day catalog ceiling** |
| Provenance | Every item and response carries source + fetch timestamp + freshness class |
| Invented data | **Forbidden** — no synthetic titles, scores, or airing rows to fill gaps |
| Native policy | Mandatory for native **1.0.0+** store / TestFlight / production builds |

---

## 3. Live fetch policy (pre-cutoff)

### 3.0 Attempt definition (logical operation vs HTTP requests)

An **attempt** is exactly **one logical paginated upstream operation** for a single seasonal request key `(year, season)` (or one yearly aggregate key). It is **not** “one HTTP socket” and **not** “unlimited pages until done.”

| Term | Definition |
|---|---|
| **Logical attempt / logical paginated operation** | The complete work unit to obtain one seasonal-key result set from one upstream (AniList or Jikan), including any required page walks that belong to that same operation |
| **HTTP request / page** | One discrete HTTP(S) request to the upstream (e.g. one GraphQL call, one Jikan page URL) |
| **AniList attempt cap** | **1** logical attempt per client seasonal request; wall-clock budget **6 seconds total** for the whole attempt; at most **5** HTTP pages/requests inside that attempt; no second logical attempt on the same request |
| **Jikan attempt cap (pre-cutoff fail-over)** | **1** logical attempt per client seasonal request after AniList fail-over trigger; wall-clock budget **6 seconds total**; at most **5** HTTP pages/requests inside that attempt |
| **Jikan attempt cap (§9 emergency)** | Same as pre-cutoff Jikan: **1** logical paginated fallback operation, **max 5 HTTP pages**, **total 6s** wall budget; never a second logical Jikan operation on the same request |
| **Exhaustion** | If page cap or time budget is hit before a complete well-formed set, the attempt **fails** (no partial silent success that pretends completeness unless the upstream explicitly signals end-of-list within caps) |

Normative equalities used elsewhere in this document:

- “Exactly one AniList attempt” = one AniList logical paginated operation under the AniList caps above.
- “Exactly one Jikan attempt” = one Jikan logical paginated operation under the Jikan caps above.
- Matrix column **Jikan network** values `one` / `one allowed` mean **one logical attempt** (≤5 HTTP pages, ≤6s), not one HTTP only and not unbounded pagination.

### 3.1 Sequence (mandatory order)

For each seasonal request key `(year, season)` or yearly aggregate:

1. **Fresh cache short-circuit (catalog/discovery):** If durable or memory cache for the key has `age ≤ 24 hours` (**fresh**), the server **may serve it directly** without a new upstream call. Telemetry: `source=cache|db_snapshot`, `freshness=fresh`, `anilist_outcome=skipped`, `jikan_outcome=skipped_*`.
2. **Stale cache (24h < age ≤ 7 days):** The server **must not** serve stale catalog/discovery items without first making **one** AniList logical attempt (§3.0).
   - On AniList **success** with non-empty well-formed items: return AniList as **fresh**; upsert snapshot.
   - On AniList **fail-over trigger** (§3.2) and pre-cutoff: one Jikan logical attempt; on Jikan success return jikan **fresh**; on Jikan failure go to step 4.
   - On AniList fail-over trigger post-cutoff without §9 emergency: **do not** call Jikan; go to step 4.
   - Telemetry must record the AniList outcome even when the eventual body is a stale snapshot.
3. **No usable snapshot, or age > 7 days (unusable):** Live refresh required — **Attempt A — AniList** (one logical attempt, §3.0). On success with non-empty well-formed items: return AniList; log `source=anilist`. On fail-over trigger and `request_time < cutoff`: **Attempt B — Jikan** (one logical attempt). On fail-over trigger post-cutoff: only §9 emergency may open Jikan; otherwise go to §4 unavailable path.
4. **Stale serve-after-failure only:** If a snapshot still has `24h < age ≤ 7d` and live path failed, serve that snapshot as **`stale`**. Never serve catalog/discovery items with `age > 7 days` as fresh or stale.
5. Never start a second AniList logical attempt on the same request after the first completes. Never chain more than one Jikan logical attempt per request.

### 3.2 AniList fail-over triggers (pre-cutoff Jikan allowed only for these)

Jikan live network (pre-cutoff) is permitted **only if all** hold:

- `request_time < 2026-09-15T00:00:00Z`
- Exactly one AniList logical attempt already finished
- Failure class is one of:

| Class | Definition |
|---|---|
| `timeout` | No complete logical-attempt result within 6s wall clock (including multi-page walk) |
| `transport` | DNS, TLS, connection reset, network unreachable, aborted socket |
| `http_429` | HTTP 429 from AniList |
| `http_5xx` | HTTP 500–599 from AniList |
| `malformed` | Body not parseable as expected GraphQL/media shape, or schema validation failure |
| `empty_results` | HTTP 2xx and parse OK but **zero** seasonal items for the requested key |

**Not** fail-over triggers (AniList error surfaces without Jikan):

- Client auth / session errors local to our API
- Request validation errors (bad year/season)
- Deliberate partial filters that legitimately yield empty after AniList returned data then filtered to zero by **our** post-processing (empty_results applies only to upstream empty seasonal set)

Post-cutoff Jikan is **not** governed by this table alone; it requires the full §9 emergency predicate set (§1, §4, §9).

### 3.3 Source attribution (logging)

Every live or cache-serve path must emit structured logs (or equivalent telemetry events) including at minimum:

| Field | Values |
|---|---|
| `seasonal_key` | e.g. `2026:FALL` |
| `source` | `anilist` \| `jikan` \| `cache` \| `db_snapshot` |
| `freshness` | `fresh` \| `stale` \| `unusable` \| `unavailable` |
| `anilist_outcome` | `success` \| `timeout` \| `transport` \| `http_429` \| `http_5xx` \| `malformed` \| `empty_results` \| `skipped` |
| `jikan_outcome` | `success` \| `error` \| `skipped_pre_policy` \| `skipped_post_cutoff` \| `disabled` |
| `fetched_at` | ISO-8601 UTC |
| `cutoff_regime` | `pre` \| `post` |
| `serve_path` | `fresh_direct` \| `stale_after_anilist_fail` \| `live_anilist` \| `live_jikan` \| `unavailable` (recommended; required when distinguishing fresh direct vs stale-after-fail) |

**Freshness telemetry rules:**

| Serve decision | Required telemetry |
|---|---|
| Fresh cache/snapshot direct serve (age ≤ 24h) | `freshness=fresh`, `anilist_outcome=skipped`, `jikan_outcome=skipped_*`, `serve_path=fresh_direct` |
| Stale serve only after AniList logical attempt failed | `freshness=stale`, `anilist_outcome=<fail class>`, `source=cache|db_snapshot`, `serve_path=stale_after_anilist_fail` |
| Live AniList success | `freshness=fresh`, `source=anilist`, `anilist_outcome=success` |
| Live Jikan success (pre-cutoff or §9) | `freshness=fresh`, `source=jikan`, `jikan_outcome=success` |

Response payloads that include seasonal items must expose provenance consumable by clients (`source`, `fetchedAt`, `freshness`).

---

## 4. Post-cutoff policy

Effective at **`2026-09-15T00:00:00Z`**:

| Rule | Decision |
|---|---|
| New Jikan network (default) | **Disabled** for all environments (prod, preview, local default) |
| **Sole exception** | §9 emergency Jikan: explicit exception to the normal post-cutoff prohibition; **Release Manager only**, **server-side only**, **one** logical paginated fallback operation (max **5** HTTP pages, total **6s** budget), **strict 24h TTL**, and only while `request_time < 2026-10-01T00:00:00Z` |
| AniList live | Remains the only non-emergency live seasonal upstream |
| AniList outage / fail-over classes | After mandatory AniList attempt, serve **last-known cached or DB snapshot** while age ≤ **7 days** as **`stale`** (catalog/discovery ceiling) |
| Snapshot age > 7 days | **`unavailable`** for catalog/discovery — do not return item bodies as if current |
| Data invention | **Never** — empty/unavailable preferred over fabricated rows |
| Pre-cutoff / emergency Jikan-sourced durable **catalog** snapshots | Readable only while within the **7-day** product freshness ceiling (§5); never as catalog fresh/stale beyond 7d |
| User-owned jikan metadata/provenance | Retained under §7 (**30-day** retention for user-list metadata only; does **not** authorize catalog serve) |
| Emergency re-enable | Only §9; not a general “feature flag soft reopen” |

---

## 5. Freshness tiers (product-wide)

Age is measured from `fetched_at` (successful upstream or snapshot write time) to `request_time`.

**Scope of the 7-day ceiling:** applies to **seasonal / discovery / catalog responses** (any surface that presents anime as current catalog). It does **not** extend catalog serve via the §7 30-day user-metadata rule.

| Tier | Age window | Server may return catalog items? | Serve rule | Client confidence |
|---|---|---|---|---|
| **fresh** | `0 < age ≤ 24 hours` | Yes | **May serve directly** from cache/snapshot without upstream | Confirmed / high |
| **stale** | `24 hours < age ≤ 7 days` | Yes, marked stale | **Must first attempt AniList** (one logical attempt); serve stale **only on AniList failure** (and Jikan path only if pre-cutoff fail-over or §9). Never serve stale as a silent short-circuit | Estimated / degraded |
| **unusable** | `age > 7 days` | No live presentation as current catalog; treat as missing for refresh purposes | Do not return as fresh or stale catalog items | Must not present as up-to-date seasonal data |
| **unavailable** | No snapshot, or snapshot unusable and live fetch failed | No catalog items (`items: null` or equivalent empty+error contract) | Explicit unavailable state | Explicit unavailable state |

Notes:

- In-process 10-minute cache is an implementation detail under **fresh** when backed by a recent successful fetch; it does not create a fourth product tier.
- Home / next-action modules already use `fresh` \| `stale` \| `unavailable`; they must map **unusable** snapshots to **unavailable** at the API boundary (clients never receive “unusable” with a full item list presented as valid).
- **30-day** figures in §7 never promote a catalog row into fresh/stale. Catalog hard-stops at **7 days**.

---

## 6. Cache, DB, source precedence, dedup, unmatched

### 6.1 Precedence (highest first)

When assembling a response for a seasonal key:

1. **In-process / request-coalesced memory cache** if `fetched_at` yields **fresh** (`age ≤ 24h`) and payload source is allowed → **may return directly** (`serve_path=fresh_direct`).
2. **Durable DB snapshot** for that key if **fresh** → same direct-serve rule as (1).
3. If snapshot/cache is only **stale** (`24h < age ≤ 7d`), or missing/unusable: **Live AniList** one logical attempt (and pre-cutoff Jikan only per §3; post-cutoff Jikan only per §9).
4. On live failure: degrade to durable/memory snapshot **only if still stale (≤7d)** (`serve_path=stale_after_anilist_fail`); else **unavailable**.
5. Never prefer a **jikan**-sourced snapshot over a newer **anilist**-sourced snapshot for the same key when both exist.
6. Never use a jikan row older than **7 days** as catalog fresh/stale, regardless of §7 30-day user-metadata retention.

### 6.2 Dedup identity

| Rule | Decision |
|---|---|
| Canonical id for AniList-native rows | AniList media id string (existing `AnimeItem.id` from AniList path) |
| Canonical id for historical Jikan rows | Existing Jikan/MAL-derived id string with `source: "jikan"` |
| Cross-source merge key | Prefer explicit AniList↔MAL mapping table when present; else title+season+year normalized match only for **migration backfill jobs**, not for silent runtime rewrite of user watchlist ids |
| Same-id collision | Last write from higher-precedence source wins for catalog fields; user status / watchlist rows keep stable `animeId` |

### 6.3 Unmatched records

| Situation | Decision |
|---|---|
| Jikan-only catalog row, no AniList match | Catalog/discovery: readable only while age ≤ **7 days** under §5; after that **unavailable** for discovery. User-owned lists: keep the row with provenance banner under §7 (metadata/provenance retention up to **30 days**; never reclassified as catalog fresh/stale after 7d) |
| AniList row missing fields Jikan once had | Leave null/absent; **do not** invent; optional subsequent Annict/X enrichment is outside this SSOT’s live seasonal path |
| Duplicate titles different ids | Keep both; ranking/sort uses popularity then Japanese title sort (existing comparator) |

### 6.4 Write rules

- Successful AniList fetch **upserts** durable snapshot for the key and sets `source=anilist`, `fetched_at=now`.
- Pre-cutoff (or §9 emergency) successful Jikan fail-over **may** upsert snapshot with `source=jikan` only when no fresher AniList snapshot exists.
- Post-cutoff without active §9 emergency: Jikan must not write new network-derived snapshots.
- §9 emergency success writes are attributed `source=jikan` with audit linkage to the emergency enable event; they still obey the **7-day** catalog freshness ceiling thereafter.

---

## 7. Historical Jikan records

| Rule | Decision |
|---|---|
| Read path (user-owned) | Existing `source=jikan` rows on **user-owned** lists/statuses/watchlist remain **readable as user records** with provenance (`source`, `fetched_at`) |
| **30-day retention — scope** | **ONLY** user-owned record **metadata / provenance** (that the user saved the entity; labels such as データ元: Jikan; “データ更新不可” class messaging). **Never** authorizes serving those rows as **catalog / discovery / seasonal** items under product tiers `fresh` or `stale` |
| Catalog / discovery / seasonal surfaces | Hard **7-day** ceiling (§5). Jikan-sourced catalog snapshots with `age > 7 days` are **unavailable** for catalog — **not** fresh, **not** stale |
| After 30 days without AniList match or backfill (user-owned) | User personal data may still show a tombstone/placeholder with “データ更新不可” until user removes or AniList match/backfill succeeds; no catalog promotion |
| Remediation | Batch or on-demand **AniList match/backfill** replaces id/fields when mapping confidence is high; otherwise leave catalog unavailable |
| New jikan ids post-cutoff | **Forbidden** via network except §9 emergency logical attempt; imports from static dumps also forbidden without Release Manager + legal sign-off |

**Explicit non-equivalence:** `30-day Jikan retention ≠ 30-day catalog freshness`. V16 and related gates must treat 7d–30d jikan rows as **catalog-unavailable**; user-list metadata path is separate.

---

## 8. User UI, offline, and recovery contract

### 8.1 UI contract (Web + Native 1.0.0+)

| State | User-visible behavior |
|---|---|
| fresh | Normal seasonal UI; optional subtle source label (AniList) |
| stale | Show content **and** non-blocking banner: データを更新できていません（キャッシュ表示・最大7日） |
| unavailable | Empty/error panel with retry; **no** fake titles |
| jikan provenance | Label データ元: Jikan（互換） when `source=jikan` |
| anilist provenance | Label データ元: AniList when `source=anilist` |
| user-list jikan metadata only | On personal lists when catalog refresh is unavailable: keep saved row + provenance / データ更新不可 — **not** presented as a live seasonal catalog card |

Copy must remain Japanese in product UI. No silent swap of source without label when `source=jikan`.

### 8.2 Offline (especially Native 1.0.0+)

| Condition | Behavior |
|---|---|
| Device offline, local cache age ≤ 24h | Serve as **fresh** from device cache if server previously delivered fresh payload |
| Device offline, 24h < age ≤ 7d | Serve as **stale** with banner (offline cannot re-attempt AniList; banner must remain honest) |
| Device offline, age > 7d | **unavailable**; prompt to reconnect |
| Never fabricate | Offline miss → unavailable, not fabricated anime cards |

### 8.3 Recovery

| Trigger | Action |
|---|---|
| User pull-to-refresh / retry | Server follows §3–§4 (online stale path must attempt AniList first); client shows loading then new freshness |
| Backfill job completes | Next fetch returns AniList-sourced fresh; jikan provenance cleared for that catalog key |
| Extended AniList outage > 7d | All clients converge to unavailable for seasonal live surfaces; user lists remain under §7 metadata rules |

---

## 9. Emergency rollback

The emergency path is an **explicit, sole exception** to the normal post-cutoff prohibition on Jikan network (§1, §4). It is not a general reopen of pre-cutoff policy.

| Parameter | Decision |
|---|---|
| Authority | **Release Manager only** (named on-call for the release train); Product Owner informed within the window |
| Mechanism | Server feature flag `SEASONAL_JIKAN_EMERGENCY_ENABLE` (name fixed for runbooks) — **server-side evaluation only**; clients must not gate Jikan |
| Max duration / TTL | **Strict 24 hours** wall clock from enable timestamp; auto-disable at expiry; no extension without a new Release Manager enable event (still capped at 24h per enable) |
| Calendar hard stop | Allowed **only** while `request_time < 2026-10-01T00:00:00Z` (before Jikan Public API service end). At/after `2026-10-01T00:00:00Z` the flag is a **no-op** that logs `jikan_outcome=disabled` |
| Operation shape | Exactly **one logical paginated fallback operation** per seasonal request (§3.0): max **5 HTTP pages**, total **6s** wall budget; only after AniList logical attempt fail-over class |
| Scope when all predicates true | Post-cutoff server may open Jikan hosts for that single logical operation only |
| Predicates (all required) | (1) Release Manager enabled flag, (2) within 24h TTL, (3) server-side path, (4) `request_time < 2026-10-01T00:00:00Z`, (5) AniList fail-over class already recorded for this request |
| Audit | Enable/disable events logged with actor id, reason, expiry; per-request telemetry includes emergency id/expiry when used |
| Forbidden | Engineers flipping local env in production without Release Manager; multi-day “temporary” flags; client-side re-enable; unbounded pagination; second logical Jikan attempt; any use at/after 2026-10-01 |

---

## 10. Native release gates (pass / fail)

Applies to **native app version 1.0.0+** production submission and any release train that ships seasonal data dependent on this policy. **All gates must pass**; any fail blocks store release.

| # | Gate | Pass criterion | Fail criterion |
|---|---|---|---|
| G1 | **7-day observation** | Continuous prod/staging metrics for **≥ 7 consecutive days** under AniList-primary path with no Sev-1 data outage | Observation window < 7 days, or Sev-1 seasonal outage during window |
| G2 | **AniList success rate** | Live AniList seasonal success ≥ **99.5%** of attempts over the 7-day window (success = non-timeout, non-5xx/429-exhausted, well-formed, policy-accepted) | Success rate < 99.5% |
| G3 | **Latency** | AniList seasonal path **p95 ≤ 2.0 seconds** server-side (logical-attempt wall time) over the window | p95 > 2.0s |
| G4 | **Post-cutoff proof** | Automated test or staged clock injection proves: at `t ≥ 2026-09-15T00:00:00Z` without §9 predicates, zero Jikan host connections; AniList failure serves stale ≤7d then unavailable; with §9 predicates, at most one logical Jikan attempt (≤5 HTTP pages, ≤6s) and zero sockets when TTL expired or `t ≥ 2026-10-01` | Any non-§9 Jikan socket post-cutoff; emergency exceeding 1 logical attempt / 5 pages / 6s / 24h; stale catalog served beyond 7d as fresh/stale; 30d used as catalog freshness |
| G5 | **Migration readiness** | Inventory of jikan-primary rows with age; backfill plan executed for rows required by native 1.0.0 screens; unmatched residual documented with UI path (catalog vs user-metadata) | Required native surfaces still hard-depend on live Jikan |
| G6 | **UI contract** | QA checklist: fresh/stale/unavailable/jikan/anilist labels on iOS+Android 1.0.0+ builds; user-list metadata-only path does not look like live catalog | Missing banner, invented rows, wrong source label, or 20d jikan shown as seasonal catalog |
| G7 | **Offline contract** | Device offline tests match §8.2 for ≤24h / ≤7d / >7d | Offline shows fabricated data or crashes |
| G8 | **Telemetry** | Events in §3.3 (including fresh_direct vs stale_after_anilist_fail) queryable in ops dashboard for 7-day window | Missing fields or <95% event completeness on seasonal responses |
| G9 | **Runbook** | Published runbook covering cutoff flip, stale serve (AniList-first), unavailable, emergency flag 24h / ≤5 pages / 6s / pre-2026-10-01, rollback owner | No runbook or owner unnamed |
| G10 | **Legal / ToS** | Confirmation that production path does not require Jikan Public API after cutoff (except documented §9 emergency before 2026-10-01); store metadata does not claim Jikan-live dependency | Unresolved ToS conflict or store listing still requires Jikan live |

Gate evidence is stored with the release ticket; Hermes-style proof prefers command output and dashboard exports over implementer prose.

---

## 11. Follow-up issue sequencing (implementation order)

Parent epic remains [#314](https://github.com/tnob39/anime-tier-board/issues/314). This SSOT is [#670](https://github.com/tnob39/anime-tier-board/issues/670). Implement **in order**; do not start N+1 until N acceptance criteria pass.

| Order | Work package | Outcome |
|---|---|---|
| 1 | **#670** (this document) | Normative SSOT merged |
| 2 | Server fetch policy | 6s AniList single logical attempt (≤5 HTTP pages); fail-over classes; cutoff clock; fresh-direct / stale-after-fail; telemetry fields |
| 3 | Durable snapshot store | Write/read snapshots; 24h/7d freshness mapping; no invent; no 30d catalog serve |
| 4 | Historical jikan handling | User-owned provenance retention (30d metadata only); catalog 7d ceiling; match/backfill job |
| 5 | API contract + Web UI | Freshness + source banners; unavailable states; user-list metadata path |
| 6 | Native 1.0.0+ client | Offline tiers; labels; retry; gate G6–G7 evidence |
| 7 | Cutoff rehearsal | Staging clock / flag drill for G4 (including §9 caps and 2026-10-01 no-op) |
| 8 | 7-day observation & metrics | G1–G3, G8 |
| 9 | Runbook + legal sign-off | G9–G10 |
| 10 | Production cutoff | Enable post-cutoff regime at `2026-09-15T00:00:00Z`; monitor |
| 11 | Native store release | All gates green for 1.0.0+ |

Child issues for steps 2–11 are filed after #670 acceptance; titles must cite #314 and link this file path `docs/architecture/release-data-ssot.md`.

---

## 12. Verification matrix

Hermes / QA / release proof must execute every row. Columns are fixed output fields for evidence bundles.

| Scenario ID | Regime | Setup | Expected `source` | Expected `freshness` | Jikan network | HTTP/API outcome | Telemetry `anilist_outcome` | Telemetry `jikan_outcome` | UI contract |
|---|---|---|---|---|---|---|---|---|---|
| V1 | pre | AniList success, non-empty | anilist | fresh | none | 200 + items | success | skipped_pre_policy | Normal + AniList label |
| V2 | pre | AniList timeout 6s | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items | timeout | success | Jikan label + optional warning |
| V3 | pre | AniList transport error | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items | transport | success | Jikan label |
| V4 | pre | AniList HTTP 429 | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items | http_429 | success | Jikan label |
| V5 | pre | AniList HTTP 5xx | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items | http_5xx | success | Jikan label |
| V6 | pre | AniList malformed body | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items | malformed | success | Jikan label |
| V7 | pre | AniList empty_results | jikan (if Jikan ok) | fresh | one logical (≤5 HTTP, ≤6s) | 200 + items or empty if Jikan empty | empty_results | success or error | Per source |
| V8 | pre | AniList fail + Jikan fail, snapshot age 3d | db_snapshot or cache | stale | one logical (failed) | 200 + stale items | (fail class) | error | Stale banner; `serve_path=stale_after_anilist_fail` |
| V9 | pre | AniList fail + Jikan fail, snapshot age 10d | none | unavailable | one logical (failed) | unavailable contract | (fail class) | error | Unavailable panel |
| V10 | post | AniList success | anilist | fresh | **none** | 200 + items | success | skipped_post_cutoff | AniList label |
| V11 | post | AniList fail, snapshot age 2d, §9 off | db_snapshot or cache | stale | **none** | 200 + stale | (fail class) | skipped_post_cutoff | Stale banner; AniList attempted first |
| V12 | post | AniList fail, snapshot age 8d, §9 off | none | unavailable | **none** | unavailable | (fail class) | skipped_post_cutoff | Unavailable panel |
| V13 | post | Proof probe: Jikan client invoked, §9 off | n/a | n/a | **blocked** | no socket | any | disabled | n/a |
| V14 | any | Memory/DB hit age ≤24h | prior source | fresh | none | 200 | skipped | skipped_pre_policy or skipped_post_cutoff | Normal; **direct serve allowed**; `serve_path=fresh_direct` |
| V15 | any | Snapshot age 25h–7d | prior source (only if AniList fails) | stale | none (unless pre-cutoff fail-over or §9) | 200 after AniList fail | **(fail class) — AniList must be attempted** | skipped_* or per fail-over | Stale banner; **no silent stale short-circuit** |
| V16 | any | jikan-sourced **catalog/discovery** row age 20d (7d < age ≤ 30d) | none for catalog | **unavailable** (not fresh, not stale) | none | unavailable for discovery | skipped | skipped_* | Catalog unavailable; **V16 must not pass if served as catalog fresh/stale** |
| V16u | any | jikan **user-owned list** row age 20d metadata/provenance only | jikan (provenance on user record) | n/a for catalog tiers | none | 200 user-list record (not seasonal catalog payload) | skipped | skipped_* | User list + Jikan provenance / データ更新不可; **not** seasonal catalog card |
| V17 | any | jikan row age 31d catalog surface | none for catalog | unavailable | none | unavailable for discovery | skipped | skipped_* | Unavailable / 更新不可 |
| V17u | any | jikan user-owned row age 31d | user tombstone/placeholder allowed | n/a for catalog | none | user-list only | skipped | skipped_* | データ更新不可; still not catalog |
| V18 | offline native | cache 12h | prior | fresh | none | local | n/a | n/a | Normal offline |
| V19 | offline native | cache 3d | prior | stale | none | local | n/a | n/a | Stale banner (offline cannot re-attempt AniList) |
| V20 | offline native | cache 9d | none | unavailable | none | local unavailable | n/a | n/a | Reconnect prompt |
| V21 | emergency | §9 all predicates true (RM flag, within 24h TTL, server-side, before 2026-10-01), post app cutoff, AniList fail class | may be jikan | fresh | **one logical** (≤5 HTTP pages, ≤6s) | 200 | fail class | success | Jikan label + ops audit |
| V22 | emergency | flag expired (>24h TTL) or otherwise incomplete §9 predicates | no new jikan | per §4 | none | per §4 | fail class | disabled | No emergency jikan |
| V22b | emergency | flag on but `request_time >= 2026-10-01T00:00:00Z` | no new jikan | per §4 | none | per §4 | fail class | disabled | Flag no-op after service end |
| V23 | invent guard | empty upstream both sides, no snapshot | none | unavailable | per regime | unavailable | empty or error | error or skipped | **Zero** fabricated cards |
| V24 | attempt caps | Jikan logical attempt would need >5 HTTP pages or >6s | n/a or prior stale | fail attempt → stale or unavailable | one logical then stop | no 6th page; no budget overrun | fail class | error | No unbounded pagination |

Evidence bundle columns (required in proof artifacts):

`scenario_id`, `git_sha`, `environment`, `request_time_utc`, `cutoff_regime`, `source`, `freshness`, `serve_path`, `jikan_bytes_sent` (must be 0 when network forbidden), `jikan_http_pages` (0 when none; ≤5 when one logical attempt), `anilist_outcome`, `jikan_outcome`, `http_status_or_client_state`, `ui_screenshot_or_a11y_log`, `pass_fail`.

---

## 13. Ownership and change control

| Role | Responsibility |
|---|---|
| **Document owner (Data Platform)** | Maintains this SSOT; reviews PRs that change seasonal fetch, snapshot, or provenance |
| **Release Manager** | Owns gates G1–G10 sign-off; sole authority for §9 emergency flag |
| **Product Owner** | Owns §8 user-visible copy and acceptance of unavailable UX |
| **Legal** | Owns G10; consulted before any post-cutoff Jikan network exception beyond §9 |
| **Implementers (Grok et al.)** | Implement only against accepted Specs that cite this file; do not invent alternate cutoffs |
| **Hermes** | Independent proof of verification matrix and gate metrics |
| **Fable / Architect** | Accepts Specs for child issues; this document is not rewritten by implementers without PO+Data Platform ACK |

### Change control rules

1. **Normative edits** require a PR that touches only docs (or a dedicated policy PR), cites #314 and #670 (or successor policy issue), and updates “Last decided”.
2. **Code may not soften** cutoff, re-enable unbounded Jikan, extend catalog stale beyond 7 days, treat 30-day user-metadata retention as catalog freshness, or invent data “temporarily” without a merged SSOT revision **and** Release Manager ACK.
3. **Parameter freezes**: cutoff timestamp, 6s logical-attempt budget, max 5 HTTP pages per attempt, single-logical-attempt rule, 24h fresh / 7d catalog stale ceiling, 30d **user-metadata-only** retention, 99.5% / p95 2s gates, 24h emergency max, emergency calendar stop `2026-10-01T00:00:00Z` — change only via SSOT revision, not ad-hoc code constants drift.
4. **Conflict resolution**: if `AGENTS.md`, plans, or comments disagree with this file on seasonal data policy, **this file wins** until amended.
5. **Distribution**: path `docs/architecture/release-data-ssot.md` on `main` is the only canonical URL for agents and humans.

---

## 14. Non-goals (explicit)

- Annict / X API / Grok search enrichment design (tracked under [#314](https://github.com/tnob39/anime-tier-board/issues/314) separately; must not reintroduce Jikan live post-cutoff outside §9).
- Changing NextAuth, Turso schema for user statuses, or TMDb streaming enrich rules.
- Rewriting native IA or monetization.
- Automatic store submission; gates define readiness only.

---

## 15. Normative summary (checklist)

- Cutoff **`2026-09-15T00:00:00Z`**, server-enforced.
- Pre-cutoff: AniList one **logical attempt** (≤**6s**, ≤**5** HTTP pages) → Jikan one logical attempt only on timeout/transport/429/5xx/malformed/empty_results; log attribution.
- Post-cutoff: **no** new Jikan network **except** §9 emergency (Release Manager only, server-side, **one** logical paginated fallback, max **5** HTTP pages, total **6s**, strict **24h** TTL, only before **2026-10-01**).
- Catalog/discovery: AniList outage → after AniList attempt, snapshot **stale ≤7d** then **unavailable**; never invent data.
- Freshness serve: **fresh ≤24h may serve directly**; **stale 24h–7d must attempt AniList first**, serve stale **only on failure**; telemetry distinguishes `fresh_direct` vs `stale_after_anilist_fail`.
- Historical jikan: **30-day retention is user-owned metadata/provenance only** — never serves catalog items as fresh/stale; catalog ceiling remains **7 days** (V16 catalog = unavailable).
- Attempt = **one logical paginated operation**; HTTP pages capped at **5** per attempt; wall budget **6s** per attempt.
- Native **1.0.0+** bound by UI/offline/gates.
- Emergency: Release Manager only, flag **≤24h**, caps above, no-op at/after 2026-10-01.
- Release requires G1–G10 all pass.
- Sole normative SSOT for [#670](https://github.com/tnob39/anime-tier-board/issues/670) / parent [#314](https://github.com/tnob39/anime-tier-board/issues/314).
