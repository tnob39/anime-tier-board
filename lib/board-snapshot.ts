/**
 * Client-safe board snapshot import / reconcile / share payload helpers (ATB-706).
 * No node:crypto, Turso, or server-only imports — safe for browser bundles.
 */
import type { AnimeItem, AnimeSeason } from "./types.ts";
import { SEASONS } from "./types.ts";

export const BOARD_UNRANKED_TIER_ID = "tier-unranked";
export const BOARD_IMPORT_VERSION = 1;
export const UNCERTAIN_TITLE_PLACEHOLDER = "（タイトル不明）";

/** Align with app/api/shares/route.ts envelope. */
export const MAX_SHARE_PAYLOAD_BYTES = 800_000;

// Practical bounds within the 800KB API envelope.
export const MAX_TIERS = 20;
export const MAX_ITEMS = 300;
export const MAX_ITEM_IDS_PER_TIER = 200;
export const MAX_TOTAL_ITEM_REFS = 500;
export const MAX_TIER_ID_LENGTH = 64;
export const MAX_TIER_LABEL_LENGTH = 40;
export const MAX_TIER_COLOR_LENGTH = 32;
export const MAX_ITEM_ID_LENGTH = 128;
export const MAX_ITEM_TITLE_LENGTH = 200;
export const MAX_URL_LENGTH = 2048;
export const MAX_UPDATED_AT_LENGTH = 64;
export const MIN_SEASON_YEAR = 1970;
export const MAX_SEASON_YEAR = 2100;
/** Same-origin image proxy path accepted for proxiedImageUrl. */
export const IMAGE_PROXY_PATH_PREFIX = "/api/image-proxy";

/** Nested AnimeItem payload bounds (abusive import / share protection). */
export const MAX_GENRES = 32;
export const MAX_GENRE_LENGTH = 64;
export const MAX_STUDIOS = 32;
export const MAX_VOICE_ACTORS = 100;
export const MAX_STREAMING_EPISODES = 100;
export const MAX_STREAMING_PLATFORMS = 32;
export const MAX_FLATRATE_PROVIDERS = 32;
export const MAX_RECENT_EPISODES = 50;
export const MAX_NESTED_NAME_LENGTH = 200;
export const MAX_FORMAT_LENGTH = 32;
export const MAX_SEASON_STRING_LENGTH = 16;
export const MAX_EPISODES = 10_000;
export const MAX_SCORE = 100;
export const MAX_POPULARITY = 100_000_000;
/**
 * Countdown to next episode (seconds). ~10 years covers long hiatus / far-scheduled
 * airings while rejecting unbounded or unsafe numeric payloads.
 */
export const MAX_TIME_UNTIL_AIRING_SECONDS = 315_360_000; // 10 * 365 * 24 * 3600
/**
 * TMDb provider / AniList·MAL studio & staff numeric IDs.
 * Nonnegative safe integers only (rejects fractional, negative, NaN, unsafe).
 */
export const MAX_EXTERNAL_ENTITY_ID = Number.MAX_SAFE_INTEGER;
/** Canonical ISO-8601 UTC: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ */
const STRICT_UTC_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{3})?Z$/;
const TITLE_SET_KEYS = ["native", "userPreferred", "romaji", "english"] as const;
const SEASON_STRINGS = new Set<string>([
  "WINTER",
  "SPRING",
  "SUMMER",
  "FALL",
  "winter",
  "spring",
  "summer",
  "fall"
]);

export type SharedTierRow = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
  locked?: boolean;
};

export type SharedBoard = {
  version: number;
  season: AnimeSeason;
  seasonYear: number;
  tiers: SharedTierRow[];
  updatedAt: string;
  /**
   * Optional snapshot-only anime absent from the seasonal catalog.
   * Legacy boards omit this field. Share APIs persist it when present.
   */
  extraItems?: AnimeItem[];
};

/** Local/remote board payload compatible with SharedBoard + optional extras. */
export type BoardWithSnapshots = SharedBoard;

export type BoardImportEntry = {
  id?: string;
  title?: string | null;
  titleUncertain?: boolean;
  imageUrl?: string | null;
  proxiedImageUrl?: string | null;
  siteUrl?: string | null;
};

export type BoardImportSuccess = {
  ok: true;
  board: BoardWithSnapshots;
  items: AnimeItem[];
  extraItems: AnimeItem[];
};

export type BoardImportFailure = {
  ok: false;
  error: string;
};

export type BoardImportResult = BoardImportSuccess | BoardImportFailure;

export type SharePayloadValidation =
  | { ok: true; board: SharedBoard; items: AnimeItem[] }
  | { ok: false; error: string; status: 400 | 413 };

const DEFAULT_TIER_COLORS: Record<string, string> = {
  SSS: "#e11d48",
  SS: "#f97316",
  S: "#f87171",
  A: "#fbbf24",
  B: "#34d399",
  C: "#60a5fa",
  D: "#a78bfa",
  未分類: "#9ca3af"
};

const FALLBACK_TIER_COLORS = [
  "#fb7185",
  "#38bdf8",
  "#4ade80",
  "#c084fc",
  "#facc15",
  "#2dd4bf"
];

/** UTF-8 byte length (not JS UTF-16 string length). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Pure guard: remote board autosave (PUT /api/boards) is only for normal
 * authenticated boards — not auth-return protection or import share-intent.
 */
export function shouldEnableRemoteBoardAutosave(input: {
  isAuthenticated: boolean;
  protectLocalBoard: boolean;
  importShareIntentOnly: boolean;
}): boolean {
  return (
    input.isAuthenticated &&
    !input.protectLocalBoard &&
    !input.importShareIntentOnly
  );
}

/** localStorage key prefix for per-year/season import share-intent markers. */
export const IMPORT_SHARE_INTENT_MARKER_VERSION = 1;
export const IMPORT_SHARE_INTENT_STORAGE_PREFIX =
  "anime-tier-board:import-share-intent:v1";
/** Hard cap on marker JSON size (metadata only). */
export const MAX_IMPORT_SHARE_INTENT_MARKER_CHARS = 512;

export type ImportShareIntentMarker = {
  version: typeof IMPORT_SHARE_INTENT_MARKER_VERSION;
  year: number;
  season: AnimeSeason;
  createdAt: string;
};

export function importShareIntentStorageKey(
  year: number,
  season: AnimeSeason
): string {
  return `${IMPORT_SHARE_INTENT_STORAGE_PREFIX}:${year}:${season}`;
}

export function createImportShareIntentMarker(
  year: number,
  season: AnimeSeason,
  createdAt: string = new Date().toISOString()
): ImportShareIntentMarker {
  return {
    version: IMPORT_SHARE_INTENT_MARKER_VERSION,
    year,
    season,
    createdAt
  };
}

export function serializeImportShareIntentMarker(
  marker: ImportShareIntentMarker
): string {
  return JSON.stringify({
    version: marker.version,
    year: marker.year,
    season: marker.season,
    createdAt: marker.createdAt
  });
}

/**
 * Parse a stored import-share-intent marker for a year/season.
 * Returns null for missing, oversized, malformed, version mismatch,
 * invalid fields, unparseable createdAt, or year/season mismatch.
 * Pure — no storage I/O.
 */
export function parseImportShareIntentMarker(
  raw: string | null | undefined,
  expectedYear: number,
  expectedSeason: AnimeSeason
): ImportShareIntentMarker | null {
  if (raw == null || typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (raw.length > MAX_IMPORT_SHARE_INTENT_MARKER_CHARS) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.version !== IMPORT_SHARE_INTENT_MARKER_VERSION) {
    return null;
  }
  if (
    typeof obj.year !== "number" ||
    !Number.isInteger(obj.year) ||
    obj.year < MIN_SEASON_YEAR ||
    obj.year > MAX_SEASON_YEAR
  ) {
    return null;
  }
  if (
    typeof obj.season !== "string" ||
    !SEASONS.includes(obj.season as AnimeSeason)
  ) {
    return null;
  }
  if (
    typeof obj.createdAt !== "string" ||
    obj.createdAt.length === 0 ||
    obj.createdAt.length > MAX_UPDATED_AT_LENGTH ||
    !Number.isFinite(Date.parse(obj.createdAt))
  ) {
    return null;
  }
  if (obj.year !== expectedYear || obj.season !== expectedSeason) {
    return null;
  }

  return {
    version: IMPORT_SHARE_INTENT_MARKER_VERSION,
    year: obj.year,
    season: obj.season as AnimeSeason,
    createdAt: obj.createdAt
  };
}

/** Currently displayed catalog season (UI year/season selection). */
export type CatalogSeasonContext = {
  seasonYear: number;
  season: AnimeSeason;
};

export type CatalogImportMatchOptions = {
  /**
   * When true (cross-target import against a different displayed catalog),
   * items must independently declare matching year and season. Metadata-less
   * items are excluded so wrong-title substitution cannot occur.
   * Same-target / legacy callers omit this and keep metadata-less eligible.
   */
  requireKnownTarget?: boolean;
};

/**
 * Catalog items that declare a different year/season than the import target
 * must not participate in exact id/title matching (prevents wrong-season
 * substitution that is later dropped by target-season reconcile).
 *
 * Default (same-target / legacy): items without season metadata stay eligible.
 * Cross-target (`requireKnownTarget`): only items that positively declare the
 * import target year+season remain candidates.
 */
export function isCatalogItemForImportSeason(
  item: AnimeItem,
  seasonYear: number,
  season: AnimeSeason,
  options?: CatalogImportMatchOptions
): boolean {
  const requireKnownTarget = options?.requireKnownTarget === true;
  const hasYear =
    item.seasonYear != null &&
    typeof item.seasonYear === "number" &&
    Number.isFinite(item.seasonYear);
  const normalizedSeason =
    typeof item.season === "string" && item.season.length > 0
      ? item.season.toUpperCase()
      : null;
  const hasKnownSeason =
    normalizedSeason != null && SEASONS.includes(normalizedSeason as AnimeSeason);

  if (requireKnownTarget) {
    if (!hasYear || item.seasonYear !== seasonYear) {
      return false;
    }
    if (!hasKnownSeason || normalizedSeason !== season) {
      return false;
    }
    return true;
  }

  if (hasYear && item.seasonYear !== seasonYear) {
    return false;
  }
  if (hasKnownSeason && normalizedSeason !== season) {
    return false;
  }
  return true;
}

/**
 * Scope a seasonal catalog to the import target year/season only.
 * When `currentCatalog` differs from the import target, every current-catalog
 * item is excluded unless it independently declares the import target season.
 */
export function filterCatalogForImportTarget(
  seasonalItems: AnimeItem[],
  seasonYear: number,
  season: AnimeSeason,
  currentCatalog?: CatalogSeasonContext | null
): AnimeItem[] {
  const crossTarget =
    currentCatalog != null &&
    (currentCatalog.seasonYear !== seasonYear || currentCatalog.season !== season);
  return seasonalItems.filter((item) =>
    isCatalogItemForImportSeason(item, seasonYear, season, {
      requireKnownTarget: crossTarget
    })
  );
}

