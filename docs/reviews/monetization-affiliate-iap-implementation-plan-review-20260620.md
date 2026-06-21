# Monetization Affiliate / IAP Implementation Plan Review - 2026-06-20

Reviewer: Codex

Target:

- `plans/monetization-affiliate-iap-implementation-plan-20260620.md`

Review focus:

- Implementation split and worktree sizing
- Fit with existing subscription / streaming service code
- Testability
- Technical risk around RevenueCat, Expo, and Capacitor

## Summary

The overall direction is reasonable: ship affiliate-based monetization first and defer IAP / RevenueCat to a later phase.

However, the plan needs updates before it is ready for implementation. The main issue is that Phase 1 is written as if affiliate fields do not exist yet, while the current code already has `affiliateUrl`, `affiliateTag`, `getServiceUrl()`, and a partial subscription UI hook. Phase 1 should be reframed as data population, API DTO design, native API/client work, and UI display, not as adding the first affiliate model.

IAP should remain Phase 2. Do not make Expo and Capacitor dual support a Phase 2 default. Treat it as a decision gate, because RevenueCat uses different SDKs and build/test paths for Expo React Native and Capacitor. If Capacitor remains in scope, premium purchase UI must be implemented as a native bridge screen; WebView JavaScript cannot directly invoke native IAP.

The real Phase 1 long pole is not code. Affiliate program approval for Amazon Associates, A8.net, ValueCommerce, and service-specific programs can take days to weeks, so applications should start immediately in parallel with implementation.

## Findings

### 1. Phase 1 assumes missing affiliate fields that already exist

Current code already includes:

- `lib/streaming-services.ts`
  - `StreamingService.affiliateUrl`
  - `StreamingService.affiliateTag`
  - `getServiceUrl(serviceId)`
- `app/subscriptions/subscriptions-client.tsx`
  - `AdditionalServiceRow` calls `getServiceUrl()`
  - link display is already conditionally wired

Recommendation:

- Change the plan wording from "add `affiliateUrl`" to "populate and validate affiliate URL data".
- Add an explicit task for disclosure/copy, for example affiliate link labeling and external-link behavior.
- Decide whether `affiliateTag` should remain server/internal only.

### 2. Diagnosis API should not return internal service objects directly

`SubscriptionStats` currently carries `service: StreamingService` in coverage and additional-service entries. If `/api/subscriptions/diagnosis` returns this shape directly, it may expose fields that are not necessary for clients, including `tmdbProviderIds` and `affiliateTag`.

Recommendation:

- Add a dedicated response DTO for the diagnosis API.
- Return only public fields, for example:

```ts
type SubscriptionDiagnosisServiceDto = {
  serviceId: string;
  name: string;
  monthlyPrice: number;
  logoUrl: string;
  outboundUrl: string | null;
};

type SubscriptionDiagnosisAnimeDto = {
  animeId: string;
  title: string;
};

type SubscriptionDiagnosisResponse = {
  coveragePercentage: number;
  coveredCount: number;
  totalCount: number;
  services: Array<{
    service: SubscriptionDiagnosisServiceDto;
    count: number;
    anime: SubscriptionDiagnosisAnimeDto[];
  }>;
  additionalServices: Array<{
    service: SubscriptionDiagnosisServiceDto;
    additionalCount: number;
    anime: SubscriptionDiagnosisAnimeDto[];
  }>;
  uncoveredAnime: SubscriptionDiagnosisAnimeDto[];
};
```

- Do not expose `affiliateTag` unless there is a clear product reason.
- Do not return `StreamingService` directly, because it contains internal provider matching fields such as `tmdbProviderIds`.
- Prefer `outboundUrl` or a redirect URL over raw affiliate URL if click attribution or tag rotation is expected.

### 3. Phase 1 is not yet Codex-ready

The current Phase 1 groups unrelated work:

- affiliate service data
- subscriptions auth migration
- diagnosis API design
- native API client
- native UI

