# Release Data SSOT — Jikan Sunset & Native Release Gates

| Field | Value |
|---|---|
| Status | **Normative sole source of truth** |
| Parent | [#314](https://github.com/tnob39/anime-tier-board/issues/314) Jikan Public API 終了への対応とデータソース戦略の見直し |
| Issue | [#670](https://github.com/tnob39/anime-tier-board/issues/670) docs(data): Jikan sunset とネイティブ公開ゲートを SSOT 化 |
| Applies to | Server seasonal fetch (`lib/anime-sources`), durable store (Turso), Web + Native clients |
| Native applicability | `apps/native` package version **`>= 1.0.0`** (current `package.json` version is `1.0.0`) |
| Document owner | Data Platform (primary), Release Manager (gates & rollback), Product Owner (UI contract) |
| Last decided | 2026-07-22 |

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

After cutoff, the server **must not open any new outbound HTTP(S) connection** to Jikan hosts (`api.jikan.moe` and documented successors used by this codebase). Feature flags cannot re-enable Jikan network calls past the 24h emergency window defined in §9.

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
| Post-cutoff Jikan network | **Disabled** — zero new Jikan requests |
| Attempt budget | Exactly **one** AniList attempt (6s wall timeout) then, if eligible, exactly **one** Jikan attempt (pre-cutoff only) |
| Empty / malformed AniList | Eligible for pre-cutoff Jikan fail-over (§3) |
| In-process / edge cache | Subordinate to durable snapshot rules; product freshness uses §5 tiers |
| Durable snapshot | Last successful AniList (or pre-cutoff attributed) payload retained for stale serve |
| Provenance | Every item and response carries source + fetch timestamp + freshness class |
| Invented data | **Forbidden** — no synthetic titles, scores, or airing rows to fill gaps |
| Native policy | Mandatory for native **1.0.0+** store / TestFlight / production builds |

---

## 3. Live fetch policy (pre-cutoff)

### 3.1 Sequence (mandatory order)

For each seasonal request key `(year, season)` or yearly aggregate:

1. Check durable / memory cache per §5–§6. If usable (`fresh` or `stale`), return without new upstream when policy allows serve-from-cache.
2. If live refresh is required:
   - **Attempt A — AniList**: single request, **wall-clock timeout 6 seconds**.
   - On AniList **success with non-empty well-formed items**: return AniList; log `source=anilist`.
   - On AniList **fail-over trigger** (§3.2) and `request_time < cutoff`:
     - **Attempt B — Jikan**: single request; log `source=jikan` and the AniList failure class.
   - On AniList fail-over trigger post-cutoff: **do not** call Jikan; go to §4 stale/unavailable path.
3. Never retry AniList in the same request after the 6s attempt completes (success or failure). Never chain more than one Jikan attempt per request.

### 3.2 AniList fail-over triggers (pre-cutoff Jikan allowed only for these)

Jikan live network is permitted **only if all** hold:

- `request_time < 2026-09-15T00:00:00Z`
- Exactly one AniList attempt already finished
- Failure class is one of:

| Class | Definition |
|---|---|
| `timeout` | No complete response within 6s wall clock |
| `transport` | DNS, TLS, connection reset, network unreachable, aborted socket |
| `http_429` | HTTP 429 from AniList |
| `http_5xx` | HTTP 500–599 from AniList |
| `malformed` | Body not parseable as expected GraphQL/media shape, or schema validation failure |
| `empty_results` | HTTP 2xx and parse OK but **zero** seasonal items for the requested key |

**Not** fail-over triggers (AniList error surfaces without Jikan):

- Client auth / session errors local to our API
- Request validation errors (bad year/season)
- Deliberate partial filters that legitimately yield empty after AniList returned data then filtered to zero by **our** post-processing (empty_results applies only to upstream empty seasonal set)

### 3.3 Source attribution (logging)

Every live path must emit structured logs (or equivalent telemetry events) including at minimum:

| Field | Values |
|---|---|
| `seasonal_key` | e.g. `2026:FALL` |
| `source` | `anilist` \| `jikan` \| `cache` \| `db_snapshot` |
| `freshness` | `fresh` \| `stale` \| `unusable` \| `unavailable` |
| `anilist_outcome` | `success` \| `timeout` \| `transport` \| `http_429` \| `http_5xx` \| `malformed` \| `empty_results` \| `skipped` |
| `jikan_outcome` | `success` \| `error` \| `skipped_pre_policy` \| `skipped_post_cutoff` \| `disabled` |
| `fetched_at` | ISO-8601 UTC |
| `cutoff_regime` | `pre` \| `post` |

Response payloads that include seasonal items must expose provenance consumable by clients (`source`, `fetchedAt`, `freshness`).

---

## 4. Post-cutoff policy

Effective at **`2026-09-15T00:00:00Z`**:

| Rule | Decision |
|---|---|
| New Jikan network | **Disabled** for all environments (prod, preview, local default) |
| AniList live | Remains the only live seasonal upstream |
| AniList outage / fail-over classes | Serve **last-known cached or DB snapshot** while age ≤ 7 days as **`stale`** |
| Snapshot age > 7 days | **`unavailable`** — do not return item bodies as if current |
| Data invention | **Never** — empty/unavailable preferred over fabricated rows |
| Pre-cutoff Jikan-sourced durable rows | Remain readable under §7 (provenance + 30-day max age rules) |
| Emergency re-enable | Only §9 release-manager flag, max **24 hours**, still subject to legal review |

---

## 5. Freshness tiers (product-wide)

Age is measured from `fetched_at` (successful upstream or snapshot write time) to `request_time`.

| Tier | Age window | Server may return items? | Client confidence |
|---|---|---|---|
| **fresh** | `0 < age ≤ 24 hours` | Yes | Confirmed / high |
| **stale** | `24 hours < age ≤ 7 days` | Yes, marked stale | Estimated / degraded |
| **unusable** | `age > 7 days` | No live presentation as current catalog; treat as missing for refresh purposes | Must not present as up-to-date seasonal data |
| **unavailable** | No snapshot, or snapshot unusable and live fetch failed | No items (`items: null` or equivalent empty+error contract) | Explicit unavailable state |

Notes:

- In-process 10-minute cache is an implementation detail under **fresh** when backed by a recent successful fetch; it does not create a fourth product tier.
- Home / next-action modules already use `fresh` \| `stale` \| `unavailable`; they must map **unusable** snapshots to **unavailable** at the API boundary (clients never receive “unusable” with a full item list presented as valid).

---

## 6. Cache, DB, source precedence, dedup, unmatched

### 6.1 Precedence (highest first)

When assembling a response for a seasonal key:

1. **In-process / request-coalesced fresh memory cache** if `fetched_at` yields **fresh** and payload source is allowed.
2. **Durable DB snapshot** for that key if freshness is **fresh** or **stale**.
3. **Live AniList** (and pre-cutoff Jikan only per §3).
4. On live failure: degrade to (2) if still **stale**; else **unavailable**.
5. Never prefer a **jikan**-sourced snapshot over a newer **anilist**-sourced snapshot for the same key when both exist.

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
| Jikan-only catalog row, no AniList match | Readable until §7 age limit; then **unavailable** for new discovery surfaces; user-owned lists keep the row with provenance banner until user removes or AniList match/backfill succeeds |
| AniList row missing fields Jikan once had | Leave null/absent; **do not** invent; optional subsequent Annict/X enrichment is outside this SSOT’s live seasonal path |
| Duplicate titles different ids | Keep both; ranking/sort uses popularity then Japanese title sort (existing comparator) |

### 6.4 Write rules

- Successful AniList fetch **upserts** durable snapshot for the key and sets `source=anilist`, `fetched_at=now`.
- Pre-cutoff successful Jikan fail-over **may** upsert snapshot with `source=jikan` only when no fresher AniList snapshot exists.
- Post-cutoff: Jikan must not write new network-derived snapshots.

---

## 7. Historical Jikan records

| Rule | Decision |
|---|---|
| Read path | Existing `source=jikan` rows remain **readable** with provenance (`source`, `fetched_at`) |
| Max cache / snapshot age for jikan-primary catalog use | **30 days** from `fetched_at` |
| After 30 days without AniList match or backfill | Catalog/discovery surfaces treat as **unavailable**; user personal data still shows the saved entity with “データ更新不可” class messaging |
| Remediation | Batch or on-demand **AniList match/backfill** replaces id/fields when mapping confidence is high; otherwise leave unavailable |
| New jikan ids post-cutoff | **Forbidden** via network; imports from static dumps also forbidden without Release Manager + legal sign-off |

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

Copy must remain Japanese in product UI. No silent swap of source without label when `source=jikan`.

### 8.2 Offline (especially Native 1.0.0+)

| Condition | Behavior |
|---|---|
| Device offline, local cache age ≤ 24h | Serve as **fresh** from device cache if server previously delivered fresh payload |
| Device offline, 24h < age ≤ 7d | Serve as **stale** with banner |
| Device offline, age > 7d | **unavailable**; prompt to reconnect |
| Never fabricate | Offline miss → unavailable, not fabricated anime cards |

### 8.3 Recovery

| Trigger | Action |
|---|---|
| User pull-to-refresh / retry | Server follows §3–§4; client shows loading then new freshness |
| Backfill job completes | Next fetch returns AniList-sourced fresh; jikan provenance cleared for that key |
| Extended AniList outage > 7d | All clients converge to unavailable for seasonal live surfaces; user lists remain |

---

## 9. Emergency rollback

| Parameter | Decision |
|---|---|
| Authority | **Release Manager only** (named on-call for the release train); Product Owner informed within the window |
| Mechanism | Server feature flag `SEASONAL_JIKAN_EMERGENCY_ENABLE` (name fixed for runbooks) |
| Max duration | **24 hours** wall clock from enable timestamp; auto-disable at expiry |
| Scope | Pre-allows Jikan network **only** if calendar is still before external Jikan public shutdown (2026-10-01) **and** flag is on; after 2026-10-01T00:00:00Z the flag is a no-op that logs `jikan_outcome=disabled` |
| Audit | Enable/disable events logged with actor id, reason, expiry |
| Forbidden | Engineers flipping local env in production without Release Manager; multi-day “temporary” flags |

---

## 10. Native release gates (pass / fail)

Applies to **native app version 1.0.0+** production submission and any release train that ships seasonal data dependent on this policy. **All gates must pass**; any fail blocks store release.

| # | Gate | Pass criterion | Fail criterion |
|---|---|---|---|
| G1 | **7-day observation** | Continuous prod/staging metrics for **≥ 7 consecutive days** under AniList-primary path with no Sev-1 data outage | Observation window < 7 days, or Sev-1 seasonal outage during window |
| G2 | **AniList success rate** | Live AniList seasonal success ≥ **99.5%** of attempts over the 7-day window (success = non-timeout, non-5xx/429-exhausted, well-formed, policy-accepted) | Success rate < 99.5% |
| G3 | **Latency** | AniList seasonal path **p95 ≤ 2.0 seconds** server-side (attempt wall time) over the window | p95 > 2.0s |
| G4 | **Post-cutoff proof** | Automated test or staged clock injection proves: at `t ≥ 2026-09-15T00:00:00Z`, zero Jikan host connections; AniList failure serves stale ≤7d then unavailable | Any Jikan socket post-cutoff in proof run, or stale served beyond 7d as fresh |
| G5 | **Migration readiness** | Inventory of jikan-primary rows with age; backfill plan executed for rows required by native 1.0.0 screens; unmatched residual documented with UI path | Required native surfaces still hard-depend on live Jikan |
| G6 | **UI contract** | QA checklist: fresh/stale/unavailable/jikan/anilist labels on iOS+Android 1.0.0+ builds | Missing banner, invented rows, or wrong source label |
| G7 | **Offline contract** | Device offline tests match §8.2 for ≤24h / ≤7d / >7d | Offline shows fabricated data or crashes |
| G8 | **Telemetry** | Events in §3.3 queryable in ops dashboard for 7-day window | Missing fields or <95% event completeness on seasonal responses |
| G9 | **Runbook** | Published runbook covering cutoff flip, stale serve, unavailable, emergency flag 24h, rollback owner | No runbook or owner unnamed |
| G10 | **Legal / ToS** | Confirmation that production path does not require Jikan Public API after cutoff; store metadata does not claim Jikan-live dependency | Unresolved ToS conflict or store listing still requires Jikan live |

Gate evidence is stored with the release ticket; Hermes-style proof prefers command output and dashboard exports over implementer prose.

---

## 11. Follow-up issue sequencing (implementation order)

Parent epic remains [#314](https://github.com/tnob39/anime-tier-board/issues/314). This SSOT is [#670](https://github.com/tnob39/anime-tier-board/issues/670). Implement **in order**; do not start N+1 until N acceptance criteria pass.

| Order | Work package | Outcome |
|---|---|---|
| 1 | **#670** (this document) | Normative SSOT merged |
| 2 | Server fetch policy | 6s AniList single attempt; fail-over classes; cutoff clock; telemetry fields |
| 3 | Durable snapshot store | Write/read snapshots; 24h/7d freshness mapping; no invent |
| 4 | Historical jikan handling | Provenance retention; 30-day rule; match/backfill job |
| 5 | API contract + Web UI | Freshness + source banners; unavailable states |
| 6 | Native 1.0.0+ client | Offline tiers; labels; retry; gate G6–G7 evidence |
| 7 | Cutoff rehearsal | Staging clock / flag drill for G4 |
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
| V2 | pre | AniList timeout 6s | jikan (if Jikan ok) | fresh | one | 200 + items | timeout | success | Jikan label + optional warning |
| V3 | pre | AniList transport error | jikan (if Jikan ok) | fresh | one | 200 + items | transport | success | Jikan label |
| V4 | pre | AniList HTTP 429 | jikan (if Jikan ok) | fresh | one | 200 + items | http_429 | success | Jikan label |
| V5 | pre | AniList HTTP 5xx | jikan (if Jikan ok) | fresh | one | 200 + items | http_5xx | success | Jikan label |
| V6 | pre | AniList malformed body | jikan (if Jikan ok) | fresh | one | 200 + items | malformed | success | Jikan label |
| V7 | pre | AniList empty_results | jikan (if Jikan ok) | fresh | one | 200 + items or empty if Jikan empty | empty_results | success or error | Per source |
| V8 | pre | AniList fail + Jikan fail, snapshot age 3d | db_snapshot or cache | stale | one (failed) | 200 + stale items | (fail class) | error | Stale banner |
| V9 | pre | AniList fail + Jikan fail, snapshot age 10d | none | unavailable | one (failed) | unavailable contract | (fail class) | error | Unavailable panel |
| V10 | post | AniList success | anilist | fresh | **none** | 200 + items | success | skipped_post_cutoff | AniList label |
| V11 | post | AniList fail, snapshot age 2d | db_snapshot or cache | stale | **none** | 200 + stale | (fail class) | skipped_post_cutoff | Stale banner |
| V12 | post | AniList fail, snapshot age 8d | none | unavailable | **none** | unavailable | (fail class) | skipped_post_cutoff | Unavailable panel |
| V13 | post | Proof probe: Jikan client invoked | n/a | n/a | **blocked** | no socket | any | disabled | n/a |
| V14 | any | Memory hit age ≤24h | prior source | fresh | none | 200 | skipped | skipped_pre_policy or skipped_post_cutoff | Normal |
| V15 | any | Snapshot age 25h–7d served intentionally | prior source | stale | none | 200 | skipped | skipped_* | Stale banner |
| V16 | any | jikan row age 20d with provenance | jikan | stale or fresh per age | none | 200 | skipped | skipped_* | Jikan label |
| V17 | any | jikan row age 31d catalog surface | none for catalog | unavailable | none | unavailable for discovery | skipped | skipped_* | Unavailable / 更新不可 |
| V18 | offline native | cache 12h | prior | fresh | none | local | n/a | n/a | Normal offline |
| V19 | offline native | cache 3d | prior | stale | none | local | n/a | n/a | Stale banner |
| V20 | offline native | cache 9d | none | unavailable | none | local unavailable | n/a | n/a | Reconnect prompt |
| V21 | emergency | flag on, before 2026-10-01, post app cutoff | may be jikan | fresh | one allowed | 200 | fail class | success | Jikan label + ops audit |
| V22 | emergency | flag expired (>24h) | no new jikan | per §4 | none | per §4 | fail class | disabled | No emergency jikan |
| V23 | invent guard | empty upstream both sides, no snapshot | none | unavailable | per regime | unavailable | empty or error | error or skipped | **Zero** fabricated cards |

Evidence bundle columns (required in proof artifacts):

`scenario_id`, `git_sha`, `environment`, `request_time_utc`, `cutoff_regime`, `source`, `freshness`, `jikan_bytes_sent` (must be 0 when network forbidden), `anilist_outcome`, `jikan_outcome`, `http_status_or_client_state`, `ui_screenshot_or_a11y_log`, `pass_fail`.

---

## 13. Ownership and change control

| Role | Responsibility |
|---|---|
| **Document owner (Data Platform)** | Maintains this SSOT; reviews PRs that change seasonal fetch, snapshot, or provenance |
| **Release Manager** | Owns gates G1–G10 sign-off; sole authority for §9 emergency flag |
| **Product Owner** | Owns §8 user-visible copy and acceptance of unavailable UX |
| **Legal** | Owns G10; consulted before any post-cutoff Jikan network exception beyond §9 no-op |
| **Implementers (Grok et al.)** | Implement only against accepted Specs that cite this file; do not invent alternate cutoffs |
| **Hermes** | Independent proof of verification matrix and gate metrics |
| **Fable / Architect** | Accepts Specs for child issues; this document is not rewritten by implementers without PO+Data Platform ACK |

### Change control rules

1. **Normative edits** require a PR that touches only docs (or a dedicated policy PR), cites #314 and #670 (or successor policy issue), and updates “Last decided”.
2. **Code may not soften** cutoff, re-enable unbounded Jikan, extend stale beyond 7 days, or invent data “temporarily” without a merged SSOT revision **and** Release Manager ACK.
3. **Parameter freezes**: cutoff timestamp, 6s AniList budget, single-attempt rule, 24h/7d/30d ages, 99.5% / p95 2s gates, 24h emergency max — change only via SSOT revision, not ad-hoc code constants drift.
4. **Conflict resolution**: if `AGENTS.md`, plans, or comments disagree with this file on seasonal data policy, **this file wins** until amended.
5. **Distribution**: path `docs/architecture/release-data-ssot.md` on `main` is the only canonical URL for agents and humans.

---

## 14. Non-goals (explicit)

- Annict / X API / Grok search enrichment design (tracked under [#314](https://github.com/tnob39/anime-tier-board/issues/314) separately; must not reintroduce Jikan live post-cutoff).
- Changing NextAuth, Turso schema for user statuses, or TMDb streaming enrich rules.
- Rewriting native IA or monetization.
- Automatic store submission; gates define readiness only.

---

## 15. Normative summary (checklist)

- Cutoff **`2026-09-15T00:00:00Z`**, server-enforced.
- Pre-cutoff: AniList one **6s** attempt → Jikan one attempt only on timeout/transport/429/5xx/malformed/empty_results; log attribution.
- Post-cutoff: **no** new Jikan network; AniList outage → snapshot **stale ≤7d** then **unavailable**; never invent data.
- Historical jikan: readable with provenance; **max 30-day** catalog cache age then match/backfill or unavailable.
- Fresh **≤24h**, stale **≤7d**, unusable **>7d** (exposed as unavailable).
- Native **1.0.0+** bound by UI/offline/gates.
- Emergency: Release Manager only, flag **≤24h**.
- Release requires G1–G10 all pass.
- Sole normative SSOT for [#670](https://github.com/tnob39/anime-tier-board/issues/670) / parent [#314](https://github.com/tnob39/anime-tier-board/issues/314).
