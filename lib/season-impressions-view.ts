import type { AnimeAiringInfo } from "@/lib/types";
import type { ImpressionAnime, ImpressionInput, ImpressionSeason, SeasonImpression } from "@/lib/season-impressions-model";
import { getJstDateParts, jstStartUtc, nextSeason, seasonStartUtc } from "@/lib/season";

export const IMPRESSION_CANDIDATE_LIMIT = 3;
export const IMPRESSION_PAGE_SIZE = 10;
export const IMPRESSION_SHARE_INITIAL_LIMIT = 6;
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ImpressionCandidate = { anime: ImpressionAnime; reason: "draft" | "airing" | "saved" | "unchecked"; airingAt?: string };
export type ImpressionAiring = { id: string; airing?: AnimeAiringInfo | null };
export type ImpressionDayCandidate = { anime: ImpressionAnime; airingAt: string };

function strictTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second, zone, offsetHour, offsetMinute] = match;
  const numbers = [year, month, day, hour, minute, second, offsetHour ?? "0", offsetMinute ?? "0"].map(Number);
  const [y, m, d, h, min, sec, oh, om] = numbers;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()
    || h > 23 || min > 59 || sec > 59 || oh > 23 || om > 59) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function jstDateKey(value: string | number | Date): string | null {
  if (typeof value === "string" && !Number.isFinite(strictTimestamp(value))) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const { year, month, day } = getJstDateParts(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftDateKey(dateKey: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isInteger(days)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = jstStartUtc(year, month, day);
  if (jstDateKey(date) !== dateKey) return null;
  return jstDateKey(new Date(date.getTime() + days * 86_400_000));
}

export function impressionWeek(dateKey: string): string[] {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = jstStartUtc(year, month, day);
  if (jstDateKey(date) !== dateKey) return [];
  const jstWeekday = new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  const monday = shiftDateKey(dateKey, -((jstWeekday + 6) % 7))!;
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index)!);
}

export function clampDateToSeason(dateKey: string | null, season: ImpressionSeason, now = new Date()): string {
  const start = jstDateKey(seasonStartUtc(season))!;
  const end = shiftDateKey(jstDateKey(seasonStartUtc(nextSeason(season)))!, -1)!;
  const fallback = jstDateKey(now)!;
  const candidate = dateKey && shiftDateKey(dateKey, 0) ? dateKey : fallback;
  return candidate < start ? start : candidate > end ? end : candidate;
}

/** Assign only supplied episode instants; never infer a recurring schedule. */
export function impressionCandidatesForDate(catalog: readonly ImpressionAnime[], airing: readonly ImpressionAiring[], dateKey: string): ImpressionDayCandidate[] {
  if (!shiftDateKey(dateKey, 0)) return [];
  const animeById = new Map(catalog.map((anime) => [anime.id, anime]));
  const result = new Map<string, ImpressionDayCandidate>();
  for (const item of airing) {
    if (typeof item.id !== "string" || !/^(?:anilist|jikan)-[1-9]\d*$/.test(item.id)) continue;
    const anime = animeById.get(item.id);
    if (!anime) continue;
    const episodes = [...(Array.isArray(item.airing?.recentEpisodes) ? item.airing.recentEpisodes : []), ...(item.airing?.nextEpisode ? [item.airing.nextEpisode] : [])];
    const values = episodes.filter((episode) => episode && Number.isSafeInteger(episode.episode) && episode.episode > 0
      && typeof episode.airingAt === "string" && timestamp(episode.airingAt) < Number.POSITIVE_INFINITY
      && jstDateKey(episode.airingAt) === dateKey).map((episode) => episode.airingAt).sort((a, b) => timestamp(a) - timestamp(b));
    const current = result.get(anime.id);
    if (values[0] && (!current || timestamp(values[0]) < timestamp(current.airingAt))) result.set(anime.id, { anime, airingAt: values[0] });
  }
  return [...result.values()].sort((a, b) => timestamp(a.airingAt) - timestamp(b.airingAt) || byId(a.anime, b.anime));
}

