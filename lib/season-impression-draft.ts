import { isRecord, parseImpressionInput, type ImpressionInput, type ImpressionSeason } from "@/lib/season-impressions-model";

// v1 had no provenance and must never be migrated into a claimable guest draft.
export const IMPRESSION_DRAFT_KEY = "numanie:impressions:auth-draft:v2";
export const IMPRESSION_DRAFT_TTL = 30 * 60 * 1000;
export type ImpressionDraft = { version: 2; ownerId: string | null; token: string; createdAt: number; input: ImpressionInput };
export type OwnerImpressionDrafts = { version: 2; ownerId: string; createdAt: number; editing: string | null; inputs: ImpressionInput[] };

function fresh(createdAt: unknown, now: number): boolean {
  return typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= IMPRESSION_DRAFT_TTL;
}
// In-progress text can exceed the save limit. Preserve it so validation never destroys input.
function readDraftInput(value: unknown): ImpressionInput | null {
  if (!isRecord(value) || !isRecord(value.anime) || (value.note !== null && typeof value.note !== "string")) return null;
  const input = parseImpressionInput({ ...value, note: null }, String(value.anime.id));
  return input ? { ...input, note: value.note as string | null } : null;
}
export function readImpressionDraft(raw: string | null, token: string | null, userId: string | null, now = Date.now()): ImpressionDraft | null {
  if (!raw || !token || !userId) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 2 || value.token !== token || !/^[a-zA-Z0-9-]{16,64}$/.test(token)
      || (value.ownerId !== null && value.ownerId !== userId) || !fresh(value.createdAt, now)) return null;
    const input = readDraftInput(value.input);
    return input ? { version: 2, ownerId: value.ownerId as string | null, token, createdAt: value.createdAt as number, input } : null;
  } catch { return null; }
}
export function ownerImpressionDraftKey(userId: string, key: ImpressionSeason): string {
  return `numanie:impressions:owner-drafts:v2:${encodeURIComponent(userId)}:${key.year}:${key.season}`;
}
export function readOwnerImpressionDrafts(raw: string | null, userId: string, key: ImpressionSeason, now = Date.now()): OwnerImpressionDrafts | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 2 || value.ownerId !== userId || !fresh(value.createdAt, now)
      || !Array.isArray(value.inputs) || (value.editing !== null && typeof value.editing !== "string")) return null;
    const inputs = value.inputs.map(readDraftInput);
    if (inputs.some((input) => !input || input.year !== key.year || input.season !== key.season)) return null;
    if (value.editing !== null && !inputs.some((input) => input?.anime.id === value.editing)) return null;
    return { version: 2, ownerId: userId, createdAt: value.createdAt as number, editing: value.editing as string | null, inputs: inputs as ImpressionInput[] };
  } catch { return null; }
}
export function impressionReturnPath(draft: ImpressionDraft): string {
  return `/tier/impressions?year=${draft.input.year}&season=${draft.input.season}&resume=${encodeURIComponent(draft.token)}`;
}