export function isSnapshotOnlyItem(item: AnimeItem): boolean {
  return item.snapshotOnly === true || item.id.startsWith("snapshot:");
}

export function mergeBoardItems(
  seasonalItems: AnimeItem[],
  extraItems: AnimeItem[] | undefined | null
): AnimeItem[] {
  const byId = new Map<string, AnimeItem>();
  for (const item of seasonalItems) {
    byId.set(item.id, item);
  }
  for (const item of extraItems ?? []) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

/**
 * Keep ranked custom/snapshot ids that are not in the seasonal catalog.
 * Seasonal-only ids still drop when absent from the catalog (legacy behavior).
 */
export function reconcileBoardWithCatalog(
  board: BoardWithSnapshots,
  seasonalItems: AnimeItem[],
  seasonYear: number,
  season: AnimeSeason
): BoardWithSnapshots {
  const seasonalIds = new Set(seasonalItems.map((item) => item.id));
  const preservedExtra = (board.extraItems ?? []).filter(
    (item) => !seasonalIds.has(item.id) && isMinimalAnimeItem(item)
  );
  const extraById = new Map(preservedExtra.map((item) => [item.id, item]));
  const knownIds = new Set<string>([...seasonalIds, ...extraById.keys()]);
  const usedIds = new Set<string>();

  const baseTiers = ensureUnrankedTier(board.tiers);
  const tiers = baseTiers.map((tier) => {
    const itemIds = tier.itemIds.filter((id) => {
      if (!knownIds.has(id) || usedIds.has(id)) {
        return false;
      }
      usedIds.add(id);
      return true;
    });
    return { ...tier, itemIds };
  });

  const unranked = tiers.find((tier) => tier.id === BOARD_UNRANKED_TIER_ID);
  const missingSeasonalIds = seasonalItems
    .map((item) => item.id)
    .filter((id) => !usedIds.has(id));
  if (unranked) {
    unranked.itemIds = [...unranked.itemIds, ...missingSeasonalIds];
  }

  return {
    ...board,
    season,
    seasonYear,
    tiers,
    extraItems: preservedExtra.length > 0 ? preservedExtra : undefined,
    updatedAt: new Date().toISOString()
  };
}

/** Items to persist on a share: full catalog set + any snapshot-only extras on the board. */
export function collectShareItems(
  board: BoardWithSnapshots,
  availableItems: AnimeItem[]
): AnimeItem[] {
  const byId = new Map(availableItems.map((item) => [item.id, item]));
  for (const item of board.extraItems ?? []) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

/**
 * Structured board import. Supports:
 * 1) Share-like payload: { version, season, seasonYear, tiers[{id,label,color,itemIds}], items[] }
 * 2) Entry form: { version, season, seasonYear, tiers[{label,color?,entries:[{id?,title?,titleUncertain?}]}] }
 *
 * Catalog matches use exact id or exact title only. Uncertain entries never substitute catalog anime.
 * Pass `currentCatalog` (displayed year/season) so cross-target imports do not
 * match against the currently displayed catalog, including metadata-less rows.
 */
export function parseBoardDefinitionImport(
  raw: string,
  seasonalItems: AnimeItem[] = [],
  currentCatalog?: CatalogSeasonContext | null
): BoardImportResult {
  if (utf8ByteLength(raw) > MAX_SHARE_PAYLOAD_BYTES) {
    return {
      ok: false,
      error:
        "ボード定義が大きすぎます（800KB超）。件数や画像URLを減らして再度お試しください。"
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSONの形式が正しくありません。正しいJSONを貼り付けてください。" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "ボード定義はJSONオブジェクトである必要があります。" };
  }

  const root = parsed as Record<string, unknown>;

  if (root.version !== BOARD_IMPORT_VERSION) {
    return {
      ok: false,
      error: `version は ${BOARD_IMPORT_VERSION} を指定してください（受け取った値: ${String(root.version)}）。`
    };
  }

  if (typeof root.season !== "string" || !SEASONS.includes(root.season as AnimeSeason)) {
    return {
      ok: false,
      error: "season が不正です。WINTER / SPRING / SUMMER / FALL のいずれかを指定してください。"
    };
  }
  const season = root.season as AnimeSeason;

  if (
    typeof root.seasonYear !== "number" ||
    !Number.isInteger(root.seasonYear) ||
    root.seasonYear < MIN_SEASON_YEAR ||
    root.seasonYear > MAX_SEASON_YEAR
  ) {
    return {
      ok: false,
      error: `seasonYear は ${MIN_SEASON_YEAR}〜${MAX_SEASON_YEAR} の整数で指定してください。`
    };
  }
  const seasonYear = root.seasonYear;

  if (!Array.isArray(root.tiers) || root.tiers.length === 0 || root.tiers.length > MAX_TIERS) {
    return {
      ok: false,
      error: `tiers は1件以上${MAX_TIERS}件以下の配列である必要があります。`
    };
  }

  // Match only against the import target year/season catalog. Wrong-season
  // exact title/id hits must not substitute live ids that later drop on reconcile.
  // Cross-target: exclude the entire displayed catalog unless items independently
  // declare the import target (metadata-less rows are not candidates).
  const catalogForMatch = filterCatalogForImportTarget(
    seasonalItems,
    seasonYear,
    season,
    currentCatalog
  );
  const seasonalById = new Map(catalogForMatch.map((item) => [item.id, item]));
  const seasonalByTitle = buildTitleIndex(catalogForMatch);

  const providedItems = Array.isArray(root.items) ? root.items : null;
  const itemCatalog = new Map<string, AnimeItem>();
  if (providedItems) {
    if (providedItems.length > MAX_ITEMS) {
      return {
        ok: false,
        error: `items は${MAX_ITEMS}件以下にしてください。`
      };
    }
    for (let i = 0; i < providedItems.length; i += 1) {
      const entry = providedItems[i];
      const itemCheck = validateAnimeItemFields(entry, `items[${i}]`);
      if (!itemCheck.ok) {
        return { ok: false, error: itemCheck.error };
      }
      const validatedItem = itemCheck.item;
      if (itemCatalog.has(validatedItem.id)) {
        return {
          ok: false,
          error: `items 内の id「${validatedItem.id}」が重複しています。`
        };
      }
      itemCatalog.set(validatedItem.id, normalizeImportedItem(validatedItem, seasonalById));
    }
  }

  const extraById = new Map<string, AnimeItem>();
  const tiers: SharedTierRow[] = [];
  const seenTierIds = new Set<string>();
  let snapshotSeq = 0;
  let totalRefs = 0;

  for (let tierIndex = 0; tierIndex < root.tiers.length; tierIndex += 1) {
    const tierRaw = root.tiers[tierIndex];
    if (!tierRaw || typeof tierRaw !== "object" || Array.isArray(tierRaw)) {
      return { ok: false, error: `tiers[${tierIndex}] が不正です。オブジェクトを指定してください。` };
    }
    const tierObj = tierRaw as Record<string, unknown>;
    const label =
      typeof tierObj.label === "string" ? tierObj.label.trim() : "";
    if (!label) {
      return {
        ok: false,
        error: `tiers[${tierIndex}] の label が空です。表示名を指定してください。`
      };
    }
    if (label.length > MAX_TIER_LABEL_LENGTH) {
      return {
        ok: false,
        error: `tiers[${tierIndex}] の label が長すぎます（最大${MAX_TIER_LABEL_LENGTH}文字）。`
      };
    }

    const colorRaw =
      typeof tierObj.color === "string" && tierObj.color.trim()
        ? tierObj.color.trim()
        : DEFAULT_TIER_COLORS[label] ??
          FALLBACK_TIER_COLORS[tierIndex % FALLBACK_TIER_COLORS.length];
    if (colorRaw.length > MAX_TIER_COLOR_LENGTH) {
      return {
        ok: false,
        error: `tiers[${tierIndex}] の color が長すぎます（最大${MAX_TIER_COLOR_LENGTH}文字）。`
      };
    }
    const color = colorRaw;

    const id =
      typeof tierObj.id === "string" && tierObj.id.trim()
        ? tierObj.id.trim()
        : label === "未分類"
          ? BOARD_UNRANKED_TIER_ID
          : `tier-import-${tierIndex}-${slugPart(label)}`;

    if (id.length > MAX_TIER_ID_LENGTH) {
      return {
        ok: false,
        error: `tiers[${tierIndex}] の id が長すぎます（最大${MAX_TIER_ID_LENGTH}文字）。`
      };
    }
    if (seenTierIds.has(id)) {
      return {
        ok: false,
        error: `Tier id「${id}」が重複しています。各段の id は一意にしてください。`
      };
    }
    seenTierIds.add(id);

    if (tierObj.locked !== undefined && typeof tierObj.locked !== "boolean") {
      return {
        ok: false,
        error: `tiers[${tierIndex}] の locked は boolean である必要があります。`
      };
    }
    const locked =
      tierObj.locked === true || id === BOARD_UNRANKED_TIER_ID || label === "未分類";

    const itemIds: string[] = [];

    if (Array.isArray(tierObj.entries)) {
      if (tierObj.entries.length > MAX_ITEM_IDS_PER_TIER) {
        return {
          ok: false,
          error: `tiers[${tierIndex}] (${label}) の entries が多すぎます（最大${MAX_ITEM_IDS_PER_TIER}件）。`
        };
      }
      for (let entryIndex = 0; entryIndex < tierObj.entries.length; entryIndex += 1) {
        const entryRaw = tierObj.entries[entryIndex];
        const resolved = resolveImportEntry(
          entryRaw,
          seasonalById,
          seasonalByTitle,
          itemCatalog,
          () => {
            snapshotSeq += 1;
            return snapshotSeq;
          }
        );
        if (!resolved.ok) {
          return {
            ok: false,
            error: `tiers[${tierIndex}] (${label}) の entries[${entryIndex}]: ${resolved.error}`
          };
        }
        itemIds.push(resolved.item.id);
        if (!seasonalById.has(resolved.item.id)) {
          extraById.set(resolved.item.id, {
            ...resolved.item,
            snapshotOnly: true
          });
        }
      }
    } else if (Array.isArray(tierObj.itemIds)) {
      if (tierObj.itemIds.length > MAX_ITEM_IDS_PER_TIER) {
        return {
          ok: false,
          error: `tiers[${tierIndex}] (${label}) の itemIds が多すぎます（最大${MAX_ITEM_IDS_PER_TIER}件）。`
        };
      }
      for (let idIndex = 0; idIndex < tierObj.itemIds.length; idIndex += 1) {
        const rawId = tierObj.itemIds[idIndex];
        if (typeof rawId !== "string" || !rawId.trim()) {
          return {
            ok: false,
            error: `tiers[${tierIndex}] (${label}) の itemIds[${idIndex}] が不正です。`
          };
        }
        const itemId = rawId.trim();
        if (itemId.length > MAX_ITEM_ID_LENGTH) {
          return {
            ok: false,
            error: `tiers[${tierIndex}] (${label}) の itemIds[${idIndex}] が長すぎます（最大${MAX_ITEM_ID_LENGTH}文字）。`
          };
        }
        const fromCatalog = itemCatalog.get(itemId) ?? seasonalById.get(itemId);
        if (!fromCatalog) {
          return {
            ok: false,
            error: `tiers[${tierIndex}] (${label}) の itemIds に含まれる「${itemId}」が items / カタログに存在しません。`
          };
        }
        itemIds.push(fromCatalog.id);
        if (!seasonalById.has(fromCatalog.id)) {
          extraById.set(fromCatalog.id, {
            ...fromCatalog,
            snapshotOnly: true
          });
        }
      }
    } else {
      return {
        ok: false,
        error: `tiers[${tierIndex}] (${label}) には entries または itemIds のいずれかが必要です。`
      };
    }

    totalRefs += itemIds.length;
    if (totalRefs > MAX_TOTAL_ITEM_REFS) {
      return {
        ok: false,
        error: `全Tierの作品参照合計が上限（${MAX_TOTAL_ITEM_REFS}）を超えています。`
      };
    }

    tiers.push({ id, label, color, itemIds, locked: locked || undefined });
  }

  const crossTierDup = findCrossTierDuplicateItemId(tiers);
  if (crossTierDup) {
    return {
      ok: false,
      error: `作品 id「${crossTierDup}」が複数のTierに含まれています。各作品は1段のみに配置してください。`
    };
  }

  const withUnranked = ensureUnrankedTier(tiers);
  // Put unused target-season catalog items into unranked (same as reconcile).
  const used = new Set(withUnranked.flatMap((tier) => tier.itemIds));
  const unranked = withUnranked.find((tier) => tier.id === BOARD_UNRANKED_TIER_ID);
  if (unranked) {
    const missing = catalogForMatch.map((item) => item.id).filter((id) => !used.has(id));
    unranked.itemIds = [...unranked.itemIds, ...missing];
  }

  const extraItems = Array.from(extraById.values());
  const board: BoardWithSnapshots = {
    version: BOARD_IMPORT_VERSION,
    season,
    seasonYear,
    tiers: withUnranked,
    updatedAt: new Date().toISOString(),
    extraItems: extraItems.length > 0 ? extraItems : undefined
  };

  return {
    ok: true,
    board,
    items: mergeBoardItems(catalogForMatch, extraItems),
    extraItems
  };
}

export function validateSharePayload(
  board: unknown,
  items: unknown
): SharePayloadValidation {
  const boardCheck = validateSharedBoardRoot(board);
  if (!boardCheck.ok) {
    return { ok: false, error: boardCheck.error, status: 400 };
  }
  const sharedBoard = boardCheck.board;

  if (!Array.isArray(items)) {
    return {
      ok: false,
      error: "items は配列である必要があります。",
      status: 400
    };
  }

  if (items.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `items は${MAX_ITEMS}件以下にしてください。`,
      status: 400
    };
  }

  const animeItems: AnimeItem[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const itemCheck = validateAnimeItemFields(items[i], `items[${i}]`);
    if (!itemCheck.ok) {
      return { ok: false, error: itemCheck.error, status: 400 };
    }
    const item = itemCheck.item;
    if (seenItemIds.has(item.id)) {
      return {
        ok: false,
        error: "items 内の id が重複しています。",
        status: 400
      };
    }
    seenItemIds.add(item.id);
    animeItems.push(item);
  }

  const byId = new Map(animeItems.map((item) => [item.id, item]));
  const seenTierIds = new Set<string>();
  let totalRefs = 0;
  const normalizedTiers: SharedTierRow[] = [];

  for (let tierIndex = 0; tierIndex < sharedBoard.tiers.length; tierIndex += 1) {
    const tierRaw = sharedBoard.tiers[tierIndex];
    const tierCheck = validateSharedTierRow(tierRaw, tierIndex);
    if (!tierCheck.ok) {
      return { ok: false, error: tierCheck.error, status: 400 };
    }
    const tier = tierCheck.tier;

    if (seenTierIds.has(tier.id)) {
      return {
        ok: false,
        error: `Tier id「${tier.id}」が重複しています。各段の id は一意にしてください。`,
        status: 400
      };
    }
    seenTierIds.add(tier.id);

    if (tier.itemIds.length > MAX_ITEM_IDS_PER_TIER) {
      return {
        ok: false,
        error: `Tier「${tier.label}」の作品数が多すぎます（最大${MAX_ITEM_IDS_PER_TIER}件）。`,
        status: 400
      };
    }

    totalRefs += tier.itemIds.length;
    if (totalRefs > MAX_TOTAL_ITEM_REFS) {
      return {
        ok: false,
        error: `全Tierの作品参照合計が上限（${MAX_TOTAL_ITEM_REFS}）を超えています。`,
        status: 400
      };
    }

    for (const itemId of tier.itemIds) {
      if (
        typeof itemId !== "string" ||
        itemId.length === 0 ||
        itemId.length > MAX_ITEM_ID_LENGTH ||
        hasControlChars(itemId)
      ) {
        return {
          ok: false,
          error: `Tier「${tier.label}」の作品 id が不正です（空、最大${MAX_ITEM_ID_LENGTH}文字超、または制御文字）。`,
          status: 400
        };
      }
      // Membership in items ∪ extraItems is checked after extraItems validation
      // (sets are required to be disjoint; see collision check below).
    }

    normalizedTiers.push(tier);
  }

  const crossTierDup = findCrossTierDuplicateItemId(normalizedTiers);
  if (crossTierDup) {
    return {
      ok: false,
      error: `作品 id「${crossTierDup}」が複数のTierに含まれています。各作品は1段のみに配置してください。`,
      status: 400
    };
  }

  // Strict extraItems: any invalid entry rejects the entire payload (no silent drop).
  let extraItems: AnimeItem[] | undefined;
  if (sharedBoard.extraItems !== undefined) {
    if (!Array.isArray(sharedBoard.extraItems)) {
      return {
        ok: false,
        error: "extraItems は配列である必要があります。",
        status: 400
      };
    }
    if (sharedBoard.extraItems.length > MAX_ITEMS) {
      return {
        ok: false,
        error: `extraItems は${MAX_ITEMS}件以下にしてください。`,
        status: 400
      };
    }
    if (sharedBoard.extraItems.length > 0) {
      const validatedExtras: AnimeItem[] = [];
      const seenExtraIds = new Set<string>();
      for (let i = 0; i < sharedBoard.extraItems.length; i += 1) {
        const path = `extraItems[${i}]`;
        const itemCheck = validateAnimeItemFields(sharedBoard.extraItems[i], path);
        if (!itemCheck.ok) {
          return { ok: false, error: itemCheck.error, status: 400 };
        }
        const extra = itemCheck.item;
        if (seenExtraIds.has(extra.id)) {
          return {
            ok: false,
            error: `extraItems 内の id「${extra.id}」が重複しています。`,
            status: 400
          };
        }
        // An id may appear in items or extraItems, never both (collision).
        if (byId.has(extra.id)) {
          return {
            ok: false,
            error: `extraItems の id「${extra.id}」が items と衝突しています。同一 id はどちらか一方にのみ含めてください。`,
            status: 400
          };
        }
        seenExtraIds.add(extra.id);
        validatedExtras.push(extra);
      }
      extraItems = validatedExtras;
    }
  }

  // itemIds may resolve from items ∪ extraItems (disjoint sets).
  const resolvedById = new Map(byId);
  for (const extra of extraItems ?? []) {
    resolvedById.set(extra.id, extra);
  }
  for (const tier of normalizedTiers) {
    for (const itemId of tier.itemIds) {
      if (!resolvedById.has(itemId)) {
        return {
          ok: false,
          error: `Tier「${tier.label}」の作品 id「${itemId}」が items / extraItems に含まれていません。カタログ外作品はスナップショットを含めてください。`,
          status: 400
        };
      }
    }
  }

  const normalizedBoard: SharedBoard = {
    version: sharedBoard.version,
    season: sharedBoard.season,
    seasonYear: sharedBoard.seasonYear,
    tiers: normalizedTiers.map((tier) => ({
      id: tier.id,
      label: tier.label,
      color: tier.color,
      itemIds: [...tier.itemIds],
      locked: tier.locked
    })),
    updatedAt: sharedBoard.updatedAt,
    extraItems
  };

  const payloadBytes = utf8ByteLength(
    JSON.stringify({ board: normalizedBoard, items: animeItems })
  );
  if (payloadBytes > MAX_SHARE_PAYLOAD_BYTES) {
    return {
      ok: false,
      error:
        "共有データが大きすぎます。作品数を減らして再度お試しください。",
      status: 413
    };
  }

  return {
    ok: true,
    board: normalizedBoard,
    items: animeItems
  };
}

export function isMinimalAnimeItem(value: unknown): value is AnimeItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<AnimeItem>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.trim().length > 0 &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    item.title.trim().length > 0
  );
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function isHexCharCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

/** Reject incomplete / non-hex percent sequences (URL parser may accept them). */
function hasMalformedPercentEncoding(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) !== 37 /* % */) {
      continue;
    }
    if (i + 2 >= value.length) {
      return true;
    }
    if (!isHexCharCode(value.charCodeAt(i + 1)) || !isHexCharCode(value.charCodeAt(i + 2))) {
      return true;
    }
    i += 2;
  }
  return false;
}

