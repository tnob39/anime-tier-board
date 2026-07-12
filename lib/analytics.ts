import type { ViewingStatus } from "@/lib/statuses";

export type HomeCardType = "calendar" | "context_tier" | "context_subsc" | "add_section";
export type ContextCardType = "tier" | "subsc";
export type StatusUpdateSource = "bottom_sheet" | "edit_sheet" | "quick_add";
export type EpisodeUpdateSource = "bottom_sheet" | "edit_sheet";

export type AnalyticsEvent =
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
    if (isDevClient()) {
      console.debug("[analytics]", event.name, event);
    }
  } catch {
    // Analytics must not break UX.
  }
}
