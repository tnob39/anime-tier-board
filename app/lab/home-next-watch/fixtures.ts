export type LabAvailability = "confirmed" | "unknown";
export type LabFixtureId =
  | "confirmed"
  | "unavailable"
  | "missing-provenance"
  | "impossible-timestamp";
export type LabDisplayMode = "visual" | "simple";
export type LabSupportedRegion = "JP";

export type LabTonightCandidate = {
  id: LabFixtureId;
  titleJa: string;
  studioLabel: string;
  availability: LabAvailability;
  serviceId: "netflix" | null;
  serviceName: string | null;
  destinationHref: string | null;
  destinationLabel: string | null;
  region: string;
  regionLabel: string;
  source: string;
  checkedAtIso: string;
  checkedAtLabel: string;
  reasonLabel: string;
  imageUrl: string | null;
};

/** Fixed provenance instant — never Date.now(). 2026-09-01 12:00 JST. */
export const CHECKED_AT_ISO = "2026-09-01T03:00:00.000Z";
export const CHECKED_AT_JA = "2026年9月1日 12:00（日本時間）";
export const LAB_REGION = "JP";
export const LAB_REGION_LABEL = "日本（JP）";
export const CONFIRMED_WATCH_HREF = "/api/go/netflix" as const;
export const CONFIRMED_SOURCE = "TMDb Watch Providers（Lab フィクスチャ）";
export const UNKNOWN_SOURCE = "未確認";

export type EligibleWatchCandidate = LabTonightCandidate & {
  availability: "confirmed";
  destinationHref: typeof CONFIRMED_WATCH_HREF;
  region: LabSupportedRegion;
};

export const LAB_CANDIDATES: readonly LabTonightCandidate[] = [
  {
    id: "confirmed",
    titleJa: "葬送のフリーレン",
    studioLabel: "マッドハウス",
    availability: "confirmed",
    serviceId: "netflix",
    serviceName: "Netflix",
    destinationHref: CONFIRMED_WATCH_HREF,
    destinationLabel: "Netflix 日本向け公式",
    region: LAB_REGION,
    regionLabel: LAB_REGION_LABEL,
    source: CONFIRMED_SOURCE,
    checkedAtIso: CHECKED_AT_ISO,
    checkedAtLabel: CHECKED_AT_JA,
    reasonLabel: "未記録のエピソードが1話あります",
    imageUrl: "/numanie-icon.png"
  },
  {
    id: "unavailable",
    titleJa: "視聴先未確認の作品",
    studioLabel: "作り手は未確認",
    availability: "unknown",
    serviceId: null,
    serviceName: null,
    destinationHref: null,
    destinationLabel: null,
    region: LAB_REGION,
    regionLabel: LAB_REGION_LABEL,
    source: UNKNOWN_SOURCE,
    checkedAtIso: CHECKED_AT_ISO,
    checkedAtLabel: CHECKED_AT_JA,
    reasonLabel: "正規の視聴先はまだ確認できていません",
    imageUrl: null
  },
  {
    id: "missing-provenance",
    titleJa: "出典欠落の確認済み候補",
    studioLabel: "作り手は未確認",
    availability: "confirmed",
    serviceId: "netflix",
    serviceName: "Netflix",
    destinationHref: CONFIRMED_WATCH_HREF,
    destinationLabel: "Netflix 日本向け公式",
    region: "",
    regionLabel: "",
    source: "",
    checkedAtIso: "",
    checkedAtLabel: "",
    reasonLabel: "確認済みと記録されていますが、出典・地域・確認日時が揃っていません",
    imageUrl: null
  },
  {
    id: "impossible-timestamp",
    titleJa: "存在しない確認日時の候補",
    studioLabel: "作り手は未確認",
    availability: "confirmed",
    serviceId: "netflix",
    serviceName: "Netflix",
    destinationHref: CONFIRMED_WATCH_HREF,
    destinationLabel: "Netflix 日本向け公式",
    region: LAB_REGION,
    regionLabel: LAB_REGION_LABEL,
    source: CONFIRMED_SOURCE,
    checkedAtIso: "2026-02-30T03:00:00.000Z",
    checkedAtLabel: "2026年2月30日 12:00（日本時間）",
    reasonLabel: "確認日時が暦日として存在しないため、正規視聴へは進めません",
    imageUrl: null
  }
];

const ALLOWED_WATCH_HREFS: readonly string[] = [CONFIRMED_WATCH_HREF];
const SUPPORTED_REGIONS: readonly LabSupportedRegion[] = [LAB_REGION];

export function parseFixtureId(raw: string | string[] | undefined): LabFixtureId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "unavailable" ||
    value === "missing-provenance" ||
    value === "impossible-timestamp"
  ) {
    return value;
  }
  return "confirmed";
}

export function getCandidate(id: LabFixtureId): LabTonightCandidate {
  const found = LAB_CANDIDATES.find((candidate) => candidate.id === id);
  if (!found) {
    return LAB_CANDIDATES[0];
  }
  return found;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const ISO_UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

/** Strict UTC instant: exact `YYYY-MM-DDTHH:mm:ss.sssZ` and calendar round-trip. Date.parse overflow is not enough. */
export function isValidIsoUtcInstant(iso: string): boolean {
  const match = ISO_UTC_INSTANT.exec(iso);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number(match[7]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(millisecond)
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (!Number.isFinite(date.getTime())) {
    return false;
  }

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond &&
    date.toISOString() === iso
  );
}

function isValidCheckedAt(iso: string, label: string): boolean {
  if (!hasText(iso) || !hasText(label) || iso !== iso.trim()) {
    return false;
  }
  return isValidIsoUtcInstant(iso);
}

/** Allowlisted same-origin relative landing only. Reject schemes, protocol-relative, and unknown ids. */
export function isAllowedWatchHref(href: string | null | undefined): href is typeof CONFIRMED_WATCH_HREF {
  if (typeof href !== "string") {
    return false;
  }
  if (href.includes("://") || href.startsWith("//") || href.includes("\\")) {
    return false;
  }
  if (!href.startsWith("/") || href !== href.trim()) {
    return false;
  }
  return ALLOWED_WATCH_HREFS.includes(href) && href === CONFIRMED_WATCH_HREF;
}

export function isSupportedRegion(region: string): region is LabSupportedRegion {
  return (SUPPORTED_REGIONS as readonly string[]).includes(region);
}

export function isEligibleWatchCta(
  candidate: LabTonightCandidate
): candidate is EligibleWatchCandidate {
  if (candidate.availability !== "confirmed") {
    return false;
  }
  if (!isAllowedWatchHref(candidate.destinationHref)) {
    return false;
  }
  if (!hasText(candidate.source)) {
    return false;
  }
  if (!isSupportedRegion(candidate.region) || !hasText(candidate.regionLabel)) {
    return false;
  }
  if (!isValidCheckedAt(candidate.checkedAtIso, candidate.checkedAtLabel)) {
    return false;
  }
  return true;
}