/**
 * Canonical absolute http(s) URL check.
 * Requires a lexical `http://` or `https://` prefix (rejects `https:example.com`,
 * whitespace, protocol-relative, credentials, default-port normalization tricks,
 * malformed percent-encoding, and non-round-tripping forms).
 * Empty string is treated as "no URL" by callers.
 */
function validateExternalHttpUrl(
  url: unknown,
  path: string,
  field: string,
  options: { allowFragment?: boolean; httpsOnly?: boolean } = {}
): string | null {
  if (url == null) {
    return null;
  }
  if (typeof url !== "string") {
    return `${path} の ${field} は文字列である必要があります。`;
  }
  if (url === "") {
    return null;
  }
  if (hasControlChars(url)) {
    return `${path} の ${field} に制御文字が含まれています。`;
  }
  if (hasWhitespace(url)) {
    return `${path} の ${field} に空白文字を含めることはできません。`;
  }
  if (url.length > MAX_URL_LENGTH) {
    return `${path} の ${field} が長すぎます（最大${MAX_URL_LENGTH}文字）。`;
  }
  if (url.startsWith("//")) {
    return `${path} の ${field} はプロトコル相対URL（//...）を許可していません。https:// で始まるURLを指定してください。`;
  }

  const httpsOnly = options.httpsOnly === true;
  const hasHttpsPrefix = url.startsWith("https://");
  const hasHttpPrefix = url.startsWith("http://");
  if (httpsOnly) {
    if (!hasHttpsPrefix) {
      return `${path} の ${field} は https:// で始まる絶対URLのみ指定できます。`;
    }
  } else if (!hasHttpsPrefix && !hasHttpPrefix) {
    return `${path} の ${field} は http:// または https:// で始まる絶対URLのみ指定できます。`;
  }

  if (hasMalformedPercentEncoding(url)) {
    return `${path} の ${field} に不正なパーセントエンコーディングが含まれています。`;
  }
  if (options.allowFragment !== true && url.includes("#")) {
    return `${path} の ${field} にフラグメント（#...）を含めることはできません。`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${path} の ${field} が不正なURLです。http または https の絶対URLを指定してください。`;
  }

  const expectedProtocol = hasHttpsPrefix ? "https:" : "http:";
  if (parsed.protocol !== expectedProtocol) {
    return `${path} の ${field} は http または https のURLのみ指定できます（${parsed.protocol} は不可）。`;
  }
  if (!parsed.hostname) {
    return `${path} の ${field} にホスト名がありません。`;
  }
  if (parsed.username || parsed.password) {
    return `${path} の ${field} にユーザー名・パスワードを含めることはできません。`;
  }
  // Reject explicit default ports that the parser would strip (normalization trick).
  if (
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
  ) {
    return `${path} の ${field} のポート指定が不正です。`;
  }

  // Round-trip / canonical form: input must match the parser serialization,
  // allowing only the common "origin without trailing slash" form.
  const canonical = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (url === canonical) {
    return null;
  }
  if (
    parsed.pathname === "/" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    url === `${parsed.protocol}//${parsed.host}`
  ) {
    return null;
  }
  return `${path} の ${field} が正規化できないURLです。正規形の http(s) URL を指定してください。`;
}

