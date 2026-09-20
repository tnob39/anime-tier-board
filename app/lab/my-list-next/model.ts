export const LAB_NOW_ISO = "2026-09-20T12:00:00.000Z";
export const EXPIRING_WITHIN_DAYS = 14;
export const DORMANT_AFTER_DAYS = 90;

export type ListStateId = "unwatched" | "dormant" | "expiring";
export type FilterId = "all" | ListStateId;
export type SavedStatus = "planned" | "watching" | "paused";
export type DisplayMode = "visual" | "simple";
export type PrimaryActionKind = "watch-legal" | "review-decision" | "keep-watching";

export const LIST_STATE_LABEL: Record<ListStateId, string> = {
  unwatched: "未消化",
  dormant: "長期放置",
  expiring: "配信終了間近"
};

export const FILTER_LABEL: Record<FilterId, string> = {
  all: "すべて",
  unwatched: "未消化",
  dormant: "長期放置",
  expiring: "配信終了間近"
};

const DAY_MS = 24 * 60 * 60 * 1000;

type ApprovedOrigin = {
  protocol: "https:";
  hostname: string;
};

const APPROVED_SOURCES: Record<string, ApprovedOrigin> = {
  Netflix: { protocol: "https:", hostname: "www.netflix.com" },
  "Amazon Prime Video": { protocol: "https:", hostname: "www.amazon.co.jp" },
  "U-NEXT": { protocol: "https:", hostname: "video.unext.jp" },
  ABEMA: { protocol: "https:", hostname: "abema.tv" },
  Crunchyroll: { protocol: "https:", hostname: "www.crunchyroll.com" },
  "Disney+": { protocol: "https:", hostname: "www.disneyplus.com" }
};

function approvedOrigin(source: ApprovedOrigin): string {
  return `${source.protocol}//${source.hostname}`;
}

export type ExpiryRecord =
  | {
      available: true;
      expiresAt: string;
      sourceName: string;
      sourceUrl: string;
      region: string;
      checkedAt: string;
    }
  | {
      available: false;
      detail: "unavailable";
    };

export type LegalWatch =
  | {
      available: true;
      providerName: string;
      url: string;
      region: string;
      checkedAt: string;
      watchForm: string;
    }
  | {
      available: false;
      detail: "unavailable";
    };

export type ExpiryInput = {
  expiresAt?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  region?: string | null;
  checkedAt?: string | null;
};

export type LegalWatchInput = {
  providerName?: string | null;
  url?: string | null;
  region?: string | null;
  checkedAt?: string | null;
  watchForm?: string | null;
};

export type SavedWork = {
  id: string;
  titleNative: string;
  titleRomaji: string | null;
  status: SavedStatus;
  watchedEpisodes: number;
  latestKnownEpisode: number | null;
  lastTouchedAt: string;
  savedAt: string;
  posterTone: string;
  expiry: ExpiryRecord;
  legalWatch: LegalWatch;
};

export type ClassifiedWork = SavedWork & {
  state: ListStateId;
  expiryLabel: string;
};

export type PrimaryAction = {
  workId: string;
  kind: PrimaryActionKind;
  label: string;
};

export type EquivalentView = {
  title: string;
  romaji: string | null;
  stateLabel: string;
  statusLabel: string;
  watchedEpisodesLabel: string;
  latestEpisodeLabel: string;
  expiryLabel: string;
  sourceLabel: string;
  regionLabel: string;
  checkedAtLabel: string;
  legalWatchLabel: string;
  primaryAction: string;
};

function trim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isApprovedSource(name: string, url: string): boolean {
  const approved = APPROVED_SOURCES[name];
  if (!approved) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return false;
  }
  if (parsed.hash !== "") {
    return false;
  }
  if (parsed.port !== "") {
    return false;
  }
  if (parsed.protocol !== approved.protocol) {
    return false;
  }
  if (parsed.hostname !== approved.hostname) {
    return false;
  }
  return parsed.origin === approvedOrigin(approved);
}

export function resolveExpiry(input: ExpiryInput): ExpiryRecord {
  const expiresAt = trim(input.expiresAt);
  const sourceName = trim(input.sourceName);
  const sourceUrl = trim(input.sourceUrl);
  const region = trim(input.region);
  const checkedAt = trim(input.checkedAt);

  if (!expiresAt || !sourceName || !sourceUrl || !region || !checkedAt) {
    return { available: false, detail: "unavailable" };
  }
  if (!Number.isFinite(Date.parse(expiresAt)) || !Number.isFinite(Date.parse(checkedAt))) {
    return { available: false, detail: "unavailable" };
  }
  if (!isApprovedSource(sourceName, sourceUrl)) {
    return { available: false, detail: "unavailable" };
  }

  return {
    available: true,
    expiresAt,
    sourceName,
    sourceUrl,
    region,
    checkedAt
  };
}

export function resolveLegalWatch(input: LegalWatchInput): LegalWatch {
  const providerName = trim(input.providerName);
  const url = trim(input.url);
  const region = trim(input.region);
  const checkedAt = trim(input.checkedAt);
  const watchForm = trim(input.watchForm);

  if (!providerName || !url || !region || !checkedAt || !watchForm) {
    return { available: false, detail: "unavailable" };
  }
  if (!Number.isFinite(Date.parse(checkedAt))) {
    return { available: false, detail: "unavailable" };
  }
  if (!isApprovedSource(providerName, url)) {
    return { available: false, detail: "unavailable" };
  }

  return {
    available: true,
    providerName,
    url,
    region,
    checkedAt,
    watchForm
  };
}

