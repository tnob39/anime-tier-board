# Analytics Events

Issue: #388
Source: `docs/native-ia-redesign-20260710.md` section 9

The app exposes a small client-side analytics wrapper in `lib/analytics.ts`.
There is no GA4/Firebase SDK wired in this codebase yet, so `track()` is a
safe no-op in production and logs to `console.debug("[analytics]", ...)` in
development.

## Privacy

Do not send PII. Event payloads must not include email addresses, user IDs,
free-text notes, raw search terms, auth tokens, or share URLs. Use coarse
categories only.

## Event Dictionary

| Event | Params | Fires When | Current Wiring |
| --- | --- | --- | --- |
| `home_card_tap` | `card_type` | A primary home card/action is tapped. | Calendar items, context card CTAs, seasonal add buttons. |
| `status_update` | `from`, `to`, `source` | A viewing status is saved. | `StatusBottomSheet` save success. |
| `calendar_item_tap` | none | A broadcast calendar item is tapped. | `HomeClient` calendar item handler. |
| `tab_switch` | `to` | A bottom navigation tab is tapped. | `MobileNav` link click. |
| `tier_share_create` | none | A tier-board share is created successfully. | `TierBoardApp` share POST success. |
| `subsc_diagnosis_complete` | none | Subscription diagnosis data is available for a subscribed user. | `DashboardClient` after diagnosis is present. |
| `search` | `query_type` | A search action is submitted. | Explore title search Enter key. |
| `tutorial_complete` | none | The guide final CTA is tapped. | `GuideClient` final step CTA. |

Additional internal events may exist for adjacent UX questions, but the table
above is the required #388 contract.

## Dev Verification

1. Run `npm.cmd run dev:local`.
2. Open the browser console.
3. Trigger one of the actions above.
4. Confirm a log like `[analytics] tab_switch { name: "tab_switch", ... }`.