/**
 * proxiedImageUrl may be:
 * - empty string
 * - http(s) absolute URL (same strict rules as external)
 * - exactly `/api/image-proxy?<query>` with required `url` query (https target)
 */
function validateProxiedImageUrl(url: unknown, path: string): string | null {
  if (url == null) {
    return null;
  }
  if (typeof url !== "string") {
    return `${path} の proxiedImageUrl は文字列である必要があります。`;
  }
  if (url === "") {
    return null;
  }
  if (hasControlChars(url)) {
    return `${path} の proxiedImageUrl に制御文字が含まれています。`;
  }
  if (hasWhitespace(url)) {
    return `${path} の proxiedImageUrl に空白文字を含めることはできません。`;
  }
  if (url.length > MAX_URL_LENGTH) {
    return `${path} の proxiedImageUrl が長すぎます（最大${MAX_URL_LENGTH}文字）。`;
  }
  if (url.startsWith("//")) {
    return `${path} の proxiedImageUrl はプロトコル相対URL（//...）を許可していません。`;
  }
  if (url.startsWith("/")) {
    if (url.includes("\\")) {
      return `${path} の proxiedImageUrl に不正な文字（\\）が含まれています。`;
    }
    if (url.includes("#")) {
      return `${path} の proxiedImageUrl にフラグメント（#...）を含めることはできません。`;
    }
    // Exact path `/api/image-proxy` + required query string (reject `/api/image-proxy/...`).
    if (!url.startsWith(`${IMAGE_PROXY_PATH_PREFIX}?`)) {
      return `${path} の proxiedImageUrl は ${IMAGE_PROXY_PATH_PREFIX}?url=... 形式、または http(s) URL のみ指定できます。`;
    }
    const query = url.slice(IMAGE_PROXY_PATH_PREFIX.length + 1);
    if (!query || query.length === 0) {
      return `${path} の proxiedImageUrl には url クエリが必要です。`;
    }
    if (hasMalformedPercentEncoding(query)) {
      return `${path} の proxiedImageUrl のクエリに不正なパーセントエンコーディングが含まれています。`;
    }
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(query);
    } catch {
      return `${path} の proxiedImageUrl のクエリが不正です。`;
    }
    const target = params.get("url");
    if (target == null || target === "") {
      return `${path} の proxiedImageUrl には url クエリが必要です。`;
    }
    // Route only fetches https image URLs.
    const nestedError = validateExternalHttpUrl(target, path, "proxiedImageUrl.url", {
      httpsOnly: true,
      allowFragment: false
    });
    if (nestedError) {
      return nestedError;
    }
    return null;
  }
  return validateExternalHttpUrl(url, path, "proxiedImageUrl");
}

function validateOptionalMediaUrls(
  input: {
    imageUrl?: unknown;
    proxiedImageUrl?: unknown;
    siteUrl?: unknown;
  },
  path: string
): string | null {
  const imageError = validateExternalHttpUrl(input.imageUrl, path, "imageUrl");
  if (imageError) {
    return imageError;
  }
  const siteError = validateExternalHttpUrl(input.siteUrl, path, "siteUrl", {
    allowFragment: true
  });
  if (siteError) {
    return siteError;
  }
  return validateProxiedImageUrl(input.proxiedImageUrl, path);
}

function validateOptionalStringField(
  value: unknown,
  path: string,
  field: string,
  maxLength: number,
  options: { allowEmpty?: boolean; allowNull?: boolean } = {}
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    if (options.allowNull === false) {
      return { ok: false, error: `${path} の ${field} は null にできません。` };
    }
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${path} の ${field} は文字列または null である必要があります。`
    };
  }
  if (hasControlChars(value)) {
    return {
      ok: false,
      error: `${path} の ${field} に制御文字が含まれています。`
    };
  }
  if (value.length > maxLength) {
    return {
      ok: false,
      error: `${path} の ${field} が長すぎます（最大${maxLength}文字）。`
    };
  }
  if (options.allowEmpty === false && value.trim().length === 0) {
    return {
      ok: false,
      error: `${path} の ${field} は空にできません。`
    };
  }
  return { ok: true, value };
}

function validateOptionalFiniteNumber(
  value: unknown,
  path: string,
  field: string,
  options: {
    integer?: boolean;
    min?: number;
    max?: number;
    allowNull?: boolean;
  } = {}
): { ok: true; value: number | null | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    if (options.allowNull === false) {
      return { ok: false, error: `${path} の ${field} は null にできません。` };
    }
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      error: `${path} の ${field} は有限の数値、または null である必要があります。`
    };
  }
  // Safe integers only: rejects fractional, non-integer, and > MAX_SAFE_INTEGER.
  if (options.integer && !Number.isSafeInteger(value)) {
    return {
      ok: false,
      error: `${path} の ${field} は安全な整数である必要があります。`
    };
  }
  if (options.min !== undefined && value < options.min) {
    return {
      ok: false,
      error: `${path} の ${field} が小さすぎます。`
    };
  }
  if (options.max !== undefined && value > options.max) {
    return {
      ok: false,
      error: `${path} の ${field} が大きすぎます。`
    };
  }
  return { ok: true, value };
}

function validateTitlesField(
  value: unknown,
  path: string
):
  | { ok: true; titles: AnimeItem["titles"] | undefined }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, titles: undefined };
  }
  if (value === null) {
    return {
      ok: false,
      error: `${path} の titles はオブジェクトである必要があります。`
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の titles はオブジェクトである必要があります。`
    };
  }
  const raw = value as Record<string, unknown>;
  const titles: NonNullable<AnimeItem["titles"]> = {};
  for (const key of TITLE_SET_KEYS) {
    if (!(key in raw)) {
      continue;
    }
    const field = validateOptionalStringField(
      raw[key],
      path,
      `titles.${key}`,
      MAX_ITEM_TITLE_LENGTH,
      { allowNull: true }
    );
    if (!field.ok) {
      return field;
    }
    if (field.value !== undefined) {
      titles[key] = field.value;
    }
  }
  return { ok: true, titles };
}

