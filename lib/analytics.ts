import type { ViewingStatus } from "@/lib/statuses";

export type HomeCardType = "calendar" | "context_tier" | "context_subsc" | "add_section";
export type ContextCardType = "tier" | "subsc";
export type StatusUpdateSource = "bottom_sheet" | "edit_sheet" | "quick_add";
export type EpisodeUpdateSource = "bottom_sheet" | "edit_sheet";

export type ImpressionAnalyticsEvent =
  | { name: "impression_view"; view: "entry" | "search" | "card"; count: number }
  | { name: "impression_edit"; source: "entry" | "search" | "card" }
  | { name: "impression_skip" }
  | { name: "impression_save"; outcome: "success" | "rejected" | "unknown" | "conflict"; operation: "new" | "edit" | "delete" }
  | { name: "impression_share"; action: "select" | "preview" | "published" | "rejected" | "unknown" | "revoked"; count: number };

/** Runtime allowlist also strips unexpected fields from structurally compatible objects. */
export function sanitizeImpressionAnalytics(event: unknown): ImpressionAnalyticsEvent | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const oneOf = (value: unknown, values: string[]) => typeof value === "string" && values.includes(value);
  const count = typeof e.count === "number" && Number.isSafeInteger(e.count) && e.count >= 0 && e.count <= 300;
  if (e.name === "impression_skip") return { name: e.name };
  if (e.name === "impression_view" && oneOf(e.view, ["entry", "search", "card"]) && count)
    return { name: e.name, view: e.view as "entry" | "search" | "card", count: e.count as number };
  if (e.name === "impression_edit" && oneOf(e.source, ["entry", "search", "card"]))
    return { name: e.name, source: e.source as "entry" | "search" | "card" };
  if (e.name === "impression_save" && oneOf(e.outcome, ["success", "rejected", "unknown", "conflict"]) && oneOf(e.operation, ["new", "edit", "delete"]))
    return { name: e.name, outcome: e.outcome as "success" | "rejected" | "unknown" | "conflict", operation: e.operation as "new" | "edit" | "delete" };
  if (e.name === "impression_share" && oneOf(e.action, ["select", "preview", "published", "rejected", "unknown", "revoked"]) && count)
    return { name: e.name, action: e.action as "select" | "preview" | "published" | "rejected" | "unknown" | "revoked", count: e.count as number };
  return null;
}

export type AnalyticsEvent =
  | ImpressionAnalyticsEvent
  | { name: "home_card_tap"; card_type: HomeCardType }
  | { name: "context_card_dismiss"; card_type: ContextCardType }
  | { name: "status_update"; from: ViewingStatus; to: ViewingStatus; source: StatusUpdateSource }
  | { name: "calendar_item_tap" }
  | { name: "episode_update"; source: EpisodeUpdateSource }
  | { name: "tab_switch"; to: string }
  | { name: "tier_share_create" }
  | { name: "subsc_diagnosis_complete" }
  | { name: "watchlist_share_create" }
  | { name: "search"; query_type: "explore" }
  | { name: "tutorial_complete" };

function isDevClient(): boolean {
  return typeof window !== "undefined" && process.env.NODE_ENV === "development";
}

/**
 * Fire-and-forget analytics. SSR-safe, never throws.
 * Dev: console.debug. Production: no-op until a backend SDK is wired.
 */
export function track(event: AnalyticsEvent): void {
  try {
    if (typeof window === "undefined") return;
    const safe = event.name.startsWith("impression_") ? sanitizeImpressionAnalytics(event) : event;
    if (!safe) return;
    if (isDevClient()) {
      console.debug("[analytics]", safe.name, safe);
    }
  } catch {
    // Analytics must not break UX.
  }
}