These should be separate worktrees. The `/api/subscriptions` native auth change is especially independent and should be handled first.

### 4. Testability needs to be specified

The plan should say what gets tested and at which layer.

Good low-cost test targets:

- `getServiceUrl(serviceId)` returns a URL only for configured affiliate services.
- `calcSubscriptionStats()` continues to calculate coverage independent of affiliate URLs.
- diagnosis API maps internal `SubscriptionStats` to a public DTO and omits internal fields.
- native API client parses diagnosis payload without depending on full web-only types.

UI tests for affiliate link display are possible, but heavier. For Phase 1, a focused DTO/unit test plus TypeScript coverage is likely enough unless a test framework is already established for React component rendering.

### 5. RevenueCat dual-track support is a Phase 2 risk

RevenueCat supports both Expo/React Native and Capacitor, but they are not the same implementation path:

- Expo uses the React Native SDK path, typically requiring a development build for native purchase code.
- Capacitor uses the Capacitor purchases SDK/plugin path.
- Store configuration, native build verification, and test purchases differ.

Recommendation:

- Add a Phase 2 gate: choose Expo-first or Capacitor-first before implementation.
- Avoid "Expo and Capacitor dual support" as an initial requirement.
- If dual support remains necessary, define a small billing abstraction only after one platform is working end-to-end.
- If Capacitor is chosen, premium purchase UI must be a native bridge screen, not a WebView-only React screen. This is a RevenueCat decision-gate precondition.

### 6. Phase 2 billing table name collides with existing streaming subscriptions

The original plan proposes a `user_subscriptions` table for paid subscription / IAP state. That name is already used by `lib/subscriptions.ts` for the user's streaming-service contracts. Reusing it would mix two different concepts and break the existing subscription settings model.

Recommendation:

- Use `user_entitlements` for IAP / premium rights.
- Reserve `subscription` terminology for streaming-service contracts in this codebase.
- Follow the existing lazy schema pattern with a separate `ensureEntitlementSchema()`.

Suggested minimal table:

```sql
create table if not exists user_entitlements (
  user_id text primary key,
  entitlement text not null default 'free',
  store text,
  rc_app_user_id text,
  product_id text,
  expires_at integer,
  is_active integer not null default 0,
  updated_at text not null
);
```

### 7. Referenced native MVP document is not committed

The original plan references `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` and uses it in the completion criteria, but that file is not tracked in this worktree. A completion condition that depends on an uncommitted or missing document is unverifiable.

Recommendation:

- Fix the reference to a committed document, or commit `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` before using it as a completion gate.
- Until then, do not make "reflected in NATIVE_SUMMER_MVP_PLAN" a done condition for the monetization plan.

### 8. Affiliate approval lead time must be a Phase 1 non-code task

Affiliate link implementation is small once approved links exist. The slow path is program review and partner approval.

Recommendation:

- Start Amazon Associates, A8.net, ValueCommerce, and relevant service-specific affiliate applications immediately.
- Track application status outside the code worktrees, but make it a Phase 1 prerequisite for replacing official/null links with revenue links.
- Keep implementation tolerant of `null` affiliate URLs so unapproved services do not block release.

## Recommended Phase 1 Split

Before these code worktrees start, run this non-code Phase 1 task in parallel:

- Apply for Amazon Associates, A8.net, ValueCommerce, and relevant service-specific affiliate programs.
- Record which services are approved, pending, rejected, or unavailable.
- Do not block code work on approval, but do not mark affiliate monetization complete until approved links are committed or explicitly deferred.

### Worktree 1: Native auth for subscriptions API

Name:

- `codex-subscriptions-native-auth`

Purpose:

- Replace direct `auth()` usage in `/api/subscriptions` with `requireUserId()`.

Editable files:

- `app/api/subscriptions/route.ts`

Reference files:

- `lib/api/auth-helpers.ts`
- `app/api/statuses/route.ts`
- `app/api/boards/route.ts`