function validateReputationField(
  value: unknown,
  path: string
):
  | { ok: true; reputation: AnimeItem["reputation"] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, reputation: undefined };
  }
  if (value === null) {
    return { ok: true, reputation: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の reputation はオブジェクトまたは null である必要があります。`
    };
  }
  const raw = value as Record<string, unknown>;
  const reputation: NonNullable<AnimeItem["reputation"]> = {};
  const numericKeys = [
    "score",
    "scoreMax",
    "scoredBy",
    "popularity",
    "members",
    "favourites",
    "trending",
    "rank"
  ] as const;
  // Counts/ranks are integer; score/scoreMax may be whole-number aggregates.
  const integerReputationKeys = new Set<string>([
    "score",
    "scoreMax",
    "scoredBy",
    "popularity",
    "members",
    "favourites",
    "trending",
    "rank"
  ]);
  for (const key of numericKeys) {
    if (!(key in raw)) {
      continue;
    }
    const field = validateOptionalFiniteNumber(raw[key], path, `reputation.${key}`, {
      allowNull: true,
      integer: integerReputationKeys.has(key),
      min: 0,
      max: key === "score" || key === "scoreMax" ? MAX_SCORE * 10 : MAX_POPULARITY
    });
    if (!field.ok) {
      return field;
    }
    if (field.value !== undefined) {
      reputation[key] = field.value;
    }
  }
  return { ok: true, reputation };
}

function validateAiringField(
  value: unknown,
  path: string
): { ok: true; airing: AnimeItem["airing"] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, airing: undefined };
  }
  if (value === null) {
    return { ok: true, airing: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の airing はオブジェクトまたは null である必要があります。`
    };
  }
  const raw = value as Record<string, unknown>;
  const airing: NonNullable<AnimeItem["airing"]> = {};

  for (const key of [
    "startDate",
    "broadcastDay",
    "broadcastTime",
    "broadcastTimezone",
    "broadcastText",
    "courEstimate"
  ] as const) {
    if (!(key in raw)) {
      continue;
    }
    const field = validateOptionalStringField(
      raw[key],
      path,
      `airing.${key}`,
      MAX_NESTED_NAME_LENGTH,
      { allowNull: true }
    );
    if (!field.ok) {
      return field;
    }
    if (field.value !== undefined) {
      airing[key] = field.value;
    }
  }

  if ("nextEpisode" in raw) {
    if (raw.nextEpisode === null) {
      airing.nextEpisode = null;
    } else if (raw.nextEpisode === undefined) {
      // omit
    } else if (
      typeof raw.nextEpisode !== "object" ||
      Array.isArray(raw.nextEpisode)
    ) {
      return {
        ok: false,
        error: `${path} の airing.nextEpisode はオブジェクトまたは null である必要があります。`
      };
    } else {
      const next = raw.nextEpisode as Record<string, unknown>;
      const episode = validateOptionalFiniteNumber(
        next.episode,
        path,
        "airing.nextEpisode.episode",
        { integer: true, min: 0, max: MAX_EPISODES, allowNull: false }
      );
      if (!episode.ok) {
        return episode;
      }
      if (episode.value === undefined || episode.value === null) {
        return {
          ok: false,
          error: `${path} の airing.nextEpisode.episode が必要です。`
        };
      }
      const nextEpisodeNumber = episode.value;
      const airingAt = validateOptionalStringField(
        next.airingAt,
        path,
        "airing.nextEpisode.airingAt",
        MAX_UPDATED_AT_LENGTH,
        { allowEmpty: false, allowNull: false }
      );
      if (!airingAt.ok) {
        return airingAt;
      }
      if (typeof airingAt.value !== "string") {
        return {
          ok: false,
          error: `${path} の airing.nextEpisode.airingAt が必要です。`
        };
      }
      const nextAiringAt = airingAt.value;
      const timeUntil = validateOptionalFiniteNumber(
        next.timeUntilAiringSeconds,
        path,
        "airing.nextEpisode.timeUntilAiringSeconds",
        {
          integer: true,
          min: 0,
          max: MAX_TIME_UNTIL_AIRING_SECONDS,
          allowNull: true
        }
      );
      if (!timeUntil.ok) {
        return timeUntil;
      }
      airing.nextEpisode = {
        episode: nextEpisodeNumber,
        airingAt: nextAiringAt,
        ...(timeUntil.value !== undefined
          ? { timeUntilAiringSeconds: timeUntil.value }
          : {})
      };
    }
  }

  if ("recentEpisodes" in raw && raw.recentEpisodes !== undefined) {
    if (!Array.isArray(raw.recentEpisodes)) {
      return {
        ok: false,
        error: `${path} の airing.recentEpisodes は配列である必要があります。`
      };
    }
    if (raw.recentEpisodes.length > MAX_RECENT_EPISODES) {
      return {
        ok: false,
        error: `${path} の airing.recentEpisodes が多すぎます（最大${MAX_RECENT_EPISODES}件）。`
      };
    }
    const recent: NonNullable<NonNullable<AnimeItem["airing"]>["recentEpisodes"]> =
      [];
    for (let i = 0; i < raw.recentEpisodes.length; i += 1) {
      const row = raw.recentEpisodes[i];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return {
          ok: false,
          error: `${path} の airing.recentEpisodes[${i}] はオブジェクトである必要があります。`
        };
      }
      const rec = row as Record<string, unknown>;
      const episode = validateOptionalFiniteNumber(
        rec.episode,
        path,
        `airing.recentEpisodes[${i}].episode`,
        { integer: true, min: 0, max: MAX_EPISODES, allowNull: false }
      );
      if (!episode.ok) {
        return episode;
      }
      if (episode.value === undefined || episode.value === null) {
        return {
          ok: false,
          error: `${path} の airing.recentEpisodes[${i}].episode が必要です。`
        };
      }
      const recentEpisodeNumber = episode.value;
      const airingAt = validateOptionalStringField(
        rec.airingAt,
        path,
        `airing.recentEpisodes[${i}].airingAt`,
        MAX_UPDATED_AT_LENGTH,
        { allowEmpty: false, allowNull: false }
      );
      if (!airingAt.ok) {
        return airingAt;
      }
      if (typeof airingAt.value !== "string") {
        return {
          ok: false,
          error: `${path} の airing.recentEpisodes[${i}].airingAt が必要です。`
        };
      }
      recent.push({ episode: recentEpisodeNumber, airingAt: airingAt.value });
    }
    airing.recentEpisodes = recent;
  }

  return { ok: true, airing };
}

function validateStreamingEpisodesField(
  value: unknown,
  path: string
):
  | { ok: true; streamingEpisodes: AnimeItem["streamingEpisodes"] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, streamingEpisodes: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の streamingEpisodes は配列である必要があります。`
    };
  }
  if (value.length > MAX_STREAMING_EPISODES) {
    return {
      ok: false,
      error: `${path} の streamingEpisodes が多すぎます（最大${MAX_STREAMING_EPISODES}件）。`
    };
  }
  const out: NonNullable<AnimeItem["streamingEpisodes"]> = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        error: `${path} の streamingEpisodes[${i}] はオブジェクトである必要があります。`
      };
    }
    const raw = row as Record<string, unknown>;
    const title = validateOptionalStringField(
      raw.title,
      path,
      `streamingEpisodes[${i}].title`,
      MAX_NESTED_NAME_LENGTH,
      { allowNull: true }
    );
    if (!title.ok) {
      return title;
    }
    const site = validateOptionalStringField(
      raw.site,
      path,
      `streamingEpisodes[${i}].site`,
      MAX_NESTED_NAME_LENGTH,
      { allowNull: true }
    );
    if (!site.ok) {
      return site;
    }
    if (typeof raw.url !== "string" || raw.url === "") {
      return {
        ok: false,
        error: `${path} の streamingEpisodes[${i}].url は空でない文字列である必要があります。`
      };
    }
    const urlError = validateExternalHttpUrl(
      raw.url,
      path,
      `streamingEpisodes[${i}].url`
    );
    if (urlError) {
      return { ok: false, error: urlError };
    }
    out.push({
      url: raw.url,
      ...(title.value !== undefined ? { title: title.value } : {}),
      ...(site.value !== undefined ? { site: site.value } : {})
    });
  }
  return { ok: true, streamingEpisodes: out };
}

function validateStreamingPlatformsField(
  value: unknown,
  path: string
):
  | { ok: true; streamingPlatforms: AnimeItem["streamingPlatforms"] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, streamingPlatforms: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の streamingPlatforms は配列である必要があります。`
    };
  }
  if (value.length > MAX_STREAMING_PLATFORMS) {
    return {
      ok: false,
      error: `${path} の streamingPlatforms が多すぎます（最大${MAX_STREAMING_PLATFORMS}件）。`
    };
  }
  const out: NonNullable<AnimeItem["streamingPlatforms"]> = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        error: `${path} の streamingPlatforms[${i}] はオブジェクトである必要があります。`
      };
    }
    const raw = row as Record<string, unknown>;
    if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
      return {
        ok: false,
        error: `${path} の streamingPlatforms[${i}].name は空でない文字列である必要があります。`
      };
    }
    if (raw.name.length > MAX_NESTED_NAME_LENGTH || hasControlChars(raw.name)) {
      return {
        ok: false,
        error: `${path} の streamingPlatforms[${i}].name が不正です。`
      };
    }
    if (typeof raw.url !== "string" || raw.url === "") {
      return {
        ok: false,
        error: `${path} の streamingPlatforms[${i}].url は空でない文字列である必要があります。`
      };
    }
    const urlError = validateExternalHttpUrl(
      raw.url,
      path,
      `streamingPlatforms[${i}].url`
    );
    if (urlError) {
      return { ok: false, error: urlError };
    }
    const source = validateOptionalStringField(
      raw.source,
      path,
      `streamingPlatforms[${i}].source`,
      MAX_NESTED_NAME_LENGTH,
      { allowNull: false }
    );
    if (!source.ok) {
      return source;
    }
    const region = validateOptionalStringField(
      raw.region,
      path,
      `streamingPlatforms[${i}].region`,
      MAX_NESTED_NAME_LENGTH,
      { allowNull: true }
    );
    if (!region.ok) {
      return region;
    }
    const platform: NonNullable<AnimeItem["streamingPlatforms"]>[number] = {
      name: raw.name,
      url: raw.url
    };
    if (typeof source.value === "string") {
      platform.source = source.value;
    }
    if (region.value !== undefined) {
      platform.region = region.value;
    }
    out.push(platform);
  }
  return { ok: true, streamingPlatforms: out };
}

function validateStreamingProvidersJpField(
  value: unknown,
  path: string
):
  | { ok: true; streamingProvidersJp: AnimeItem["streamingProvidersJp"] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, streamingProvidersJp: undefined };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の streamingProvidersJp はオブジェクトである必要があります。`
    };
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.flatrate)) {
    return {
      ok: false,
      error: `${path} の streamingProvidersJp.flatrate は配列である必要があります。`
    };
  }
  if (raw.flatrate.length > MAX_FLATRATE_PROVIDERS) {
    return {
      ok: false,
      error: `${path} の streamingProvidersJp.flatrate が多すぎます（最大${MAX_FLATRATE_PROVIDERS}件）。`
    };
  }
  const flatrate: NonNullable<AnimeItem["streamingProvidersJp"]>["flatrate"] = [];
  for (let i = 0; i < raw.flatrate.length; i += 1) {
    const row = raw.flatrate[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.flatrate[${i}] はオブジェクトである必要があります。`
      };
    }
    const p = row as Record<string, unknown>;
    const id = validateOptionalFiniteNumber(
      p.id,
      path,
      `streamingProvidersJp.flatrate[${i}].id`,
      {
        integer: true,
        min: 0,
        max: MAX_EXTERNAL_ENTITY_ID,
        allowNull: false
      }
    );
    if (!id.ok) {
      return id;
    }
    if (id.value === undefined || id.value === null) {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.flatrate[${i}].id が必要です。`
      };
    }
    const providerId = id.value;
    if (typeof p.name !== "string" || p.name.trim().length === 0) {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.flatrate[${i}].name は空でない文字列である必要があります。`
      };
    }
    if (p.name.length > MAX_NESTED_NAME_LENGTH || hasControlChars(p.name)) {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.flatrate[${i}].name が不正です。`
      };
    }
    if (p.logoUrl !== null && typeof p.logoUrl !== "string") {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.flatrate[${i}].logoUrl は文字列または null である必要があります。`
      };
    }
    if (typeof p.logoUrl === "string" && p.logoUrl !== "") {
      const logoError = validateExternalHttpUrl(
        p.logoUrl,
        path,
        `streamingProvidersJp.flatrate[${i}].logoUrl`
      );
      if (logoError) {
        return { ok: false, error: logoError };
      }
    }
    flatrate.push({
      id: providerId,
      name: p.name,
      logoUrl: (p.logoUrl as string | null) ?? null
    });
  }

  let providerLink: string | null | undefined;
  if ("providerLink" in raw) {
    if (raw.providerLink === null) {
      providerLink = null;
    } else if (raw.providerLink === undefined) {
      providerLink = undefined;
    } else if (typeof raw.providerLink !== "string") {
      return {
        ok: false,
        error: `${path} の streamingProvidersJp.providerLink は文字列または null である必要があります。`
      };
    } else if (raw.providerLink === "") {
      providerLink = "";
    } else {
      const linkError = validateExternalHttpUrl(
        raw.providerLink,
        path,
        "streamingProvidersJp.providerLink"
      );
      if (linkError) {
        return { ok: false, error: linkError };
      }
      providerLink = raw.providerLink;
    }
  }

  return {
    ok: true,
    streamingProvidersJp: {
      flatrate,
      ...(providerLink !== undefined ? { providerLink } : {})
    }
  };
}

