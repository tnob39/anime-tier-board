import type { AnimeItem, AnimeSourceName, AnimeTitleSet } from "./types.ts";
import { getTursoClient } from "./turso.ts";

/** Durable catalog key: `YYYY:WINTER|SPRING|SUMMER|FALL|ALL`. */
export type SeasonalSnapshotSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL" | "ALL";

export type SeasonalSnapshotRecord = {
  seasonalKey: string;
  seasonYear: number;
  season: SeasonalSnapshotSeason;
  source: AnimeSourceName;
  items: AnimeItem[];
  fetchedAt: string;
};

export type SeasonalSnapshotStore = {
  get(key: string): Promise<SeasonalSnapshotRecord | null>;
  put(snapshot: SeasonalSnapshotRecord): Promise<void>;
};

/** Minimal libSQL-compatible client surface for injectability (Turso or in-memory). */
export type SnapshotDbClient = {
  execute(
    statement:
      | string
      | {
          sql: string;
          args?: Array<string | number | null | boolean | Uint8Array | ArrayBuffer>;
        }
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
};

const KEY_PATTERN = /^(\d{4}):(WINTER|SPRING|SUMMER|FALL|ALL)$/;
const SOURCES = new Set<AnimeSourceName>(["anilist", "jikan"]);

/**
 * Canonical ISO-8601 UTC datetime as produced by Date#toISOString():
 * `YYYY-MM-DDTHH:mm:ss.sssZ` only (no date-only, no offsets, no reduced precision).
 */
const CANONICAL_UTC_MS_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS seasonal_anime_snapshots (
  seasonal_key TEXT PRIMARY KEY,
  season_year INTEGER NOT NULL,
  season TEXT NOT NULL,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
)`;

/**
 * Single-statement conditional UPSERT:
 * - insert when missing
 * - on conflict, replace only when incoming wins precedence
 *   (newer fetched_at; equal timestamp prefers anilist over jikan; same-source equal replaces)
 *
 * Lexicographic compare is safe because fetched_at is strict canonical UTC ms form.
 */
const PUT_SQL = `INSERT INTO seasonal_anime_snapshots
  (seasonal_key, season_year, season, source, payload_json, fetched_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(seasonal_key) DO UPDATE SET
  season_year = excluded.season_year,
  season = excluded.season,
  source = excluded.source,
  payload_json = excluded.payload_json,
  fetched_at = excluded.fetched_at
WHERE excluded.fetched_at > seasonal_anime_snapshots.fetched_at
   OR (
     excluded.fetched_at = seasonal_anime_snapshots.fetched_at
     AND NOT (
       seasonal_anime_snapshots.source = 'anilist'
       AND excluded.source = 'jikan'
     )
   )`;

/**
 * Parse and validate a seasonal snapshot key.
 * Returns null for any non-matching shape (no repair).
 */
export function parseSeasonalSnapshotKey(
  key: string
): { seasonYear: number; season: SeasonalSnapshotSeason } | null {
  if (typeof key !== "string") {
    return null;
  }
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    return null;
  }
  return {
    seasonYear: Number(match[1]),
    season: match[2] as SeasonalSnapshotSeason
  };
}

/**
 * Injectable Turso/libSQL-backed durable snapshot repository.
 * Schema is created lazily once per store instance (no migrations/).
 */
export function createSeasonalSnapshotStore(
  client: SnapshotDbClient
): SeasonalSnapshotStore {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    schemaReady ??= (async () => {
      await client.execute(CREATE_TABLE_SQL);
    })();
    return schemaReady;
  }

  return {
    async get(key: string): Promise<SeasonalSnapshotRecord | null> {
      const parsedKey = parseSeasonalSnapshotKey(key);
      if (!parsedKey) {
        return null;
      }

      await ensureSchema();

      const result = await client.execute({
        sql: `SELECT seasonal_key, season_year, season, source, payload_json, fetched_at
              FROM seasonal_anime_snapshots
              WHERE seasonal_key = ?
              LIMIT 1`,
        args: [key]
      });

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return decodeRow(row);
    },

    async put(snapshot: SeasonalSnapshotRecord): Promise<void> {
      const normalized = normalizeSnapshotForWrite(snapshot);
      if (!normalized) {
        throw new Error(
          "SeasonalSnapshotStore.put requires a complete nonempty snapshot with a valid key, source, and ISO fetched_at."
        );
      }

      await ensureSchema();

      // Atomic precedence: one conditional UPSERT — no select-then-update race.
      await client.execute({
        sql: PUT_SQL,
        args: [
          normalized.seasonalKey,
          normalized.seasonYear,
          normalized.season,
          normalized.source,
          JSON.stringify(normalized.items),
          normalized.fetchedAt
        ]
      });
    }
  };
}

let productionStore: SeasonalSnapshotStore | null = null;

/**
 * Process-wide Turso-backed singleton. Client is resolved on first execute
 * so module import stays env-free for DB-less tests.
 */
export function getProductionSeasonalSnapshotStore(): SeasonalSnapshotStore {
  if (!productionStore) {
    productionStore = createSeasonalSnapshotStore({
      execute: (statement) => getTursoClient().execute(statement)
    });
  }
  return productionStore;
}

/** Test seam: reset production singleton between isolated suites if needed. */
export function resetProductionSeasonalSnapshotStoreForTests(): void {
  productionStore = null;
}

function normalizeSnapshotForWrite(
  snapshot: SeasonalSnapshotRecord
): SeasonalSnapshotRecord | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const parsedKey = parseSeasonalSnapshotKey(snapshot.seasonalKey);
  if (!parsedKey) {
    return null;
  }

  if (
    snapshot.seasonYear !== parsedKey.seasonYear ||
    snapshot.season !== parsedKey.season
  ) {
    return null;
  }

  if (!isAnimeSourceName(snapshot.source)) {
    return null;
  }

  if (!isCanonicalUtcTimestamp(snapshot.fetchedAt)) {
    return null;
  }

  const items = decodeItems(snapshot.items);
  if (!items) {
    return null;
  }

  return {
    seasonalKey: snapshot.seasonalKey,
    seasonYear: parsedKey.seasonYear,
    season: parsedKey.season,
    source: snapshot.source,
    items,
    // Preserve the exact accepted timestamp string (no reformat).
    fetchedAt: snapshot.fetchedAt
  };
}

function decodeRow(row: Record<string, unknown>): SeasonalSnapshotRecord | null {
  const seasonalKey = row.seasonal_key != null ? String(row.seasonal_key) : "";
  const parsedKey = parseSeasonalSnapshotKey(seasonalKey);
  if (!parsedKey) {
    return null;
  }

  const seasonYearRaw = row.season_year;
  const seasonYear =
    typeof seasonYearRaw === "number" ? seasonYearRaw : Number(seasonYearRaw);
  if (!Number.isInteger(seasonYear) || seasonYear !== parsedKey.seasonYear) {
    return null;
  }

  const season = row.season != null ? String(row.season) : "";
  if (season !== parsedKey.season) {
    return null;
  }

  const source = row.source != null ? String(row.source) : "";
  if (!isAnimeSourceName(source)) {
    return null;
  }

  const fetchedAt = row.fetched_at != null ? String(row.fetched_at) : "";
  if (!isCanonicalUtcTimestamp(fetchedAt)) {
    return null;
  }

  let payload: unknown;
  try {
    payload =
      typeof row.payload_json === "string"
        ? JSON.parse(row.payload_json)
        : row.payload_json;
  } catch {
    return null;
  }

  const items = decodeItems(payload);
  if (!items) {
    return null;
  }

  return {
    seasonalKey,
    seasonYear,
    season: parsedKey.season,
    source,
    items,
    fetchedAt
  };
}

function decodeItems(value: unknown): AnimeItem[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const items: AnimeItem[] = [];
  for (const entry of value) {
    if (!isCompleteAnimeItem(entry)) {
      return null;
    }
    items.push(entry);
  }
  return items;
}

/**
 * Full required AnimeItem shape for durable catalog rows.
 * Partial/minimal records (e.g. id+title+source only) are rejected on get and put.
 */
function isCompleteAnimeItem(value: unknown): value is AnimeItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;

  if (typeof item.id !== "string" || item.id.length === 0) {
    return false;
  }
  if (!isAnimeSourceName(item.source)) {
    return false;
  }
  if (typeof item.title !== "string") {
    return false;
  }
  if (!isAnimeTitleSet(item.titles)) {
    return false;
  }
  if (typeof item.imageUrl !== "string") {
    return false;
  }
  if (typeof item.proxiedImageUrl !== "string") {
    return false;
  }
  if (typeof item.siteUrl !== "string") {
    return false;
  }

  // Optional fields: when present, must have appropriate types.
  if ("format" in item && !isOptionalString(item.format)) {
    return false;
  }
  if ("season" in item && !isOptionalString(item.season)) {
    return false;
  }
  if ("seasonYear" in item && !isOptionalNumber(item.seasonYear)) {
    return false;
  }
  if ("episodes" in item && !isOptionalNumber(item.episodes)) {
    return false;
  }
  if ("score" in item && !isOptionalNumber(item.score)) {
    return false;
  }
  if ("popularity" in item && !isOptionalNumber(item.popularity)) {
    return false;
  }
  if ("isRebroadcast" in item && !isOptionalBoolean(item.isRebroadcast)) {
    return false;
  }
  if ("genres" in item && item.genres !== undefined && !isStringArray(item.genres)) {
    return false;
  }
  if (
    "reputation" in item &&
    item.reputation !== undefined &&
    item.reputation !== null &&
    !isAnimeReputation(item.reputation)
  ) {
    return false;
  }
  if (
    "airing" in item &&
    item.airing !== undefined &&
    item.airing !== null &&
    !isAnimeAiringInfo(item.airing)
  ) {
    return false;
  }
  if (
    "streamingEpisodes" in item &&
    item.streamingEpisodes !== undefined &&
    !isStreamingEpisodeArray(item.streamingEpisodes)
  ) {
    return false;
  }
  if (
    "streamingPlatforms" in item &&
    item.streamingPlatforms !== undefined &&
    !isStreamingPlatformArray(item.streamingPlatforms)
  ) {
    return false;
  }
  if (
    "streamingProvidersJp" in item &&
    item.streamingProvidersJp !== undefined &&
    !isStreamingProvidersJp(item.streamingProvidersJp)
  ) {
    return false;
  }
  if (
    "studios" in item &&
    item.studios !== undefined &&
    !isStudioArray(item.studios)
  ) {
    return false;
  }
  if (
    "voiceActors" in item &&
    item.voiceActors !== undefined &&
    !isVoiceActorArray(item.voiceActors)
  ) {
    return false;
  }

  return true;
}

function isAnimeTitleSet(value: unknown): value is AnimeTitleSet {
  if (!isPlainObject(value)) {
    return false;
  }
  for (const key of ["native", "userPreferred", "romaji", "english"] as const) {
    if (key in value && !isOptionalString(value[key])) {
      return false;
    }
  }
  return true;
}

function isStudioArray(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.name !== "string") {
      return false;
    }
    if ("id" in entry && entry.id !== undefined && entry.id !== null) {
      if (typeof entry.id !== "string" && typeof entry.id !== "number") {
        return false;
      }
    }
    if ("siteUrl" in entry && !isOptionalString(entry.siteUrl)) {
      return false;
    }
  }
  return true;
}

/**
 * Validate every present AnimeReputation scalar (all optional number|null).
 * Omitted keys are allowed; wrong types (e.g. score:string) are rejected.
 */
function isAnimeReputation(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  for (const key of [
    "score",
    "scoreMax",
    "scoredBy",
    "popularity",
    "members",
    "favourites",
    "trending",
    "rank"
  ] as const) {
    if (key in value && !isOptionalNumber(value[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Validate AnimeAiringInfo scalars plus nested nextEpisode / recentEpisodes.
 */
function isAnimeAiringInfo(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  for (const key of [
    "startDate",
    "broadcastDay",
    "broadcastTime",
    "broadcastTimezone",
    "broadcastText",
    "courEstimate"
  ] as const) {
    if (key in value && !isOptionalString(value[key])) {
      return false;
    }
  }

  if ("nextEpisode" in value && value.nextEpisode !== undefined) {
    if (value.nextEpisode !== null && !isAiringNextEpisode(value.nextEpisode)) {
      return false;
    }
  }

  if ("recentEpisodes" in value && value.recentEpisodes !== undefined) {
    if (!isAiringRecentEpisodes(value.recentEpisodes)) {
      return false;
    }
  }

  return true;
}

function isAiringNextEpisode(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.episode !== "number" || !Number.isFinite(value.episode)) {
    return false;
  }
  if (typeof value.airingAt !== "string") {
    return false;
  }
  if (
    "timeUntilAiringSeconds" in value &&
    !isOptionalNumber(value.timeUntilAiringSeconds)
  ) {
    return false;
  }
  return true;
}

function isAiringRecentEpisodes(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.episode !== "number" || !Number.isFinite(entry.episode)) {
      return false;
    }
    if (typeof entry.airingAt !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * streamingEpisodes[]: each item requires url:string; title/site optional string|null.
 */
function isStreamingEpisodeArray(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.url !== "string") {
      return false;
    }
    if ("title" in entry && !isOptionalString(entry.title)) {
      return false;
    }
    if ("site" in entry && !isOptionalString(entry.site)) {
      return false;
    }
  }
  return true;
}

/**
 * streamingPlatforms[]: name+url required strings; source/region optional.
 */
function isStreamingPlatformArray(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.name !== "string") {
      return false;
    }
    if (typeof entry.url !== "string") {
      return false;
    }
    if ("source" in entry && entry.source !== undefined) {
      if (typeof entry.source !== "string") {
        return false;
      }
    }
    if ("region" in entry && !isOptionalString(entry.region)) {
      return false;
    }
  }
  return true;
}

/**
 * streamingProvidersJp: flatrate must be StreamingProvider[]; providerLink optional.
 * Rejects flatrate:string and provider item field type errors.
 */
function isStreamingProvidersJp(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (!Array.isArray(value.flatrate)) {
    return false;
  }
  for (const provider of value.flatrate) {
    if (!isStreamingProvider(provider)) {
      return false;
    }
  }
  if ("providerLink" in value && !isOptionalString(value.providerLink)) {
    return false;
  }
  return true;
}

function isStreamingProvider(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.id !== "number" || !Number.isFinite(value.id)) {
    return false;
  }
  if (typeof value.name !== "string") {
    return false;
  }
  // logoUrl is required on StreamingProvider as string | null (not undefined).
  if (!("logoUrl" in value) || (value.logoUrl !== null && typeof value.logoUrl !== "string")) {
    return false;
  }
  return true;
}

/**
 * voiceActors[]: name required; every declared optional field type-checked when present.
 */
function isVoiceActorArray(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return false;
    }
    if (typeof entry.name !== "string") {
      return false;
    }
    if ("id" in entry && entry.id !== undefined && entry.id !== null) {
      if (typeof entry.id !== "string" && typeof entry.id !== "number") {
        return false;
      }
    }
    for (const key of [
      "nativeName",
      "language",
      "imageUrl",
      "siteUrl",
      "characterName",
      "characterRole"
    ] as const) {
      if (key in entry && !isOptionalString(entry[key])) {
        return false;
      }
    }
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isOptionalBoolean(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "boolean";
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isAnimeSourceName(value: unknown): value is AnimeSourceName {
  return typeof value === "string" && SOURCES.has(value as AnimeSourceName);
}

/**
 * Accept only strict canonical ISO-8601 UTC datetimes with millisecond precision
 * and real calendar validity. Rejects date-only, offsets, reduced precision,
 * and impossible dates (e.g. Feb 30). Preserves caller string on success path.
 */
export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = CANONICAL_UTC_MS_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  // match[7] is milliseconds digits; already constrained by grammar.

  if (month < 1 || month > 12) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return false;
  }

  // Round-trip via UTC components to catch any residual calendar edge cases.
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, Number(match[7]));
  if (!Number.isFinite(ms)) {
    return false;
  }
  const roundTrip = new Date(ms);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second ||
    roundTrip.getUTCMilliseconds() !== Number(match[7])
  ) {
    return false;
  }

  return true;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Put precedence: newer fetched_at wins; equal timestamp → anilist over jikan.
 * Returns true when the incoming row should replace the stored row.
 * Timestamps are compared as canonical UTC strings (lexicographic == chronological).
 */
export function shouldReplace(
  existingFetchedAt: string,
  existingSource: string,
  incomingFetchedAt: string,
  incomingSource: string
): boolean {
  if (
    !isCanonicalUtcTimestamp(existingFetchedAt) ||
    !isCanonicalUtcTimestamp(incomingFetchedAt)
  ) {
    // Invalid inputs are not expected on the write path (validated earlier).
    // Prefer applying the incoming row rather than silently keeping corrupt state.
    return true;
  }
  if (incomingFetchedAt > existingFetchedAt) {
    return true;
  }
  if (incomingFetchedAt < existingFetchedAt) {
    return false;
  }
  // Equal timestamps: anilist wins over jikan; same source is a replace.
  if (incomingSource === "anilist" && existingSource === "jikan") {
    return true;
  }
  if (incomingSource === "jikan" && existingSource === "anilist") {
    return false;
  }
  return true;
}
