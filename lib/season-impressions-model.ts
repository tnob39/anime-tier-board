import type { AnimeSeason, AnimeItem } from "@/lib/types";
import { parseSeasonYear, normalizeSeason } from "@/lib/season";

export const IMPRESSION_RATINGS = ["liked", "neutral", "not_for_me"] as const;
export const IMPRESSION_SPOILERS = ["unspecified", "no_spoiler", "has_spoiler"] as const;
export const IMPRESSION_RATING_LABELS = { liked: "好き", neutral: "ふつう", not_for_me: "自分には合わない" };
export type ImpressionRating = (typeof IMPRESSION_RATINGS)[number];
export type ImpressionSpoiler = (typeof IMPRESSION_SPOILERS)[number];
export type ImpressionSeason = { year: number; season: AnimeSeason };
export type ImpressionAnime = Pick<AnimeItem, "id" | "source" | "title" | "imageUrl">;
export type ImpressionInput = ImpressionSeason & {
  revision: number;
  anime: ImpressionAnime;
  rating: ImpressionRating | null;
  note: string | null;
  spoiler: ImpressionSpoiler;
};
export type SeasonImpression = ImpressionInput & { checkedAt: string; updatedAt: string };
export type ImpressionRevisionCursor = { animeId: string; revision: number };
export type ImpressionSeasonState = { impressions: SeasonImpression[]; deletedRevisions: ImpressionRevisionCursor[] };
export type ImpressionSelection = { animeId: string; revision: number; includeRating: boolean; includeNote: boolean };
export type ImpressionShareInput = ImpressionSeason & { kind: "season-impressions"; selections: ImpressionSelection[] };
export type PublicImpression = { anime: ImpressionAnime; rating?: ImpressionRating | null; note?: string };
export type ImpressionSnapshot = ImpressionSeason & { kind: "season-impressions"; version: 1; items: PublicImpression[] };
export type ImpressionShare = ImpressionSnapshot & { shareId: string; createdAt: string };
export type ImpressionShareHistory = { shareId: string; createdAt: string; year: number; season: AnimeSeason };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
export function isImpressionAnimeId(value: unknown): value is string {
  return typeof value === "string" && /^(anilist|jikan)-[1-9]\d{0,14}$/.test(value);
}
export function isImpressionSeason(value: unknown): value is ImpressionSeason & Record<string, unknown> {
  const key = parseImpressionSeason(value);
  return key !== null && isRecord(value) && value.year === key.year && value.season === key.season;
}
export function parseImpressionSeason(value: unknown): ImpressionSeason | null {
  if (!isRecord(value)) return null;
  const year = parseSeasonYear(value.year);
  const season = typeof value.season === "string" ? normalizeSeason(value.season) : null;
  return year !== null && season !== null ? { year, season } : null;
}
export function isRevision(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
export function impressionNoteLength(note: string): number {
  return Array.from(note).length;
}
function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && impressionNoteLength(value) <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u.test(value);
}
export function readImpressionAnime(value: unknown): ImpressionAnime | null {
  if (!isRecord(value) || !isImpressionAnimeId(value.id) || value.source !== value.id.split("-")[0]
    || !validText(value.title, 300) || !value.title.trim() || typeof value.imageUrl !== "string" || value.imageUrl.length > 2048) return null;
  if (value.imageUrl) {
    try {
      const url = new URL(value.imageUrl);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch { return null; }
  }
  // Keep only display data; upstream/user-supplied metadata is never a public snapshot.
  return { id: value.id, source: value.source as ImpressionAnime["source"], title: value.title, imageUrl: value.imageUrl };
}
export function parseImpressionInput(value: unknown, animeId: string): ImpressionInput | null {
  const key = parseImpressionSeason(value);
  if (!isRecord(value) || !hasOnly(value, ["year", "season", "revision", "anime", "rating", "note", "spoiler"])
    || !key || !isRevision(value.revision)
    || (value.rating !== null && !IMPRESSION_RATINGS.includes(value.rating as ImpressionRating))
    || (value.note !== null && !validText(value.note, 140))
    || !IMPRESSION_SPOILERS.includes(value.spoiler as ImpressionSpoiler)) return null;
  const anime = readImpressionAnime(value.anime);
  if (!anime || anime.id !== animeId) return null;
  return { ...key, revision: value.revision, anime,
    rating: value.rating as ImpressionRating | null, note: value.note as string | null, spoiler: value.spoiler as ImpressionSpoiler };
}
export function parseImpressionDelete(value: unknown): (ImpressionSeason & { revision: number }) | null {
  const key = parseImpressionSeason(value);
  if (!isRecord(value) || !hasOnly(value, ["year", "season", "revision"]) || !key || !isRevision(value.revision, 1)) return null;
  return { ...key, revision: value.revision };
}
export function parseImpressionShare(value: unknown): ImpressionShareInput | null {
  const key = parseImpressionSeason(value);
  if (!isRecord(value) || !hasOnly(value, ["kind", "year", "season", "selections"]) || value.kind !== "season-impressions"
    || !key || !Array.isArray(value.selections) || !value.selections.length || value.selections.length > 300) return null;
  const ids = new Set<string>();
  const selections: ImpressionSelection[] = [];
  for (const item of value.selections) {
    if (!isRecord(item) || !hasOnly(item, ["animeId", "revision", "includeRating", "includeNote"])
      || !isImpressionAnimeId(item.animeId) || ids.has(item.animeId) || !isRevision(item.revision, 1)
      || typeof item.includeRating !== "boolean" || typeof item.includeNote !== "boolean") return null;
    ids.add(item.animeId);
    selections.push({ animeId: item.animeId, revision: item.revision, includeRating: item.includeRating, includeNote: item.includeNote });
  }
  return { kind: "season-impressions", ...key, selections };
}

/** Used by both preview and creation. Missing/changed records invalidate the entire preview. */
export function buildImpressionSnapshot(input: ImpressionShareInput, records: SeasonImpression[]): ImpressionSnapshot | null {
  const items: PublicImpression[] = [];
  for (const selection of input.selections) {
    const record = records.find((entry) => entry.anime.id === selection.animeId && entry.year === input.year && entry.season === input.season);
    if (!record || record.revision !== selection.revision) return null;
    const anime = readImpressionAnime(record.anime);
    if (!anime) return null;
    items.push({ anime,
      ...(selection.includeRating ? { rating: record.rating } : {}),
      ...(selection.includeNote && record.spoiler === "no_spoiler" && record.note ? { note: record.note } : {}) });
  }
  return { version: 1, kind: "season-impressions", year: input.year, season: input.season, items };
}
