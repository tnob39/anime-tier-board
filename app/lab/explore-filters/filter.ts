import { LAB_ALLOWED_DOMAIN, LAB_TARGET_REGION } from "./fixture.ts";
import type {
  AvailabilityFilter,
  ExploreFilters,
  ExploreFixtureItem,
  ExploreStaffCredit
} from "./types.ts";

export const DEFAULT_FILTERS: ExploreFilters = {
  availability: "all",
  decade: "all",
  studio: "all",
  staff: "all"
};

export const PRIMARY_WATCH_ACTION_LABEL = "正規配信で見る";
export const UNAVAILABLE_WATCH_LABEL = "正規配信先を確認できません";

export function decadeOf(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

export function staffKey(staff: ExploreStaffCredit): string {
  return `${staff.nameJa}｜${staff.roleJa}`;
}

export function staffLabel(staff: ExploreStaffCredit): string {
  return `${staff.roleJa} ${staff.nameJa}`;
}

export function resetFilters(): ExploreFilters {
  return { ...DEFAULT_FILTERS };
}

export function isLabApprovedWatchUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === LAB_ALLOWED_DOMAIN;
  } catch {
    return false;
  }
}

export function isLegallyWatchable(item: ExploreFixtureItem): boolean {
  if (item.source.decision !== "allowed") {
    return false;
  }
  if (item.region !== LAB_TARGET_REGION) {
    return false;
  }
  if (item.availability === "unavailable") {
    return false;
  }
  return isLabApprovedWatchUrl(item.source.watchUrl);
}

function matchesAvailability(
  item: ExploreFixtureItem,
  availability: AvailabilityFilter
): boolean {
  if (availability === "all") {
    return true;
  }
  if (availability === "legal") {
    return isLegallyWatchable(item);
  }
  if (availability === "unavailable") {
    return !isLegallyWatchable(item);
  }
  return isLegallyWatchable(item) && item.availability === availability;
}

export function filterExploreItems(
  items: readonly ExploreFixtureItem[],
  filters: ExploreFilters
): ExploreFixtureItem[] {
  return items
    .filter((item) => {
      if (!matchesAvailability(item, filters.availability)) {
        return false;
      }
      if (filters.decade !== "all" && decadeOf(item.year) !== filters.decade) {
        return false;
      }
      if (filters.studio !== "all" && item.studio.nameJa !== filters.studio) {
        return false;
      }
      if (filters.staff !== "all") {
        const hit = item.staff.some((entry) => staffKey(entry) === filters.staff);
        if (!hit) {
          return false;
        }
      }
      return true;
    })
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function uniqueDecades(items: readonly ExploreFixtureItem[]): string[] {
  return Array.from(new Set(items.map((item) => decadeOf(item.year)))).sort();
}

export function uniqueStudios(items: readonly ExploreFixtureItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.studio.nameJa))).sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

export function uniqueStaff(items: readonly ExploreFixtureItem[]): ExploreStaffCredit[] {
  const byKey = new Map<string, ExploreStaffCredit>();
  for (const item of items) {
    for (const entry of item.staff) {
      const key = staffKey(entry);
      if (!byKey.has(key)) {
        byKey.set(key, entry);
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    staffLabel(a).localeCompare(staffLabel(b), "ja")
  );
}

export function formatConfirmedAtJa(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function availabilityLabelJa(
  kind: ExploreFixtureItem["availability"]
): string {
  if (kind === "flatrate") return "見放題";
  if (kind === "rent") return "レンタル";
  if (kind === "buy") return "購入";
  return "確認できない";
}

export function decisionLabelJa(decision: ExploreFixtureItem["source"]["decision"]): string {
  if (decision === "allowed") return "許可済み";
  if (decision === "permission-required") return "許諾が必要";
  return "不明";
}

export function regionLabelJa(region: ExploreFixtureItem["region"]): string {
  return region === "JP" ? "日本" : "日本以外";
}