function validateStudiosField(
  value: unknown,
  path: string
): { ok: true; studios: AnimeItem["studios"] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, studios: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の studios は配列である必要があります。`
    };
  }
  if (value.length > MAX_STUDIOS) {
    return {
      ok: false,
      error: `${path} の studios が多すぎます（最大${MAX_STUDIOS}件）。`
    };
  }
  const out: NonNullable<AnimeItem["studios"]> = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        error: `${path} の studios[${i}] はオブジェクトである必要があります。`
      };
    }
    const raw = row as Record<string, unknown>;
    if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
      return {
        ok: false,
        error: `${path} の studios[${i}].name は空でない文字列である必要があります。`
      };
    }
    if (raw.name.length > MAX_NESTED_NAME_LENGTH || hasControlChars(raw.name)) {
      return {
        ok: false,
        error: `${path} の studios[${i}].name が不正です。`
      };
    }
    const studioId = validateOptionalEntityId(raw.id, path, `studios[${i}].id`);
    if (!studioId.ok) {
      return studioId;
    }
    let siteUrl: string | null | undefined;
    if ("siteUrl" in raw) {
      if (raw.siteUrl === null) {
        siteUrl = null;
      } else if (raw.siteUrl === undefined) {
        siteUrl = undefined;
      } else if (typeof raw.siteUrl !== "string") {
        return {
          ok: false,
          error: `${path} の studios[${i}].siteUrl は文字列または null である必要があります。`
        };
      } else if (raw.siteUrl === "") {
        siteUrl = "";
      } else {
        const siteError = validateExternalHttpUrl(
          raw.siteUrl,
          path,
          `studios[${i}].siteUrl`
        );
        if (siteError) {
          return { ok: false, error: siteError };
        }
        siteUrl = raw.siteUrl;
      }
    }
    out.push({
      name: raw.name,
      ...(studioId.value !== undefined ? { id: studioId.value } : {}),
      ...(siteUrl !== undefined ? { siteUrl } : {})
    });
  }
  return { ok: true, studios: out };
}

function validateVoiceActorsField(
  value: unknown,
  path: string
):
  | { ok: true; voiceActors: AnimeItem["voiceActors"] }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, voiceActors: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の voiceActors は配列である必要があります。`
    };
  }
  if (value.length > MAX_VOICE_ACTORS) {
    return {
      ok: false,
      error: `${path} の voiceActors が多すぎます（最大${MAX_VOICE_ACTORS}件）。`
    };
  }
  const out: NonNullable<AnimeItem["voiceActors"]> = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        error: `${path} の voiceActors[${i}] はオブジェクトである必要があります。`
      };
    }
    const raw = row as Record<string, unknown>;
    if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
      return {
        ok: false,
        error: `${path} の voiceActors[${i}].name は空でない文字列である必要があります。`
      };
    }
    if (raw.name.length > MAX_NESTED_NAME_LENGTH || hasControlChars(raw.name)) {
      return {
        ok: false,
        error: `${path} の voiceActors[${i}].name が不正です。`
      };
    }
    const vaId = validateOptionalEntityId(raw.id, path, `voiceActors[${i}].id`);
    if (!vaId.ok) {
      return vaId;
    }
    const optionalStrings = [
      "nativeName",
      "language",
      "characterName",
      "characterRole"
    ] as const;
    const stringFields: Partial<
      Record<(typeof optionalStrings)[number], string | null>
    > = {};
    for (const key of optionalStrings) {
      if (!(key in raw)) {
        continue;
      }
      const field = validateOptionalStringField(
        raw[key],
        path,
        `voiceActors[${i}].${key}`,
        MAX_NESTED_NAME_LENGTH,
        { allowNull: true }
      );
      if (!field.ok) {
        return field;
      }
      if (field.value !== undefined) {
        stringFields[key] = field.value;
      }
    }
    let imageUrl: string | null | undefined;
    if ("imageUrl" in raw) {
      if (raw.imageUrl === null) {
        imageUrl = null;
      } else if (raw.imageUrl === undefined) {
        imageUrl = undefined;
      } else if (typeof raw.imageUrl !== "string") {
        return {
          ok: false,
          error: `${path} の voiceActors[${i}].imageUrl は文字列または null である必要があります。`
        };
      } else if (raw.imageUrl === "") {
        imageUrl = "";
      } else {
        const imageError = validateExternalHttpUrl(
          raw.imageUrl,
          path,
          `voiceActors[${i}].imageUrl`
        );
        if (imageError) {
          return { ok: false, error: imageError };
        }
        imageUrl = raw.imageUrl;
      }
    }
    let siteUrl: string | null | undefined;
    if ("siteUrl" in raw) {
      if (raw.siteUrl === null) {
        siteUrl = null;
      } else if (raw.siteUrl === undefined) {
        siteUrl = undefined;
      } else if (typeof raw.siteUrl !== "string") {
        return {
          ok: false,
          error: `${path} の voiceActors[${i}].siteUrl は文字列または null である必要があります。`
        };
      } else if (raw.siteUrl === "") {
        siteUrl = "";
      } else {
        const siteError = validateExternalHttpUrl(
          raw.siteUrl,
          path,
          `voiceActors[${i}].siteUrl`
        );
        if (siteError) {
          return { ok: false, error: siteError };
        }
        siteUrl = raw.siteUrl;
      }
    }
    out.push({
      name: raw.name,
      ...(vaId.value !== undefined ? { id: vaId.value } : {}),
      ...stringFields,
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(siteUrl !== undefined ? { siteUrl } : {})
    });
  }
  return { ok: true, voiceActors: out };
}

/**
 * Studio / voice-actor entity id: null, exact string form, or nonnegative safe integer.
 * Does not trim strings (padding changes identity).
 */
function validateOptionalEntityId(
  value: unknown,
  path: string,
  field: string
):
  | { ok: true; value: string | number | null | undefined }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    if (value !== value.trim()) {
      return {
        ok: false,
        error: `${path} の ${field} の前後に空白を含めることはできません。`
      };
    }
    if (value.length > MAX_ITEM_ID_LENGTH || hasControlChars(value)) {
      return {
        ok: false,
        error: `${path} の ${field} が不正です。`
      };
    }
    return { ok: true, value };
  }
  if (typeof value === "number") {
    const num = validateOptionalFiniteNumber(value, path, field, {
      integer: true,
      min: 0,
      max: MAX_EXTERNAL_ENTITY_ID,
      allowNull: false
    });
    if (!num.ok) {
      return num;
    }
    return { ok: true, value: num.value as number };
  }
  return {
    ok: false,
    error: `${path} の ${field} は string / number / null である必要があります。`
  };
}