Validation:

- `npx tsc --noEmit`

Done when:

- Web session and native Bearer token use the same `/api/subscriptions` route contract.

### Worktree 2: Affiliate service data

Name:

- `codex-affiliate-service-data`

Purpose:

- Populate affiliate URL data and clarify public/internal affiliate fields.

Editable files:

- `lib/streaming-services.ts`

Validation:

- `npx tsc --noEmit`

Done when:

- `getServiceUrl()` returns expected URLs for configured services.
- Services without affiliate programs still return `null`.

### Worktree 3: Subscription diagnosis API

Name:

- `codex-subscriptions-diagnosis-api`

Purpose:

- Add a public diagnosis API response that includes safe affiliate link data.

Editable files:

- `app/api/subscriptions/diagnosis/route.ts`
- optionally a small DTO helper under `lib/`

Reference files:

- `app/subscriptions/page.tsx`
- `lib/subscription-stats.ts`
- `lib/subscriptions.ts`
- `lib/streaming-services.ts`

Validation:

- `npx tsc --noEmit`

Done when:

- API returns subscription coverage, additional-service recommendations, uncovered anime, and public affiliate URLs.
- API does not expose `affiliateTag` or unnecessary provider internals.
- API does not return raw `StreamingService` objects.

### Worktree 4: Native subscription API client

Name:

- `codex-native-subscription-client`

Purpose:

- Add native client functions for subscriptions and diagnosis.

Editable files:

- `apps/native/src/lib/api-client.ts`
- optionally `apps/native/src/lib/subscriptions.ts`

Validation:

- Native TypeScript check if available.
- Otherwise `npx tsc --noEmit` from root and targeted code review.

Done when:

- Native code can call:
  - `fetchSubscriptions`
  - `saveSubscriptions`
  - `fetchSubscriptionDiagnosis`

### Worktree 5: Native subscriptions screen

Name:

- `grok-native-subscriptions-screen`

Preferred owner:

- Grok / Composer

Reason:

- This is broader UI work and likely touches screen layout, tabs, Japanese copy, loading/error states, and native interactions.

Scope:

- `apps/native/src/app/subscriptions.tsx`
- `apps/native/src/components/app-tabs.tsx`

Done when:

- User can select services.
- User can see coverage percentage.
- User can see best additional-service recommendation.
- Affiliate links render only when URL data exists.
- Japanese text is verified for mojibake.

## Plan Changes Requested

Update the target plan with these changes:

1. Replace "add affiliateUrl to `lib/streaming-services.ts`" with "populate existing affiliateUrl fields and define public link behavior".
2. Add an explicit public DTO for `/api/subscriptions/diagnosis`.
3. Move `/api/subscriptions` native auth migration to the first Phase 1 task.
4. Split Phase 1 into the worktrees listed above.
5. Add test targets for `getServiceUrl()`, diagnosis DTO mapping, and `calcSubscriptionStats()` regression.
6. Add a Phase 2 decision gate before RevenueCat implementation:
   - Expo-first
   - Capacitor-first
   - dual support only after one platform is complete
7. Rename the Phase 2 billing table from `user_subscriptions` to `user_entitlements`.
8. Fix or gate the `docs/NATIVE_SUMMER_MVP_PLAN_20260620.md` completion condition because the file is not committed in this worktree.
9. Add affiliate program applications as a Phase 1 non-code task to start immediately.
10. State explicitly that Capacitor IAP requires a native bridge purchase screen; WebView JS cannot be the purchase UI.

## Residual Risks

- Affiliate URLs may require compliance wording and service-specific program terms.
- Affiliate program approval may take days to weeks and can block real monetization even if code ships.
- Subscription coverage depends on provider metadata quality and should not be marketed as exact availability.
- Native Japanese copy currently has known mojibake risk and must be verified in simulator/device.
- RevenueCat implementation should not begin until the app distribution route and purchase UI surface are decided.