function timestamp(value: string): number {
  return strictTimestamp(value);
}
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Only supplied recent-episode timestamps qualify. Never extrapolate from a schedule. */
export function recentImpressionAiring(airing: AnimeAiringInfo | null | undefined, now: number): string | undefined {
  return airing?.recentEpisodes?.map((episode) => episode.airingAt)
    .filter((value) => { const age = now - timestamp(value); return age >= 0 && age <= RECENT_WINDOW_MS; })
    .sort((a, b) => timestamp(b) - timestamp(a))[0];
}

export function sortImpressionRecords(records: readonly SeasonImpression[]): SeasonImpression[] {
  return [...records].sort((a, b) => (timestamp(b.updatedAt) || 0) - (timestamp(a.updatedAt) || 0) || byId(a.anime, b.anime));
}

/** Call once after owner/season hydration, then retain the result for this workspace session. */
export function deriveImpressionCandidates({ catalog, records, drafts, airing = [], now }: {
  catalog: readonly ImpressionAnime[]; records: readonly SeasonImpression[];
  drafts: readonly ImpressionInput[]; airing?: readonly ImpressionAiring[]; now: number;
}): ImpressionCandidate[] {
  const items = new Map(catalog.map((anime) => [anime.id, anime]));
  for (const record of records) if (!items.has(record.anime.id)) items.set(record.anime.id, record.anime);
  for (const draft of drafts) if (!items.has(draft.anime.id)) items.set(draft.anime.id, draft.anime);
  const recent = new Map(airing.map((item) => [item.id, recentImpressionAiring(item.airing, now)]));
  const savedIds = new Set(records.map((record) => record.anime.id));
  const ordered: ImpressionCandidate[] = [
    ...[...drafts].sort((a, b) => byId(a.anime, b.anime)).map(({ anime }) => ({ anime, reason: "draft" as const })),
    ...[...items.values()].filter((anime) => recent.get(anime.id)).sort((a, b) =>
      timestamp(recent.get(b.id)!) - timestamp(recent.get(a.id)!) || byId(a, b))
      .map((anime) => ({ anime, reason: "airing" as const, airingAt: recent.get(anime.id) })),
    ...sortImpressionRecords(records).map(({ anime }) => ({ anime, reason: "saved" as const })),
    ...[...items.values()].filter((anime) => !savedIds.has(anime.id)).sort(byId).map((anime) => ({ anime, reason: "unchecked" as const }))
  ];
  const seen = new Set<string>();
  return ordered.filter(({ anime }) => { if (seen.has(anime.id)) return false; seen.add(anime.id); return true; }).slice(0, IMPRESSION_CANDIDATE_LIMIT);
}

export function impressionAiringLabel(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export function searchImpressionCatalog(items: readonly ImpressionAnime[], records: readonly SeasonImpression[], query: string,
  filter: "all" | "unchecked" | "saved" = "all", page = 0): { items: ImpressionAnime[]; total: number } {
  const saved = new Map(sortImpressionRecords(records).map((record, index) => [record.anime.id, index]));
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
  const matches = items.filter((item) => (filter === "all" || (filter === "saved" ? saved.has(item.id) : !saved.has(item.id)))
    && item.title.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(normalized))
    .sort((a, b) => filter === "saved" ? saved.get(a.id)! - saved.get(b.id)! : byId(a, b));
  const start = Math.max(0, Math.floor(page)) * IMPRESSION_PAGE_SIZE;
  return { items: matches.slice(start, start + IMPRESSION_PAGE_SIZE), total: matches.length };
}

export function changeImpressionInput(input: ImpressionInput, change: Partial<Pick<ImpressionInput, "note" | "rating" | "spoiler" | "revision">>): ImpressionInput {
  return { ...input, ...change, ...(change.note !== undefined && change.note !== input.note ? { spoiler: "unspecified" as const } : {}) };
}

export function impressionGrowthCopy(previous: SeasonImpression | undefined, saved: SeasonImpression, countBefore: number): string {
  if (!previous) return countBefore === 0 ? "今期カードに、最初の1作品が加わりました。" : "今期カードに1作品加わりました。";
  return previous.note !== saved.note ? "今の一言に更新しました。" : "記録を更新しました。";
}