function validateGenresField(
  value: unknown,
  path: string
): { ok: true; genres: AnimeItem["genres"] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, genres: undefined };
  }
  if (value === null) {
    return {
      ok: false,
      error: `${path} の genres は文字列配列である必要があります。`
    };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} の genres は文字列配列である必要があります。`
    };
  }
  if (value.length > MAX_GENRES) {
    return {
      ok: false,
      error: `${path} の genres が多すぎます（最大${MAX_GENRES}件）。`
    };
  }
  const genres: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const g = value[i];
    if (typeof g !== "string") {
      return {
        ok: false,
        error: `${path} の genres[${i}] は文字列である必要があります。`
      };
    }
    if (g.length === 0 || g.length > MAX_GENRE_LENGTH || hasControlChars(g)) {
      return {
        ok: false,
        error: `${path} の genres[${i}] が不正です（空・最大${MAX_GENRE_LENGTH}文字・制御文字不可）。`
      };
    }
    genres.push(g);
  }
  return { ok: true, genres };
}

/**
 * Validate every consumed AnimeItem field and rebuild from allowlisted values.
 * Never returns the raw untrusted object via cast/spread.
 */
function validateAnimeItemFields(
  value: unknown,
  path: string
): { ok: true; item: AnimeItem } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `${path} が不正です。id と title を含む作品スナップショットが必要です。`
    };
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    return {
      ok: false,
      error: `${path} が不正です。空でない id が必要です。`
    };
  }
  // Reject padded ids (trim would change identity).
  if (raw.id !== raw.id.trim()) {
    return {
      ok: false,
      error: `${path} の id の前後に空白を含めることはできません。`
    };
  }
  if (raw.id.length > MAX_ITEM_ID_LENGTH || hasControlChars(raw.id)) {
    return {
      ok: false,
      error: `${path} の id が不正です（最大${MAX_ITEM_ID_LENGTH}文字・制御文字不可）。`
    };
  }

  if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
    return {
      ok: false,
      error: `${path} が不正です。空でない title が必要です。`
    };
  }
  // Reject padded titles (trim would change identity / catalog match keys).
  if (raw.title !== raw.title.trim()) {
    return {
      ok: false,
      error: `${path} の title の前後に空白を含めることはできません。`
    };
  }
  if (raw.title.length > MAX_ITEM_TITLE_LENGTH || hasControlChars(raw.title)) {
    return {
      ok: false,
      error: `${path} の title が不正です（最大${MAX_ITEM_TITLE_LENGTH}文字・制御文字不可）。`
    };
  }

  const imageUrlField = validateOptionalStringField(
    raw.imageUrl,
    path,
    "imageUrl",
    MAX_URL_LENGTH,
    { allowNull: false }
  );
  if (!imageUrlField.ok) {
    return imageUrlField;
  }
  const proxiedField = validateOptionalStringField(
    raw.proxiedImageUrl,
    path,
    "proxiedImageUrl",
    MAX_URL_LENGTH,
    { allowNull: false }
  );
  if (!proxiedField.ok) {
    return proxiedField;
  }
  const siteUrlField = validateOptionalStringField(
    raw.siteUrl,
    path,
    "siteUrl",
    MAX_URL_LENGTH,
    { allowNull: false }
  );
  if (!siteUrlField.ok) {
    return siteUrlField;
  }

  const urlError = validateOptionalMediaUrls(
    {
      imageUrl: imageUrlField.value,
      proxiedImageUrl: proxiedField.value,
      siteUrl: siteUrlField.value
    },
    path
  );
  if (urlError) {
    return { ok: false, error: urlError };
  }

  if (raw.snapshotOnly !== undefined && typeof raw.snapshotOnly !== "boolean") {
    return {
      ok: false,
      error: `${path} の snapshotOnly は boolean である必要があります。`
    };
  }
  if (raw.titleUncertain !== undefined && typeof raw.titleUncertain !== "boolean") {
    return {
      ok: false,
      error: `${path} の titleUncertain は boolean である必要があります。`
    };
  }

  let source: AnimeItem["source"] = "anilist";
  if (raw.source !== undefined && raw.source !== null) {
    if (raw.source !== "anilist" && raw.source !== "jikan") {
      return {
        ok: false,
        error: `${path} の source は anilist または jikan である必要があります。`
      };
    }
    source = raw.source;
  }

  const titlesCheck = validateTitlesField(raw.titles, path);
  if (!titlesCheck.ok) {
    return titlesCheck;
  }
  const titles =
    titlesCheck.titles ??
    ({ userPreferred: raw.title } as AnimeItem["titles"]);

  let format: AnimeItem["format"];
  if ("format" in raw) {
    if (raw.format === null) {
      format = null;
    } else if (raw.format === undefined) {
      format = undefined;
    } else if (typeof raw.format !== "string") {
      return {
        ok: false,
        error: `${path} の format は文字列または null である必要があります。`
      };
    } else if (
      raw.format.length > MAX_FORMAT_LENGTH ||
      hasControlChars(raw.format)
    ) {
      return {
        ok: false,
        error: `${path} の format が不正です。`
      };
    } else {
      format = raw.format;
    }
  }

  let season: AnimeItem["season"];
  if ("season" in raw) {
    if (raw.season === null) {
      season = null;
    } else if (raw.season === undefined) {
      season = undefined;
    } else if (typeof raw.season !== "string") {
      return {
        ok: false,
        error: `${path} の season は文字列または null である必要があります。`
      };
    } else if (
      raw.season.length > MAX_SEASON_STRING_LENGTH ||
      hasControlChars(raw.season) ||
      !SEASON_STRINGS.has(raw.season)
    ) {
      return {
        ok: false,
        error: `${path} の season が不正です。`
      };
    } else {
      season = raw.season;
    }
  }

  const seasonYear = validateOptionalFiniteNumber(raw.seasonYear, path, "seasonYear", {
    integer: true,
    min: MIN_SEASON_YEAR,
    max: MAX_SEASON_YEAR,
    allowNull: true
  });
  if (!seasonYear.ok) {
    return seasonYear;
  }

  const episodes = validateOptionalFiniteNumber(raw.episodes, path, "episodes", {
    integer: true,
    min: 0,
    max: MAX_EPISODES,
    allowNull: true
  });
  if (!episodes.ok) {
    return episodes;
  }

  const score = validateOptionalFiniteNumber(raw.score, path, "score", {
    // Mean scores may be fractional; still nonnegative and bounded.
    min: 0,
    max: MAX_SCORE,
    allowNull: true
  });
  if (!score.ok) {
    return score;
  }

  const popularity = validateOptionalFiniteNumber(raw.popularity, path, "popularity", {
    integer: true,
    min: 0,
    max: MAX_POPULARITY,
    allowNull: true
  });
  if (!popularity.ok) {
    return popularity;
  }

  if (
    raw.isRebroadcast !== undefined &&
    raw.isRebroadcast !== null &&
    typeof raw.isRebroadcast !== "boolean"
  ) {
    return {
      ok: false,
      error: `${path} の isRebroadcast は boolean または null である必要があります。`
    };
  }

  const reputation = validateReputationField(raw.reputation, path);
  if (!reputation.ok) {
    return reputation;
  }
  const airing = validateAiringField(raw.airing, path);
  if (!airing.ok) {
    return airing;
  }
  const streamingEpisodes = validateStreamingEpisodesField(raw.streamingEpisodes, path);
  if (!streamingEpisodes.ok) {
    return streamingEpisodes;
  }
  const streamingPlatforms = validateStreamingPlatformsField(
    raw.streamingPlatforms,
    path
  );
  if (!streamingPlatforms.ok) {
    return streamingPlatforms;
  }
  const streamingProvidersJp = validateStreamingProvidersJpField(
    raw.streamingProvidersJp,
    path
  );
  if (!streamingProvidersJp.ok) {
    return streamingProvidersJp;
  }
  const studios = validateStudiosField(raw.studios, path);
  if (!studios.ok) {
    return studios;
  }
  const voiceActors = validateVoiceActorsField(raw.voiceActors, path);
  if (!voiceActors.ok) {
    return voiceActors;
  }
  const genres = validateGenresField(raw.genres, path);
  if (!genres.ok) {
    return genres;
  }

  const item: AnimeItem = {
    id: raw.id,
    source,
    title: raw.title,
    titles,
    imageUrl: typeof imageUrlField.value === "string" ? imageUrlField.value : "",
    proxiedImageUrl: typeof proxiedField.value === "string" ? proxiedField.value : "",
    siteUrl: typeof siteUrlField.value === "string" ? siteUrlField.value : ""
  };

  if (format !== undefined) {
    item.format = format;
  }
  if (season !== undefined) {
    item.season = season;
  }
  if (seasonYear.value !== undefined) {
    item.seasonYear = seasonYear.value;
  }
  if (episodes.value !== undefined) {
    item.episodes = episodes.value;
  }
  if (score.value !== undefined) {
    item.score = score.value;
  }
  if (popularity.value !== undefined) {
    item.popularity = popularity.value;
  }
  if (reputation.reputation !== undefined) {
    item.reputation = reputation.reputation;
  }
  if (airing.airing !== undefined) {
    item.airing = airing.airing;
  }
  if (streamingEpisodes.streamingEpisodes !== undefined) {
    item.streamingEpisodes = streamingEpisodes.streamingEpisodes;
  }
  if (streamingPlatforms.streamingPlatforms !== undefined) {
    item.streamingPlatforms = streamingPlatforms.streamingPlatforms;
  }
  if (streamingProvidersJp.streamingProvidersJp !== undefined) {
    item.streamingProvidersJp = streamingProvidersJp.streamingProvidersJp;
  }
  if (raw.isRebroadcast !== undefined) {
    item.isRebroadcast = raw.isRebroadcast as boolean | null;
  }
  if (genres.genres !== undefined) {
    item.genres = genres.genres;
  }
  if (studios.studios !== undefined) {
    item.studios = studios.studios;
  }
  if (voiceActors.voiceActors !== undefined) {
    item.voiceActors = voiceActors.voiceActors;
  }
  if (typeof raw.snapshotOnly === "boolean") {
    item.snapshotOnly = raw.snapshotOnly;
  }
  if (typeof raw.titleUncertain === "boolean") {
    item.titleUncertain = raw.titleUncertain;
  }

  return { ok: true, item };
}

/** Strict UTC ISO-8601 timestamp (milliseconds optional). Rejects Date.parse-loose values. */
function validateStrictUtcTimestamp(
  value: string
): { ok: true } | { ok: false; error: string } {
  if (
    value.length === 0 ||
    value.length > MAX_UPDATED_AT_LENGTH ||
    hasControlChars(value) ||
    hasWhitespace(value)
  ) {
    return {
      ok: false,
      error: `updatedAt は有効な日時文字列である必要があります（1〜${MAX_UPDATED_AT_LENGTH}文字）。`
    };
  }
  const match = STRICT_UTC_TIMESTAMP_RE.exec(value);
  if (!match) {
    return {
      ok: false,
      error:
        "updatedAt は UTC の ISO 8601（例: 2026-08-01T00:00:00.000Z または 2026-08-01T00:00:00Z）で指定してください。"
    };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return {
      ok: false,
      error: "updatedAt が不正な日時です。"
    };
  }
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    return {
      ok: false,
      error: "updatedAt が不正な日時です。"
    };
  }
  const iso = new Date(parsedMs).toISOString();
  // Accept either full millisecond form or whole-second Z form that round-trips.
  if (value === iso) {
    return { ok: true };
  }
  if (!match[7] && iso === value.replace(/Z$/, ".000Z")) {
    return { ok: true };
  }
  // Impossible calendar dates normalize (e.g. 2026-02-30 → March); reject.
  return {
    ok: false,
    error: "updatedAt が不正な日時です（正規化できない日付です）。"
  };
}

function validateSharedBoardRoot(
  value: unknown
): { ok: true; board: SharedBoard } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: "ボードはオブジェクトである必要があります。"
    };
  }
  const board = value as Record<string, unknown>;

  if (board.version !== BOARD_IMPORT_VERSION) {
    return {
      ok: false,
      error: `version は ${BOARD_IMPORT_VERSION} を指定してください（受け取った値: ${String(board.version)}）。`
    };
  }
  if (typeof board.version === "number" && !Number.isInteger(board.version)) {
    return {
      ok: false,
      error: `version は整数 ${BOARD_IMPORT_VERSION} を指定してください。`
    };
  }

  if (typeof board.season !== "string" || !SEASONS.includes(board.season as AnimeSeason)) {
    return {
      ok: false,
      error: "season が不正です。WINTER / SPRING / SUMMER / FALL のいずれかを指定してください。"
    };
  }

  if (
    typeof board.seasonYear !== "number" ||
    !Number.isInteger(board.seasonYear) ||
    board.seasonYear < MIN_SEASON_YEAR ||
    board.seasonYear > MAX_SEASON_YEAR
  ) {
    return {
      ok: false,
      error: `seasonYear は ${MIN_SEASON_YEAR}〜${MAX_SEASON_YEAR} の整数で指定してください。`
    };
  }

  if (typeof board.updatedAt !== "string") {
    return {
      ok: false,
      error: "updatedAt は日時文字列である必要があります。"
    };
  }
  const updatedAtCheck = validateStrictUtcTimestamp(board.updatedAt);
  if (!updatedAtCheck.ok) {
    return updatedAtCheck;
  }

  if (!Array.isArray(board.tiers) || board.tiers.length === 0 || board.tiers.length > MAX_TIERS) {
    return {
      ok: false,
      error: `tiers は1件以上${MAX_TIERS}件以下の配列である必要があります。`
    };
  }

  if (board.extraItems !== undefined && !Array.isArray(board.extraItems)) {
    return {
      ok: false,
      error: "extraItems は配列である必要があります。"
    };
  }

  return { ok: true, board: value as SharedBoard };
}

function validateSharedTierRow(
  value: unknown,
  tierIndex: number
): { ok: true; tier: SharedTierRow } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: `tiers[${tierIndex}] が不正です。オブジェクトを指定してください。`
    };
  }
  const tier = value as Record<string, unknown>;

  if (typeof tier.id !== "string") {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の id は文字列である必要があります。`
    };
  }
  if (tier.id.length === 0 || tier.id.length > MAX_TIER_ID_LENGTH || hasControlChars(tier.id)) {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の id が不正です（空、最大${MAX_TIER_ID_LENGTH}文字超、または制御文字）。`
    };
  }

  if (typeof tier.label !== "string") {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の label は文字列である必要があります。`
    };
  }
  if (
    tier.label.length === 0 ||
    tier.label.length > MAX_TIER_LABEL_LENGTH ||
    hasControlChars(tier.label)
  ) {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の label が不正です（空、最大${MAX_TIER_LABEL_LENGTH}文字超、または制御文字）。`
    };
  }

  if (typeof tier.color !== "string") {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の color は文字列である必要があります。`
    };
  }
  if (
    tier.color.length === 0 ||
    tier.color.length > MAX_TIER_COLOR_LENGTH ||
    hasControlChars(tier.color)
  ) {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の color が不正です（空、最大${MAX_TIER_COLOR_LENGTH}文字超、または制御文字）。`
    };
  }

  if (!Array.isArray(tier.itemIds) || !tier.itemIds.every((id) => typeof id === "string")) {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の itemIds は文字列配列である必要があります。`
    };
  }

  if (tier.locked !== undefined && typeof tier.locked !== "boolean") {
    return {
      ok: false,
      error: `tiers[${tierIndex}] の locked は boolean である必要があります。`
    };
  }

  const normalized: SharedTierRow = {
    id: tier.id,
    label: tier.label,
    color: tier.color,
    itemIds: tier.itemIds as string[],
    locked: typeof tier.locked === "boolean" ? tier.locked : undefined
  };
  return { ok: true, tier: normalized };
}