export function remainingEpisodes(work: SavedWork): number | null {
  if (work.latestKnownEpisode == null) {
    return null;
  }
  return Math.max(0, work.latestKnownEpisode - work.watchedEpisodes);
}

export function isExpiringSoon(expiry: ExpiryRecord, now: Date): boolean {
  if (!expiry.available) {
    return false;
  }
  const expiresMs = Date.parse(expiry.expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return false;
  }
  const days = (expiresMs - now.getTime()) / DAY_MS;
  return days >= 0 && days <= EXPIRING_WITHIN_DAYS;
}

export function classifyWork(work: SavedWork, now: Date): ListStateId {
  if (isExpiringSoon(work.expiry, now)) {
    return "expiring";
  }
  const touchedMs = Date.parse(work.lastTouchedAt);
  if (Number.isFinite(touchedMs) && now.getTime() - touchedMs >= DORMANT_AFTER_DAYS * DAY_MS) {
    return "dormant";
  }
  return "unwatched";
}

export function formatDay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return "unavailable";
  }
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatExpiry(expiry: ExpiryRecord): string {
  if (!expiry.available) {
    return "終了日 unavailable";
  }
  return `終了日 ${formatDay(expiry.expiresAt)} · 出典 ${expiry.sourceName} · 地域 ${expiry.region} · 確認 ${formatDay(expiry.checkedAt)}`;
}

export function classifyWorkRecord(work: SavedWork, now: Date): ClassifiedWork {
  return {
    ...work,
    state: classifyWork(work, now),
    expiryLabel: formatExpiry(work.expiry)
  };
}

export function classifyWorks(
  works: readonly SavedWork[],
  now: Date = new Date(LAB_NOW_ISO)
): ClassifiedWork[] {
  return works.map((work) => classifyWorkRecord(work, now));
}

export function filterWorks(
  works: readonly ClassifiedWork[],
  filter: FilterId
): ClassifiedWork[] {
  if (filter === "all") {
    return [...works];
  }
  return works.filter((work) => work.state === filter);
}

const STATE_PRIORITY: Record<ListStateId, number> = {
  expiring: 0,
  unwatched: 1,
  dormant: 2
};

export function suggestNextWork(
  works: readonly ClassifiedWork[],
  filter: FilterId = "all"
): ClassifiedWork | null {
  const visible = filterWorks(works, filter);
  if (visible.length === 0) {
    return null;
  }

  return [...visible].sort((a, b) => {
    const stateDelta = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
    if (stateDelta !== 0) {
      return stateDelta;
    }
    if (a.state === "expiring" && b.state === "expiring" && a.expiry.available && b.expiry.available) {
      return Date.parse(a.expiry.expiresAt) - Date.parse(b.expiry.expiresAt);
    }
    return Date.parse(a.lastTouchedAt) - Date.parse(b.lastTouchedAt);
  })[0];
}

export function primaryActionFor(work: ClassifiedWork): PrimaryAction {
  if (work.state === "dormant" || !work.legalWatch.available) {
    return {
      workId: work.id,
      kind: "review-decision",
      label: "見直し判断する"
    };
  }
  if (work.state === "expiring") {
    return {
      workId: work.id,
      kind: "watch-legal",
      label: "確認済みの正規配信で見る"
    };
  }
  return {
    workId: work.id,
    kind: "watch-legal",
    label: work.watchedEpisodes > 0 ? "続きを正規配信で見る" : "第1話を正規配信で見る"
  };
}

export function keepWatchingAction(work: ClassifiedWork): PrimaryAction {
  return {
    workId: work.id,
    kind: "keep-watching",
    label: "見続ける"
  };
}

function statusLabel(status: SavedStatus): string {
  if (status === "watching") return "視聴中";
  if (status === "planned") return "見たい";
  return "一時停止";
}

export function equivalentView(work: ClassifiedWork, action: PrimaryAction): EquivalentView {
  return {
    title: work.titleNative,
    romaji: work.titleRomaji,
    stateLabel: LIST_STATE_LABEL[work.state],
    statusLabel: statusLabel(work.status),
    watchedEpisodesLabel: `本人の視聴記録 ${work.watchedEpisodes}話`,
    latestEpisodeLabel:
      work.latestKnownEpisode == null
        ? "配信話数 unavailable"
        : `配信確認済みの話数 ${work.latestKnownEpisode}話`,
    expiryLabel: work.expiryLabel,
    sourceLabel: work.expiry.available ? `出典 ${work.expiry.sourceName}` : "出典 unavailable",
    regionLabel: work.expiry.available ? `地域 ${work.expiry.region}` : "地域 unavailable",
    checkedAtLabel: work.expiry.available
      ? `確認 ${formatDay(work.expiry.checkedAt)}`
      : "確認 unavailable",
    legalWatchLabel: work.legalWatch.available
      ? `正規配信 ${work.legalWatch.providerName} · ${work.legalWatch.region} · ${work.legalWatch.watchForm}`
      : "正規配信 unavailable",
    primaryAction: action.label
  };
}

export function countStates(works: readonly ClassifiedWork[]): Record<ListStateId, number> {
  return {
    unwatched: works.filter((work) => work.state === "unwatched").length,
    dormant: works.filter((work) => work.state === "dormant").length,
    expiring: works.filter((work) => work.state === "expiring").length
  };
}