function findCrossTierDuplicateItemId(tiers: SharedTierRow[]): string | null {
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const id of tier.itemIds) {
      if (seen.has(id)) {
        return id;
      }
      seen.add(id);
    }
  }
  return null;
}

function ensureUnrankedTier(tiers: SharedTierRow[]): SharedTierRow[] {
  if (tiers.some((tier) => tier.id === BOARD_UNRANKED_TIER_ID)) {
    return tiers.map((tier) =>
      tier.id === BOARD_UNRANKED_TIER_ID ? { ...tier, locked: true } : { ...tier }
    );
  }
  return [
    ...tiers.map((tier) => ({ ...tier })),
    {
      id: BOARD_UNRANKED_TIER_ID,
      label: "未分類",
      color: DEFAULT_TIER_COLORS["未分類"],
      itemIds: [],
      locked: true
    }
  ];
}

function buildTitleIndex(items: AnimeItem[]): Map<string, AnimeItem> {
  const map = new Map<string, AnimeItem>();
  for (const item of items) {
    for (const key of collectTitleKeys(item)) {
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
  }
  return map;
}

/**
 * Exact title keys only — no lowercasing, whitespace collapse, or case folding.
 * Catalog substitution must match character-for-character after validation.
 */
function collectTitleKeys(item: AnimeItem): string[] {
  const keys = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (typeof value === "string" && value.length > 0) {
      keys.add(value);
    }
  };
  push(item.title);
  push(item.titles?.native);
  push(item.titles?.userPreferred);
  push(item.titles?.romaji);
  push(item.titles?.english);
  return Array.from(keys);
}

function normalizeImportedItem(
  entry: AnimeItem,
  seasonalById: Map<string, AnimeItem>
): AnimeItem {
  const seasonal = seasonalById.get(entry.id);
  if (seasonal) {
    return seasonal;
  }
  return {
    id: entry.id,
    source: entry.source ?? "anilist",
    title: entry.title,
    titles: entry.titles ?? { userPreferred: entry.title },
    imageUrl: entry.imageUrl ?? "",
    proxiedImageUrl: entry.proxiedImageUrl ?? entry.imageUrl ?? "",
    siteUrl: entry.siteUrl ?? "",
    format: entry.format ?? null,
    season: entry.season ?? null,
    seasonYear: entry.seasonYear ?? null,
    episodes: entry.episodes ?? null,
    score: entry.score ?? null,
    popularity: entry.popularity ?? null,
    reputation: entry.reputation ?? null,
    airing: entry.airing ?? null,
    streamingEpisodes: entry.streamingEpisodes,
    streamingPlatforms: entry.streamingPlatforms,
    streamingProvidersJp: entry.streamingProvidersJp,
    isRebroadcast: entry.isRebroadcast ?? null,
    genres: entry.genres,
    studios: entry.studios,
    voiceActors: entry.voiceActors,
    snapshotOnly: entry.snapshotOnly ?? true,
    titleUncertain: entry.titleUncertain
  };
}

function resolveImportEntry(
  entryRaw: unknown,
  seasonalById: Map<string, AnimeItem>,
  seasonalByTitle: Map<string, AnimeItem>,
  itemCatalog: Map<string, AnimeItem>,
  nextSeq: () => number
): { ok: true; item: AnimeItem } | { ok: false; error: string } {
  if (typeof entryRaw === "string") {
    if (hasControlChars(entryRaw)) {
      return { ok: false, error: "エントリ文字列に制御文字を含められません。" };
    }
    // Strict lexical form: reject padding rather than trim into another identity.
    if (entryRaw !== entryRaw.trim()) {
      return {
        ok: false,
        error: "エントリ文字列の前後に空白を含めることはできません。"
      };
    }
    const key = entryRaw;
    if (!key) {
      return { ok: false, error: "空の文字列エントリは使えません。" };
    }
    if (key.length > MAX_ITEM_TITLE_LENGTH) {
      return {
        ok: false,
        error: `タイトルが長すぎます（最大${MAX_ITEM_TITLE_LENGTH}文字）。`
      };
    }
    const byId = itemCatalog.get(key) ?? seasonalById.get(key);
    if (byId) {
      return { ok: true, item: byId };
    }
    // Exact title equality only (no case/space folding).
    const byTitle = seasonalByTitle.get(key);
    if (byTitle) {
      return { ok: true, item: byTitle };
    }
    return {
      ok: true,
      item: createSnapshotItem({
        id: `snapshot:${slugPart(key)}`,
        title: key,
        titleUncertain: false
      })
    };
  }

  if (!entryRaw || typeof entryRaw !== "object" || Array.isArray(entryRaw)) {
    return { ok: false, error: "エントリは文字列またはオブジェクトである必要があります。" };
  }

  const entry = entryRaw as BoardImportEntry;

  // titleUncertain must be boolean when present — never coerce truthy strings/numbers.
  if (entry.titleUncertain !== undefined && typeof entry.titleUncertain !== "boolean") {
    return {
      ok: false,
      error: "titleUncertain は boolean である必要があります。"
    };
  }
  const titleUncertain = entry.titleUncertain === true;

  if (entry.id !== undefined && entry.id !== null && typeof entry.id !== "string") {
    return { ok: false, error: "id は文字列である必要があります。" };
  }
  if (entry.title !== undefined && entry.title !== null && typeof entry.title !== "string") {
    return { ok: false, error: "title は文字列または null である必要があります。" };
  }

  // Strict lexical form for caller-provided id/title (consistent with share payload).
  if (typeof entry.id === "string" && entry.id !== entry.id.trim()) {
    return {
      ok: false,
      error: "id の前後に空白を含めることはできません。"
    };
  }
  if (typeof entry.title === "string" && entry.title !== entry.title.trim()) {
    return {
      ok: false,
      error: "title の前後に空白を含めることはできません。"
    };
  }

  if (titleUncertain) {
    // Explicit uncertainty: never match / substitute a catalog title.
    const seq = nextSeq();
    let id: string;
    if (typeof entry.id === "string" && entry.id.length > 0) {
      if (entry.id.length > MAX_ITEM_ID_LENGTH || hasControlChars(entry.id)) {
        return {
          ok: false,
          error: `id が不正です（最大${MAX_ITEM_ID_LENGTH}文字・制御文字不可）。`
        };
      }
      id = entry.id;
    } else {
      id = `snapshot:uncertain-${seq}`;
    }
    const urlError = validateOptionalMediaUrls(entry, "entry");
    if (urlError) {
      return { ok: false, error: urlError };
    }
    return {
      ok: true,
      item: createSnapshotItem({
        id,
        title: UNCERTAIN_TITLE_PLACEHOLDER,
        titleUncertain: true,
        imageUrl: entry.imageUrl,
        proxiedImageUrl: entry.proxiedImageUrl,
        siteUrl: entry.siteUrl
      })
    };
  }

  if (typeof entry.id === "string" && entry.id.length > 0) {
    const id = entry.id;
    if (id.length > MAX_ITEM_ID_LENGTH || hasControlChars(id)) {
      return {
        ok: false,
        error: `id が不正です（最大${MAX_ITEM_ID_LENGTH}文字・制御文字不可）。`
      };
    }
    const fromCatalog = itemCatalog.get(id) ?? seasonalById.get(id);
    if (fromCatalog) {
      return { ok: true, item: fromCatalog };
    }
    const title =
      typeof entry.title === "string" && entry.title.length > 0 ? entry.title : null;
    if (!title) {
      return {
        ok: false,
        error: `id「${id}」はカタログに無く、title も無いためスナップショットを作れません。`
      };
    }
    if (title.length > MAX_ITEM_TITLE_LENGTH || hasControlChars(title)) {
      return {
        ok: false,
        error: `title が不正です（最大${MAX_ITEM_TITLE_LENGTH}文字・制御文字不可）。`
      };
    }
    const urlError = validateOptionalMediaUrls(entry, "entry");
    if (urlError) {
      return { ok: false, error: urlError };
    }
    return {
      ok: true,
      item: createSnapshotItem({
        // Keep caller-provided id for stable round-trip (mark snapshotOnly).
        id,
        title,
        titleUncertain: false,
        imageUrl: entry.imageUrl,
        proxiedImageUrl: entry.proxiedImageUrl,
        siteUrl: entry.siteUrl
      })
    };
  }

  if (typeof entry.title === "string" && entry.title.length > 0) {
    const title = entry.title;
    if (title.length > MAX_ITEM_TITLE_LENGTH || hasControlChars(title)) {
      return {
        ok: false,
        error: `title が不正です（最大${MAX_ITEM_TITLE_LENGTH}文字・制御文字不可）。`
      };
    }
    // Exact title equality only — no normalize/case-fold/space-collapse.
    const byTitle = seasonalByTitle.get(title);
    if (byTitle) {
      return { ok: true, item: byTitle };
    }
    const urlError = validateOptionalMediaUrls(entry, "entry");
    if (urlError) {
      return { ok: false, error: urlError };
    }
    return {
      ok: true,
      item: createSnapshotItem({
        id: `snapshot:${slugPart(title)}`,
        title,
        titleUncertain: false,
        imageUrl: entry.imageUrl,
        proxiedImageUrl: entry.proxiedImageUrl,
        siteUrl: entry.siteUrl
      })
    };
  }

  return {
    ok: false,
    error:
      "id または title が必要です。タイトルが不明な場合は titleUncertain: true を指定してください。"
  };
}

function createSnapshotItem(input: {
  id: string;
  title: string;
  titleUncertain: boolean;
  imageUrl?: string | null;
  proxiedImageUrl?: string | null;
  siteUrl?: string | null;
}): AnimeItem {
  const imageUrl = input.imageUrl?.trim() || "";
  return {
    id: input.id,
    source: "anilist",
    title: input.title,
    titles: { userPreferred: input.title, native: input.title },
    imageUrl,
    proxiedImageUrl: input.proxiedImageUrl?.trim() || imageUrl,
    siteUrl: input.siteUrl?.trim() || "",
    snapshotOnly: true,
    titleUncertain: input.titleUncertain || undefined
  };
}

/** Client-safe slug; never imports node:crypto. */
function slugPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "")
    .slice(0, 48);
  if (normalized) {
    return normalized;
  }
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}
