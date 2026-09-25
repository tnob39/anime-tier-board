"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { signIn, useSession } from "next-auth/react";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Heart,
  Loader2,
  MoreHorizontal,
  Plus,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Trash2
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import {
  useDisplayMode,
  type DisplayMode
} from "@/components/display-mode/DisplayModeProvider";
import { AsyncState } from "@/components/ui/AsyncState";
import { track } from "@/lib/analytics";
import { filterAnimeItems } from "@/lib/anime-filters";
import { getAnimePopularity } from "@/lib/anime-popularity";
import {
  fetchSeasonalAnimeClient,
  seedSeasonalAnimeCache,
} from "@/lib/seasonal-anime-client-cache";
import { getCurrentAnimeSeason, normalizeSeason } from "@/lib/season";
import { shareOrCopyUrl, type ShareOutcome } from "@/lib/share-url";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import {
  getMergedStreamingPlatforms,
  getStreamingPlatformOverflowCount,
  STREAMING_PLATFORM_VISIBLE_LIMIT
} from "@/lib/streaming-services";
import type { AnimeItem, AnimeSeason } from "@/lib/types";
import { SEASON_LABELS, SEASONS } from "@/lib/types";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "anime-tier-board:v1";
const UNRANKED_TIER_ID = "tier-unranked";
const MOVE_HINT_STORAGE_KEY = "numanie:tier:move-hint-seen";
/** Fixed sessionStorage key for guest→auth share resume (metadata only). */
const PENDING_SHARE_INTENT_KEY = "anime-tier-board:pending-share-intent:v1";
const PENDING_SHARE_INTENT_VERSION = 1;
/** Pending share intent is valid only within 10 minutes of createdAt. */
const PENDING_SHARE_INTENT_MAX_AGE_MS = 10 * 60 * 1000;
/** Durable crash-recovery + ownership record in localStorage (survives tabs/close). */
const SHARE_HANDOFF_RECOVERY_KEY = "anime-tier-board:share-handoff-recovery:v2";
const SHARE_HANDOFF_OWNER_TAB_ID_KEY = "anime-tier-board:share-handoff-owner-tab-id:v1";
const SHARE_HANDOFF_LOCK_NAME = "anime-tier-board:share-handoff-post:v2";
const SHARE_HANDOFF_RECOVERY_VERSION = 2;
const SHARE_HANDOFF_RECOVERY_MAX_AGE_MS = PENDING_SHARE_INTENT_MAX_AGE_MS;
const SHARE_HANDOFF_LEASE_MS = 15_000;

const AUTH_RETURN_STATUS_EVALUATING = "Tier表を引き継いでいます…";
const AUTH_RETURN_STATUS_EXPIRED =
  "共有の再開期限が切れました。もう一度「共有」を押してください。";
const HANDOFF_LOAD_ERROR_MESSAGE =
  "Tier表を引き継げませんでした。通信環境を確認して再度お試しください。";
const SHARE_CREATE_ERROR_MESSAGE = "シェアの作成に失敗しました。";
const HANDOFF_CONFLICT_TITLE = "保存済みのTier表があります";
const HANDOFF_REPLACE_CONFIRM_MESSAGE =
  "アカウントに保存済みのTier表を置き換えます。よろしいですか？";
const SHARE_LOGIN_PROMPT_MESSAGE =
  "Tier表を共有するにはログインしてください。作成したTier表はそのまま引き継がれます。";
const HANDOFF_SHARING_STATUS_MESSAGE = "共有処理中…";
const HANDOFF_RECOVERY_UNKNOWN_MESSAGE =
  "共有の結果を確認できません。自動では再送しません。この端末のTier表は保持されています。";
const HANDOFF_REMOTE_CONTEXT_ERROR_MESSAGE =
  "引き継ぎ先のシーズンが一致しません。この端末のTier表は保持されています。";
const HANDOFF_RECOVERY_EXPIRED_MESSAGE =
  "共有の再開期限が切れました。この端末のTier表は保持されています。";
const HANDOFF_RECOVERY_UNREADABLE_MESSAGE =
  "引き継ぎ状態を確認できません。この端末のTier表は保護されています。";
const PENDING_SHARE_INTENT_STORAGE_ERROR_MESSAGE =
  "共有の準備を保存できませんでした。空き容量やブラウザ設定を確認して、もう一度お試しください。";
const HANDOFF_RESTORE_FAILED_MESSAGE =
  "この端末のTier表を復元できませんでした。共有記録は保持されています。";
const HANDOFF_RECOVERY_OTHER_TAB_MESSAGE =
  "別のタブで共有処理中です。このタブでは自動では再送しません。";

type TierRow = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
  locked?: boolean;
};

/** Metadata-only pending share intent (no board body / anime / URL / token). */
type PendingShareIntent = {
  version: typeof PENDING_SHARE_INTENT_VERSION;
  action: "share";
  year: number;
  season: AnimeSeason;
  createdAt: string;
};

/** Auth-return pending-share evaluation / #692 auto-resume phase. */
type AuthReturnPhase =
  | "pending"
  | "evaluating"
  | "conflict"
  | "confirm-replace"
  | "handoff-error"
  | "sharing"
  | "recovery"
  | "expired"
  | "none";

type HandoffErrorKind =
  | "load"
  | "save"
  | "share"
  | "context"
  | "recovery-unknown"
  | "recovery-expired"
  | "recovery-unreadable"
  | "restore-failed"
  | "recovery-other-tab"
  | null;

type ShareHandoffPutStatus = "none" | "completed" | "unknown";
type ShareHandoffPostState =
  | "not_started"
  | "post_started_unknown"
  | "post_failed_definite"
  | "post_completed_cleanup_pending";

type SharePostOutcome = "success" | "definite_failure" | "unknown";
type HandoffPutOutcome =
  | "saved"
  | "conflict"
  | "definite_failure"
  | "unknown"
  | "aborted";

/** Versioned, context-keyed durable recovery+ownership record (localStorage). */
type ShareHandoffRecoveryMarker = {
  version: typeof SHARE_HANDOFF_RECOVERY_VERSION;
  year: number;
  season: AnimeSeason;
  storageKey: string;
  attemptId: string;
  guestRaw: string;
  chosenBoardRaw: string;
  chosenBoardHash: string;
  createdAt: string;
  putStatus: ShareHandoffPutStatus;
  postState: ShareHandoffPostState;
  ownerTabId: string;
  leaseExpiresAt: string;
};

type DurableRead<T> =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "malformed" }
  | { kind: "ok"; value: T };

type StoredBoardRead =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "ok"; raw: string; board: BoardState | null };

type AuthReturnShareDecision =
  | "none"
  | "valid"
  | "expired"
  | "invalid"
  | "corrupt"
  | "unreadable";

type BoardState = {
  version: typeof STORAGE_VERSION;
  season: AnimeSeason;
  seasonYear: number;
  tiers: TierRow[];
  updatedAt: string;
};

type BoardApiResponse = {
  board: BoardState | null;
  error?: string;
};

type ShareApiResponse = {
  shareId?: string;
  error?: string;
};

type StatusApiResponse = {
  statuses?: AnimeStatusRecord[];
  error?: string;
};

const viewingStatusOptions: Array<{ value: ViewingStatus; label: string }> = [
  { value: "planned", label: "見たい" },
  { value: "watching", label: "視聴中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "一時停止" },
  { value: "dropped", label: "中止" }
];

const defaultTierTemplates: Array<Omit<TierRow, "itemIds">> = [
  { id: "tier-s", label: "S", color: "#f87171" },
  { id: "tier-a", label: "A", color: "#fbbf24" },
  { id: "tier-b", label: "B", color: "#34d399" },
  { id: "tier-c", label: "C", color: "#60a5fa" },
  { id: "tier-d", label: "D", color: "#a78bfa" },
  { id: UNRANKED_TIER_ID, label: "未分類", color: "#9ca3af", locked: true }
];

const nextTierColors = [
  "#fb7185",
  "#38bdf8",
  "#4ade80",
  "#c084fc",
  "#facc15",
  "#2dd4bf"
];

export type RatingQueueSeasonItem = {
  id: string;
  season?: AnimeSeason | string | null;
  seasonYear?: number | null;
};

export type RatingQueueTierLike = {
  id: string;
  itemIds: string[];
};

export type RatingQueueUndoSnapshot = {
  itemId: string;
  fromTierId: string;
  fromIndex: number;
};

type StatusLoadState = "idle" | "loading" | "ready" | "error";

/**
 * Exact current-season match by item metadata only — never titles.
 * Missing or unrecognized season/year must not match (fail-closed).
 */
export function matchesRatingQueueSeason(
  item: Pick<RatingQueueSeasonItem, "season" | "seasonYear">,
  season: AnimeSeason,
  seasonYear: number
): boolean {
  if (typeof item.seasonYear !== "number" || !Number.isFinite(item.seasonYear)) {
    return false;
  }
  if (item.seasonYear !== seasonYear) {
    return false;
  }
  if (item.season == null || String(item.season).length === 0) {
    return false;
  }
  const normalized = normalizeSeason(String(item.season));
  if (!normalized || normalized !== season) {
    return false;
  }
  return true;
}

/**
 * Completed + current board season + present in items + currently unranked.
 * Identity is anime ID only. Deferred IDs are skipped for this session.
 */
export function selectRatingQueueCandidateIds(input: {
  statusMap: Record<string, ViewingStatus>;
  unrankedItemIds: readonly string[];
  itemsById: ReadonlyMap<string, RatingQueueSeasonItem>;
  season: AnimeSeason;
  seasonYear: number;
  deferredIds: ReadonlySet<string>;
}): string[] {
  const { statusMap, unrankedItemIds, itemsById, season, seasonYear, deferredIds } =
    input;
  const seen = new Set<string>();
  const candidateIds: string[] = [];

  for (const itemId of unrankedItemIds) {
    if (!itemId || seen.has(itemId) || deferredIds.has(itemId)) {
      continue;
    }
    seen.add(itemId);
    if (statusMap[itemId] !== "completed") {
      continue;
    }
    const item = itemsById.get(itemId);
    if (!item) {
      continue;
    }
    if (!matchesRatingQueueSeason(item, season, seasonYear)) {
      continue;
    }
    candidateIds.push(itemId);
  }

  return candidateIds;
}

export function restoreItemToExactPosition<T extends RatingQueueTierLike>(
  tiers: T[],
  snapshot: RatingQueueUndoSnapshot
): T[] {
  const target = tiers.find((tier) => tier.id === snapshot.fromTierId);
  if (!target) {
    return tiers;
  }

  const stripped = tiers.map((tier) => ({
    ...tier,
    itemIds: tier.itemIds.filter((id) => id !== snapshot.itemId)
  }));

  return stripped.map((tier) => {
    if (tier.id !== snapshot.fromTierId) {
      return tier;
    }
    const nextIds = [...tier.itemIds];
    const index = Math.max(0, Math.min(snapshot.fromIndex, nextIds.length));
    nextIds.splice(index, 0, snapshot.itemId);
    return {
      ...tier,
      itemIds: nextIds
    };
  });
}

export function placeItemOnTierOnce<T extends RatingQueueTierLike>(
  tiers: T[],
  itemId: string,
  targetTierId: string
): T[] {
  const sourceTier = tiers.find((tier) => tier.itemIds.includes(itemId));
  const targetTier = tiers.find((tier) => tier.id === targetTierId);
  if (!sourceTier || !targetTier || sourceTier.id === targetTierId) {
    return tiers;
  }

  return tiers.map((tier) => {
    if (tier.id === sourceTier.id) {
      return {
        ...tier,
        itemIds: tier.itemIds.filter((id) => id !== itemId)
      };
    }
    if (tier.id === targetTierId) {
      if (tier.itemIds.includes(itemId)) {
        return tier;
      }
      return {
        ...tier,
        itemIds: [...tier.itemIds, itemId]
      };
    }
    return tier;
  });
}

type TierBoardAppProps = {
  initialSeasonalAnime?: AnimeItem[];
  initialYear?: number;
  initialSeason?: AnimeSeason;
};

export function TierBoardApp({
  initialSeasonalAnime,
  initialYear,
  initialSeason,
}: TierBoardAppProps = {}) {
  const { status: authStatus } = useSession();
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const toolbarMoreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!toolbarMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setToolbarMenuOpen(false);
        toolbarMoreButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toolbarMenuOpen]);
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);

  // Seed from SSR-provided data for current season (enables instant cache hit on direct/reload)
  const seededRef = useRef(false);
  if (
    !seededRef.current &&
    initialSeasonalAnime &&
    initialSeasonalAnime.length > 0
  ) {
    const seedYear = initialYear ?? currentSeason.year;
    const seedSeason = initialSeason ?? currentSeason.season;
    seedSeasonalAnimeCache(seedYear, seedSeason, initialSeasonalAnime);
    seededRef.current = true;
  }

  const startYear = initialYear ?? currentSeason.year;
  const startSeason = initialSeason ?? currentSeason.season;
  const hasValidSeed =
    !!initialSeasonalAnime &&
    initialSeasonalAnime.length > 0 &&
    startYear === currentSeason.year &&
    startSeason === currentSeason.season;

  const [seasonYear, setSeasonYear] = useState(startYear);
  const [season, setSeason] = useState<AnimeSeason>(startSeason);

  // Prefill items from SSR seed for the initial current season to avoid loading skeleton flash
  const [items, setItems] = useState<AnimeItem[]>(() =>
    hasValidSeed && initialSeasonalAnime ? initialSeasonalAnime : []
  );
  const [board, setBoard] = useState<BoardState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !hasValidSeed);
  const [saveState, setSaveState] = useState<"local" | "saving" | "saved" | "error">(
    "local"
  );
  const [statusMap, setStatusMap] = useState<Record<string, ViewingStatus>>({});
  const [sharing, setSharing] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState<null | "status" | "share">(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome>("none");
  const [copyConfirm, setCopyConfirm] = useState(false);
  const copyConfirmTimeoutRef = useRef<number | null>(null);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);
  const saveSuccessTimeoutRef = useRef<number | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [moveMenuItemId, setMoveMenuItemId] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const [moveHintSeen, setMoveHintSeen] = useState(true);
  const [poolDrawerOpen, setPoolDrawerOpen] = useState(false);
  const [moveAnnouncement, setMoveAnnouncement] = useState<string | null>(null);
  const [statusLoadState, setStatusLoadState] = useState<StatusLoadState>("idle");
  const [statusReloadToken, setStatusReloadToken] = useState(0);
  const [deferredRatingIds, setDeferredRatingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [lastQueuePlacement, setLastQueuePlacement] =
    useState<RatingQueueUndoSnapshot | null>(null);
  const { mode: displayMode } = useDisplayMode();
  const moveAnnouncementTimeoutRef = useRef<number | null>(null);
  const dragOriginTierIdRef = useRef<string | null>(null);
  /** pending until session settles; evaluating/conflict/error/expired/none after auth-return. */
  const [authReturnPhase, setAuthReturnPhase] = useState<AuthReturnPhase>("pending");
  /**
   * Suppress automatic remote board/status traffic while a recognized pending intent
   * (valid / expired / invalid / conflict) keeps the guest local board until handoff ends.
   */
  const protectLocalBoardRef = useRef(false);
  const authReturnPhaseRef = useRef<AuthReturnPhase>("pending");
  authReturnPhaseRef.current = authReturnPhase;
  /** Synchronous Share in-flight lock (state `sharing` alone can miss double-activation). */
  const shareInFlightRef = useRef(false);
  const shareAttemptTokenRef = useRef(0);
  const handoffActionLockRef = useRef(false);
  const handoffPostIssuedRef = useRef(false);
  const handoffCancelledRef = useRef(false);
  const handoffBusyRef = useRef(false);
  const handoffLocalRef = useRef<BoardState | null>(null);
  const handoffRemoteRef = useRef<BoardState | null>(null);
  const handoffItemsRef = useRef<AnimeItem[]>([]);
  const handoffYearRef = useRef<number | null>(null);
  const handoffSeasonRef = useRef<AnimeSeason | null>(null);
  const [handoffErrorKind, setHandoffErrorKind] = useState<HandoffErrorKind>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const handoffGenerationRef = useRef(0);
  const handoffAbortRef = useRef<AbortController | null>(null);
  const guestSnapshotRawRef = useRef<string | null>(null);
  const handoffShareBoardRef = useRef<BoardState | null>(null);
  const recoveryAttemptIdRef = useRef<string | null>(null);
  const recoveryPutStatusRef = useRef<ShareHandoffPutStatus>("none");
  const handoffOwnerTabIdRef = useRef<string | null>(null);
  /** Canonical pending|evaluating|choice lock for handlers + UI. */
  const isAuthReturnLocked = isAuthReturnPhaseLocked(authReturnPhase);
  const handoffPostLocked = authReturnPhase === "sharing";
  const handoffActionsLocked = sharing || handoffBusy || handoffPostLocked;

  useEffect(() => {
    setMoveHintSeen(window.localStorage.getItem(MOVE_HINT_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    handoffOwnerTabIdRef.current = readOrCreateStableHandoffOwnerTabId();
  }, []);

  const announceMove = useCallback((itemTitle: string, tierLabel: string) => {
    if (moveAnnouncementTimeoutRef.current !== null) {
      window.clearTimeout(moveAnnouncementTimeoutRef.current);
    }
    setMoveAnnouncement(`「${itemTitle}」を${tierLabel}に移動しました`);
    moveAnnouncementTimeoutRef.current = window.setTimeout(() => {
      setMoveAnnouncement(null);
      moveAnnouncementTimeoutRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (copyConfirmTimeoutRef.current !== null) {
        window.clearTimeout(copyConfirmTimeoutRef.current);
      }
      if (saveSuccessTimeoutRef.current !== null) {
        window.clearTimeout(saveSuccessTimeoutRef.current);
      }
      if (moveAnnouncementTimeoutRef.current !== null) {
        window.clearTimeout(moveAnnouncementTimeoutRef.current);
      }
    };
  }, []);

  const dismissMoveHint = useCallback(() => {
    setMoveHintSeen((current) => {
      if (current) return current;
      window.localStorage.setItem(MOVE_HINT_STORAGE_KEY, "1");
      return true;
    });
  }, []);

  const handleOpenMoveMenu = useCallback(
    (itemId: string) => {
      if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
        return;
      }
      dismissMoveHint();
      setMoveMenuItemId(itemId);
    },
    [dismissMoveHint]
  );

  const storageKey = useMemo(
    () => getStorageKey(seasonYear, season),
    [seasonYear, season]
  );
  const isAuthenticated = authStatus === "authenticated";

  const visibleItems = useMemo(
    () => filterAnimeItems(items, { hideMovies, hideRerunCandidates, seasonYear }),
    [hideMovies, hideRerunCandidates, items, seasonYear]
  );
  const visibleItemIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems]
  );
  const itemMap = useMemo(() => {
    return new Map(visibleItems.map((item) => [item.id, item]));
  }, [visibleItems]);

  const activeItem = activeItemId ? itemMap.get(activeItemId) ?? null : null;
  const moveMenuItem = moveMenuItemId ? itemMap.get(moveMenuItemId) ?? null : null;
  const moveMenuCurrentTierId =
    board && moveMenuItemId ? findTierIdByItemId(board.tiers, moveMenuItemId) : null;
  const visibleTiers = useMemo(
    () =>
      board?.tiers.map((tier) => ({
        ...tier,
        itemIds: tier.itemIds.filter((itemId) => visibleItemIds.has(itemId))
      })) ?? [],
    [board?.tiers, visibleItemIds]
  );
  const unrankedTier = visibleTiers.find((tier) => tier.id === UNRANKED_TIER_ID);
  const rankedTiers = visibleTiers.filter((tier) => tier.id !== UNRANKED_TIER_ID);
  const ratingQueueItemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const ratingQueueCandidateIds = useMemo(() => {
    if (!board) {
      return [];
    }
    const unrankedItemIds =
      board.tiers.find((tier) => tier.id === UNRANKED_TIER_ID)?.itemIds ?? [];
    return selectRatingQueueCandidateIds({
      statusMap,
      unrankedItemIds,
      itemsById: ratingQueueItemMap,
      season,
      seasonYear,
      deferredIds: deferredRatingIds
    });
  }, [
    board,
    deferredRatingIds,
    ratingQueueItemMap,
    season,
    seasonYear,
    statusMap
  ]);
  const ratingQueueCurrentId = ratingQueueCandidateIds[0] ?? null;
  const ratingQueueCurrentItem = ratingQueueCurrentId
    ? ratingQueueItemMap.get(ratingQueueCurrentId) ?? null
    : null;
  const ratingQueueCurrentTierId =
    board && ratingQueueCurrentId
      ? findTierIdByItemId(board.tiers, ratingQueueCurrentId)
      : null;
  const tierIdSet = useMemo(
    () => new Set(board?.tiers.map((tier) => tier.id) ?? []),
    [board?.tiers]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      const collisions =
        pointerCollisions.length > 0
          ? pointerCollisions
          : rectIntersection(args).length > 0
            ? rectIntersection(args)
            : closestCorners(args);
      const cardCollisions = collisions.filter(
        (collision) => !tierIdSet.has(String(collision.id))
      );

      return cardCollisions.length > 0 ? cardCollisions : collisions;
    },
    [tierIdSet]
  );

  const yearOptions = useMemo(() => {
    const start = currentSeason.year - 3;
    return Array.from({ length: 8 }, (_, index) => start + index);
  }, [currentSeason.year]);

  // True once auth-return evaluation finished (or guest). Leaving protected→none must not
  // re-trigger loadAnime (would remote-GET and overwrite the preserved local board).
  const authReturnReady =
    authStatus !== "authenticated" || !isAuthReturnPhaseLocked(authReturnPhase);

  const loadAnime = useCallback(async () => {
    if (authStatus === "loading") {
      return;
    }

    // Wait for pending-share auth-return evaluation before any board source choice.
    if (!authReturnReady) {
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const payload = await fetchSeasonalAnimeClient(seasonYear, season);
      const nextItems = payload.items;
      // Guarded auth-return: never use remote as the board source (local only).
      const storedBoard =
        isAuthenticated && !protectLocalBoardRef.current
          ? await readRemoteBoard(seasonYear, season)
          : readStoredBoard(storageKey);
      const nextBoard = reconcileBoard(
        storedBoard ?? createDefaultBoard(seasonYear, season, nextItems),
        nextItems,
        seasonYear,
        season
      );

      setItems(nextItems);
      setBoard(nextBoard);
      setWarning(payload.warning ?? payload.enrichWarning ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      if (protectLocalBoardRef.current) {
        // Guarded seasonal failure: keep existing local board/storage and guard.
        // Never write a default empty board that would clobber guest layout.
        setBoard((current) => current ?? readStoredBoard(storageKey));
        return;
      }
      setItems([]);
      setBoard(createDefaultBoard(seasonYear, season, []));
    } finally {
      setLoading(false);
    }
  }, [authReturnReady, authStatus, isAuthenticated, season, seasonYear, storageKey]);

  useEffect(() => {
    // For the very first load of the seeded current season, fetch will hit cache instantly.
    // We still invoke loadAnime to populate warning/board consistently.
    void loadAnime();
  }, [loadAnime]);

  // Auth-return guard: evaluate metadata-only pending share intent before remote board load.
  useEffect(() => {
    if (authStatus === "loading") {
      return;
    }

    if (authStatus !== "authenticated") {
      protectLocalBoardRef.current = false;
      setAuthReturnPhase("none");
      return;
    }

    const generation = bumpHandoffGeneration();
    handoffCancelledRef.current = false;
    handoffOwnerTabIdRef.current ??= readOrCreateStableHandoffOwnerTabId();

    async function runAuthReturnGuard() {
      const pendingIntentRead = readPendingShareIntentRaw();
      if (pendingIntentRead.kind === "unreadable") {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      if (pendingIntentRead.kind === "ok" && !ensureHandoffAttemptId()) {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }

      if (await applyUnresolvedShareHandoffRecovery(generation)) {
        return;
      }

      const hasIntent = pendingIntentRead.kind === "ok";

      if (!hasIntent) {
        if (isHandoffGenerationCurrent(generation)) {
          protectLocalBoardRef.current = false;
          setAuthReturnPhase("none");
        }
        return;
      }

      protectLocalBoardRef.current = true;

      const evaluation = evaluateAuthReturnShareIntent(pendingIntentRead.value);
      const decision = evaluation.decision;

      if (
        (decision === "valid" || decision === "expired") &&
        evaluation.year != null &&
        evaluation.season != null
      ) {
        setSeasonYear(evaluation.year);
        setSeason(evaluation.season);
      }

      if (isHandoffGenerationCurrent(generation)) {
        setAuthReturnPhase("evaluating");
      }

      await waitForAuthReturnEvaluatingBoundary();
      if (!isHandoffGenerationCurrent(generation)) {
        return;
      }

      if (decision === "expired") {
        if (!clearPendingShareIntent()) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("expired");
        return;
      }

      if (decision === "unreadable") {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }

      if (decision === "corrupt") {
        handoffYearRef.current = evaluation.year ?? null;
        handoffSeasonRef.current = evaluation.season ?? null;
        guestSnapshotRawRef.current = evaluation.corruptRaw ?? null;
        setHandoffErrorKind("load");
        setAuthReturnPhase("handoff-error");
        return;
      }

      if (decision !== "valid" || evaluation.year == null || evaluation.season == null) {
        if (!clearPendingShareIntent()) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("none");
        return;
      }

      const year = evaluation.year;
      const nextSeason = evaluation.season;
      const localKey = getStorageKey(year, nextSeason);
      const stored = readStoredBoardRecord(localKey);
      if (stored.kind === "unreadable") {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      if (stored.kind === "absent") {
        if (!clearPendingShareIntent()) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("none");
        return;
      }
      if (!stored.board) {
        guestSnapshotRawRef.current = stored.raw;
        handoffYearRef.current = year;
        handoffSeasonRef.current = nextSeason;
        setHandoffErrorKind("load");
        setAuthReturnPhase("handoff-error");
        return;
      }
      if (isCanonicalGeneratedDefaultBoard(stored.board)) {
        if (!clearPendingShareIntent()) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("none");
        return;
      }

      const frozen = cloneBoardState(stored.board);
      guestSnapshotRawRef.current = stored.raw;
      handoffYearRef.current = year;
      handoffSeasonRef.current = nextSeason;
      handoffLocalRef.current = frozen;
      setBoard(frozen);

      try {
        const payload = await fetchSeasonalAnimeClient(year, nextSeason);
        if (!isHandoffGenerationCurrent(generation)) {
          return;
        }
        const nextItems = payload.items;
        if (nextItems.length > 0) {
          handoffItemsRef.current = nextItems;
          setItems(nextItems);
          setWarning(payload.warning ?? payload.enrichWarning ?? null);
          setBoard(reconcileBoard(frozen, nextItems, year, nextSeason));
        } else {
          handoffItemsRef.current = items;
        }
      } catch {
        if (!isHandoffGenerationCurrent(generation)) {
          return;
        }
        handoffItemsRef.current = items;
      }

      if (!isHandoffGenerationCurrent(generation)) {
        return;
      }

      await compareAndContinueShareHandoff(generation);
    }

    void runAuthReturnGuard();

    return () => {
      bumpHandoffGeneration();
    };
  }, [authStatus]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== SHARE_HANDOFF_RECOVERY_KEY) {
        return;
      }
      const held = readShareHandoffRecoveryDurable();
      if (held.kind === "unreadable" || held.kind === "malformed") {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      if (held.kind !== "ok") {
        return;
      }
      const marker = held.value;
      if (recoveryMarkerAgeExpired(marker)) {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-expired");
        setAuthReturnPhase("recovery");
        return;
      }
      if (
        !isRecoveryMarkerOwnedBy(
          marker,
          handoffOwnerTabIdRef.current,
          recoveryAttemptIdRef.current
        ) &&
        !recoveryMarkerAgeExpired(marker) &&
        !recoveryLeaseExpired(marker)
      ) {
        shareInFlightRef.current = true;
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-other-tab");
        setAuthReturnPhase("recovery");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (authReturnPhase !== "sharing") {
      return;
    }
    const timer = window.setInterval(() => {
      const shareBoard = handoffShareBoardRef.current ?? handoffLocalRef.current;
      if (!shareBoard || !handoffPostIssuedRef.current) {
        return;
      }
      persistHandoffRecoveryMarker({
        shareBoard,
        putStatus: recoveryPutStatusRef.current,
        postState: "post_started_unknown"
      });
    }, Math.max(3_000, Math.floor(SHARE_HANDOFF_LEASE_MS / 3)));
    return () => window.clearInterval(timer);
  }, [authReturnPhase]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatusMap({});
      setStatusLoadState("idle");
      return;
    }

    // Wait for auth-return decision; while guarded, never automatic statuses GET.
    if (!authReturnReady || protectLocalBoardRef.current) {
      return;
    }

    let cancelled = false;
    setStatusLoadState("loading");

    fetch("/api/statuses", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("視聴ステータスの取得に失敗しました。");
        }
        return response.json() as Promise<StatusApiResponse>;
      })
      .then((payload: StatusApiResponse) => {
        if (cancelled) {
          return;
        }

        const nextStatuses: Record<string, ViewingStatus> = {};
        for (const record of payload.statuses ?? []) {
          nextStatuses[record.animeId] = record.status;
        }
        setStatusMap(nextStatuses);
        setStatusLoadState("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        // Keep board editing available: status failure stays on the queue surface.
        setStatusLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [authReturnReady, authReturnPhase, isAuthenticated, statusReloadToken]);

  useEffect(() => {
    setLastQueuePlacement(null);
  }, [season, seasonYear]);

  useEffect(() => {
    if (!board) {
      return;
    }

    // Freeze original guest snapshot: do not persist reconcile/display mutations
    // while a pending share handoff or unresolved recovery marker owns the local copy.
    if (
      protectLocalBoardRef.current ||
      isAuthReturnPhaseLocked(authReturnPhaseRef.current) ||
      hasUnresolvedShareHandoffRecoveryMarker()
    ) {
      setSaveState("local");
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(board));

    if (!isAuthenticated) {
      setSaveState("local");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (
        protectLocalBoardRef.current ||
        hasUnresolvedShareHandoffRecoveryMarker()
      ) {
        setSaveState("local");
        return;
      }
      setSaveState("saving");
      setSaveSuccessVisible(false);
      if (saveSuccessTimeoutRef.current !== null) {
        window.clearTimeout(saveSuccessTimeoutRef.current);
        saveSuccessTimeoutRef.current = null;
      }
      void saveRemoteBoard(board, controller.signal)
        .then(() => {
          setSaveState("saved");
          setSaveSuccessVisible(true);
          saveSuccessTimeoutRef.current = window.setTimeout(() => {
            setSaveSuccessVisible(false);
            saveSuccessTimeoutRef.current = null;
          }, 2000);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSaveState("error");
          }
        });
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [board, isAuthenticated, storageKey]);

  async function handleRetrySave() {
    // Phase lock first: pending|evaluating must never remote-PUT, including retry.
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }
    // Protected / local-only guard: keep guest board offline until explicit Share success.
    if (
      !board ||
      retryingSave ||
      protectLocalBoardRef.current ||
      hasUnresolvedShareHandoffRecoveryMarker()
    ) {
      return;
    }

    setRetryingSave(true);
    setSaveState("saving");

    try {
      await saveRemoteBoard(board, new AbortController().signal);
      setSaveState("saved");
      setSaveSuccessVisible(true);
      if (saveSuccessTimeoutRef.current !== null) {
        window.clearTimeout(saveSuccessTimeoutRef.current);
      }
      saveSuccessTimeoutRef.current = window.setTimeout(() => {
        setSaveSuccessVisible(false);
        saveSuccessTimeoutRef.current = null;
      }, 2000);
    } catch {
      setSaveState("error");
    } finally {
      setRetryingSave(false);
    }
  }

  function updateBoard(updater: (current: BoardState) => BoardState) {
    // Lock layout mutations until auth-return decision completes.
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    setBoard((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);

      if (next === current) {
        return current;
      }

      return {
        ...next,
        updatedAt: new Date().toISOString()
      };
    });
  }

  function handleDragStart(event: DragStartEvent) {
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    const activeId = String(event.active.id);

    dragOriginTierIdRef.current = board
      ? findTierIdByItemId(board.tiers, activeId)
      : null;
    setActiveItemId(activeId);
  }

  function handleDragOver(event: DragOverEvent) {
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId) {
      return;
    }

    updateBoard((current) => {
      const fromTierId = findTierIdByItemId(current.tiers, activeId);
      const toTierId = getTierIdFromDroppable(current.tiers, overId);

      if (!fromTierId || !toTierId || fromTierId === toTierId) {
        return current;
      }

      return moveItemBetweenTiers(current, activeId, overId);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      setActiveItemId(null);
      dragOriginTierIdRef.current = null;
      return;
    }

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const originTierId = dragOriginTierIdRef.current;

    dismissMoveHint();
    setActiveItemId(null);
    dragOriginTierIdRef.current = null;

    if (!overId || !board) {
      return;
    }

    let movedToTierId: string | null = null;

    updateBoard((current) => {
      const currentTierId = findTierIdByItemId(current.tiers, activeId);

      if (originTierId && currentTierId && originTierId !== currentTierId) {
        movedToTierId = currentTierId;
        return current;
      }

      const next = moveItemBetweenTiers(current, activeId, overId);
      const nextTierId = findTierIdByItemId(next.tiers, activeId);

      if (originTierId && nextTierId && nextTierId !== originTierId) {
        movedToTierId = nextTierId;
      }

      return next;
    });

    if (movedToTierId) {
      const item = itemMap.get(activeId);
      const tier = board.tiers.find((candidate) => candidate.id === movedToTierId);

      if (item && tier) {
        announceMove(item.title, tier.label);
      }
    }
  }

  function handleRenameTier(tierId: string, label: string) {
    updateBoard((current) => ({
      ...current,
      tiers: current.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, label } : tier
      )
    }));
  }

  function handleColorTier(tierId: string, color: string) {
    updateBoard((current) => ({
      ...current,
      tiers: current.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, color } : tier
      )
    }));
  }

  function handleAddTier() {
    updateBoard((current) => {
      const existingCustomCount = current.tiers.filter((tier) =>
        tier.id.startsWith("tier-custom-")
      ).length;
      const newTier: TierRow = {
        id: `tier-custom-${Date.now()}`,
        label: `新規${existingCustomCount + 1}`,
        color: nextTierColors[existingCustomCount % nextTierColors.length],
        itemIds: []
      };
      const unranked = current.tiers.find((tier) => tier.id === UNRANKED_TIER_ID);
      const ranked = current.tiers.filter((tier) => tier.id !== UNRANKED_TIER_ID);

      return {
        ...current,
        tiers: unranked ? [...ranked, newTier, unranked] : [...ranked, newTier]
      };
    });
  }

  function handleDeleteTier(tierId: string) {
    updateBoard((current) => {
      const target = current.tiers.find((tier) => tier.id === tierId);

      if (!target || target.locked) {
        return current;
      }

      return {
        ...current,
        tiers: current.tiers
          .filter((tier) => tier.id !== tierId)
          .map((tier) =>
            tier.id === UNRANKED_TIER_ID
              ? { ...tier, itemIds: [...tier.itemIds, ...target.itemIds] }
              : tier
          )
      };
    });
  }

  function handleMoveItemToTier(itemId: string, targetTierId: string) {
    let moved = false;

    updateBoard((current) => {
      const sourceTierId = findTierIdByItemId(current.tiers, itemId);

      if (!sourceTierId || !isTierId(current.tiers, targetTierId)) {
        return current;
      }

      if (sourceTierId === targetTierId) {
        return current;
      }

      moved = true;

      return {
        ...current,
        tiers: current.tiers.map((tier) => {
          if (tier.id === sourceTierId) {
            return {
              ...tier,
              itemIds: tier.itemIds.filter((id) => id !== itemId)
            };
          }

          if (tier.id === targetTierId) {
            return {
              ...tier,
              itemIds: [...tier.itemIds, itemId]
            };
          }

          return tier;
        })
      };
    });

    if (moved) {
      const item = itemMap.get(itemId);
      const tier = board?.tiers.find((candidate) => candidate.id === targetTierId);

      if (item && tier) {
        announceMove(item.title, tier.label);
      }
    }

    setMoveMenuItemId(null);
  }

  function handleQueueDefer() {
    if (!ratingQueueCurrentId || isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }
    setDeferredRatingIds((current) => {
      const next = new Set(current);
      next.add(ratingQueueCurrentId);
      return next;
    });
  }

  function handleQueuePlace(targetTierId: string) {
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }
    const itemId = ratingQueueCurrentId;
    if (!itemId || !board) {
      return;
    }
    const sourceTierId = findTierIdByItemId(board.tiers, itemId);
    if (
      !sourceTierId ||
      sourceTierId === targetTierId ||
      !isTierId(board.tiers, targetTierId)
    ) {
      return;
    }
    const fromIndex =
      board.tiers.find((tier) => tier.id === sourceTierId)?.itemIds.indexOf(itemId) ??
      -1;
    if (fromIndex < 0) {
      return;
    }

    setLastQueuePlacement({
      itemId,
      fromTierId: sourceTierId,
      fromIndex
    });
    updateBoard((current) => {
      const nextTiers = placeItemOnTierOnce(current.tiers, itemId, targetTierId);
      if (nextTiers === current.tiers) {
        return current;
      }
      return {
        ...current,
        tiers: nextTiers
      };
    });

    const item = ratingQueueItemMap.get(itemId);
    const tier = board.tiers.find((candidate) => candidate.id === targetTierId);
    if (item && tier) {
      announceMove(item.title, tier.label);
    }
  }

  function handleQueueUndo() {
    if (!lastQueuePlacement || isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }
    const snapshot = lastQueuePlacement;
    setLastQueuePlacement(null);

    updateBoard((current) => {
      const nextTiers = restoreItemToExactPosition(current.tiers, snapshot);
      if (nextTiers === current.tiers) {
        return current;
      }
      return {
        ...current,
        tiers: nextTiers
      };
    });

    const item = ratingQueueItemMap.get(snapshot.itemId);
    const tier = board?.tiers.find((candidate) => candidate.id === snapshot.fromTierId);
    if (item && tier) {
      announceMove(item.title, tier.label);
    }
  }

  async function handleStatusChange(item: AnimeItem, status: ViewingStatus | null) {
    // Phase lock first: pending|evaluating must never write viewing status remotely/locally.
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    if (!isAuthenticated) {
      setLoginPrompt("status");
      return;
    }

    setStatusMap((current) => {
      if (status) {
        return {
          ...current,
          [item.id]: status
        };
      }

      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const response = status
        ? await fetch("/api/statuses", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ animeId: item.id, status, anime: item })
          })
        : await fetch(`/api/statuses?animeId=${encodeURIComponent(item.id)}`, {
            method: "DELETE"
          });

      if (!response.ok) {
        throw new Error("視聴ステータスの保存に失敗しました。");
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError));
    }
  }

  function handleReset() {
    if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }
    localStorage.removeItem(storageKey);
    setBoard(createDefaultBoard(seasonYear, season, items));
  }

  function handleAutoPublicTier() {
    if (!items.length || isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    updateBoard((current) => {
      const rankedTargetTiers = current.tiers
        .filter((tier) => tier.id !== UNRANKED_TIER_ID)
        .slice(0, 5);

      if (!rankedTargetTiers.length) {
        return current;
      }

      const sortedItemIds = [...items]
        .sort(compareByPublicReputation)
        .map((item) => item.id);
      const assignments = new Map<string, string[]>(
        rankedTargetTiers.map((tier) => [tier.id, []])
      );

      sortedItemIds.forEach((itemId, index) => {
        const targetTier = rankedTargetTiers[
          getPublicTierIndex(index, sortedItemIds.length, rankedTargetTiers.length)
        ];
        assignments.get(targetTier.id)?.push(itemId);
      });

      return {
        ...current,
        tiers: current.tiers.map((tier) => ({
          ...tier,
          itemIds: assignments.get(tier.id) ?? []
        }))
      };
    });
  }

  function bumpHandoffGeneration(): number {
    // Generation invalidation must not reset shareInFlightRef; only the owning
    // POST attempt clears it after token equality. Do not abort an issued POST.
    if (!handoffPostIssuedRef.current) {
      handoffAbortRef.current?.abort();
      const controller = new AbortController();
      handoffAbortRef.current = controller;
      handoffBusyRef.current = false;
      handoffActionLockRef.current = false;
    }
    handoffGenerationRef.current += 1;
    return handoffGenerationRef.current;
  }

  function isHandoffGenerationCurrent(generation: number): boolean {
    return handoffGenerationRef.current === generation;
  }

  function handoffSignal(): AbortSignal {
    const hooks = window as unknown as AuthReturnWindowHooks;
    if (hooks.__ATB692_IGNORE_HANDOFF_ABORT__) {
      return new AbortController().signal;
    }
    return handoffAbortRef.current?.signal ?? new AbortController().signal;
  }

  function ensureHandoffAttemptId(): boolean {
    if (recoveryAttemptIdRef.current != null) {
      return true;
    }
    const created = createHandoffAttemptId();
    if (created == null) {
      return false;
    }
    recoveryAttemptIdRef.current = created;
    recoveryPutStatusRef.current = "none";
    return true;
  }

  function tryBeginHandoffUserAction(): boolean {
    if (handoffActionLockRef.current) {
      return false;
    }
    if (shareInFlightRef.current) {
      return false;
    }
    if (handoffPostIssuedRef.current) {
      return false;
    }
    if (handoffBusyRef.current) {
      return false;
    }
    if (handoffCancelledRef.current) {
      return false;
    }
    handoffActionLockRef.current = true;
    return true;
  }

  function restoreGuestSnapshotToStorage(): boolean {
    const year = handoffYearRef.current;
    const nextSeason = handoffSeasonRef.current;
    const raw = guestSnapshotRawRef.current;
    if (year == null || nextSeason == null || raw == null) {
      return false;
    }
    const key = getStorageKey(year, nextSeason);
    if (!writeLocalStorageRaw(key, raw)) {
      return false;
    }
    const parsed = parseBoardMatchingContext(raw, year, nextSeason);
    if (!parsed) {
      return false;
    }
    setBoard(parsed);
    return true;
  }

  function persistHandoffRecoveryMarker(input: {
    shareBoard: BoardState;
    putStatus: ShareHandoffPutStatus;
    postState: ShareHandoffPostState;
  }): boolean {
    const year = handoffYearRef.current;
    const nextSeason = handoffSeasonRef.current;
    const guestRaw = guestSnapshotRawRef.current;
    const ownerTabId = handoffOwnerTabIdRef.current;
    const attemptId = recoveryAttemptIdRef.current;
    if (
      year == null ||
      nextSeason == null ||
      guestRaw == null ||
      ownerTabId == null ||
      attemptId == null
    ) {
      return false;
    }
    if (
      parseBoardMatchingContext(guestRaw, year, nextSeason) == null ||
      !remoteBoardMatchesHandoffContext(input.shareBoard, year, nextSeason)
    ) {
      return false;
    }
    const chosenBoardRaw = JSON.stringify(input.shareBoard);
    recoveryPutStatusRef.current = input.putStatus;
    const existing = readShareHandoffRecoveryDurable();
    const createdAt =
      existing.kind === "ok" && existing.value.attemptId === attemptId
        ? existing.value.createdAt
        : new Date().toISOString();
    const marker: ShareHandoffRecoveryMarker = {
      version: SHARE_HANDOFF_RECOVERY_VERSION,
      year,
      season: nextSeason,
      storageKey: getStorageKey(year, nextSeason),
      attemptId,
      guestRaw,
      chosenBoardRaw,
      chosenBoardHash: hashShareHandoffBoardRaw(chosenBoardRaw),
      createdAt,
      putStatus: input.putStatus,
      postState: input.postState,
      ownerTabId,
      leaseExpiresAt: new Date(Date.now() + SHARE_HANDOFF_LEASE_MS).toISOString()
    };
    if (!casWriteShareHandoffRecoveryMarker(marker)) {
      return false;
    }
    return true;
  }

  function finishCompletedShareCleanup(marker: ShareHandoffRecoveryMarker): boolean {
    const chosen = parseBoardMatchingContext(
      marker.chosenBoardRaw,
      marker.year,
      marker.season
    );
    if (!chosen) {
      return false;
    }
    if (!writeLocalStorageRaw(marker.storageKey, marker.chosenBoardRaw)) {
      return false;
    }
    setBoard(chosen);
    return clearDurableRecoveryRecords();
  }

  async function applyUnresolvedShareHandoffRecovery(generation: number): Promise<boolean> {
    const markerRead = readShareHandoffRecoveryDurable();

    if (markerRead.kind === "unreadable") {
      protectLocalBoardRef.current = true;
      if (isHandoffGenerationCurrent(generation)) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
      }
      return true;
    }
    if (markerRead.kind === "malformed") {
      protectLocalBoardRef.current = true;
      if (isHandoffGenerationCurrent(generation)) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
      }
      return true;
    }
    if (markerRead.kind !== "ok") {
      return false;
    }

    const marker = markerRead.value;
    const pendingIntentRead = readPendingShareIntentRaw();
    if (pendingIntentRead.kind === "unreadable") {
      protectLocalBoardRef.current = true;
      if (isHandoffGenerationCurrent(generation)) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
      }
      return true;
    }
    if (recoveryAttemptIdRef.current == null) {
      if (pendingIntentRead.kind === "ok") {
        if (!ensureHandoffAttemptId()) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return true;
        }
      } else {
        // A reload with a consumed intent resumes the durable attempt. A tab
        // that still has its own pending intent must use a fresh nonce.
        recoveryAttemptIdRef.current = marker.attemptId;
      }
    }
    const guestBoard = parseBoardMatchingContext(
      marker.guestRaw,
      marker.year,
      marker.season
    );
    const chosenBoard = parseBoardMatchingContext(
      marker.chosenBoardRaw,
      marker.year,
      marker.season
    );
    guestSnapshotRawRef.current = marker.guestRaw;
    handoffYearRef.current = marker.year;
    handoffSeasonRef.current = marker.season;
    recoveryPutStatusRef.current = marker.putStatus;
    if (guestBoard) {
      handoffLocalRef.current = guestBoard;
      setBoard(guestBoard);
    }
    if (chosenBoard) {
      handoffShareBoardRef.current = chosenBoard;
    }
    protectLocalBoardRef.current = true;
    setSeasonYear(marker.year);
    setSeason(marker.season);
    if (!isHandoffGenerationCurrent(generation)) {
      return true;
    }

    // TTL is authoritative. A stale marker must not be retained merely because
    // an untrusted/future lease would otherwise appear to hold ownership.
    if (recoveryMarkerAgeExpired(marker)) {
      setHandoffErrorKind("recovery-expired");
      setAuthReturnPhase("recovery");
      return true;
    }

    if (handoffOwnerTabIdRef.current == null) {
      setHandoffErrorKind("recovery-unreadable");
      setAuthReturnPhase("recovery");
      return true;
    }

    const ours = isRecoveryMarkerOwnedBy(
      marker,
      handoffOwnerTabIdRef.current,
      recoveryAttemptIdRef.current
    );
    const leaseDead = recoveryLeaseExpired(marker);

    if (marker.postState === "post_completed_cleanup_pending") {
      if (!ours && !leaseDead) {
        setHandoffErrorKind("recovery-other-tab");
        setAuthReturnPhase("recovery");
        return true;
      }
      if (finishCompletedShareCleanup(marker)) {
        protectLocalBoardRef.current = false;
        recoveryAttemptIdRef.current = null;
        setAuthReturnPhase("none");
        setHandoffErrorKind(null);
        return true;
      }
      setHandoffErrorKind("recovery-unknown");
      setAuthReturnPhase("recovery");
      return true;
    }
    if (!ours && !leaseDead) {
      setHandoffErrorKind("recovery-other-tab");
      setAuthReturnPhase("recovery");
      return true;
    }

    if (!ours && leaseDead && chosenBoard) {
      let takeoverPersisted = false;
      const takeoverAttemptId = createHandoffAttemptId();
      if (takeoverAttemptId == null) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return true;
      }
      recoveryAttemptIdRef.current = takeoverAttemptId;
      const takeoverLockAcquired = await withShareHandoffLock(async () => {
        takeoverPersisted = persistHandoffRecoveryMarker({
          shareBoard: chosenBoard,
          putStatus: marker.putStatus,
          postState: marker.postState
        });
      });
      if (!takeoverLockAcquired || !takeoverPersisted) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return true;
      }
    }

    if (marker.postState === "post_failed_definite") {
      setHandoffErrorKind("share");
      setAuthReturnPhase("handoff-error");
      return true;
    }
    setHandoffErrorKind("recovery-unknown");
    setAuthReturnPhase("recovery");
    return true;
  }

  async function compareAndContinueShareHandoff(generation: number) {
    const year = handoffYearRef.current;
    const nextSeason = handoffSeasonRef.current;
    const localBoard = handoffLocalRef.current;
    if (year == null || nextSeason == null || !localBoard) {
      return;
    }

    setHandoffErrorKind(null);
    setAuthReturnPhase("evaluating");

    const remoteResult = await fetchRemoteBoardForHandoff(
      year,
      nextSeason,
      handoffSignal()
    );
    if (!isHandoffGenerationCurrent(generation) || handoffCancelledRef.current) {
      handoffActionLockRef.current = false;
      return;
    }
    if (!remoteResult.ok) {
      if (remoteResult.reason === "aborted") {
        handoffActionLockRef.current = false;
        return;
      }
      setHandoffErrorKind(remoteResult.reason === "context" ? "context" : "load");
      setAuthReturnPhase("handoff-error");
      handoffActionLockRef.current = false;
      return;
    }

    handoffRemoteRef.current = remoteResult.board;

    if (!remoteResult.board) {
      await putLocalThenShare(generation, null);
      return;
    }

    if (boardsEquivalentForHandoff(localBoard, remoteResult.board)) {
      await postShareFromHandoff(generation, localBoard);
      return;
    }

    setAuthReturnPhase("conflict");
    handoffActionLockRef.current = false;
  }

  async function putLocalThenShare(
    generation: number,
    expectedUpdatedAt: string | null
  ) {
    const localBoard = handoffLocalRef.current;
    if (!localBoard || !isHandoffGenerationCurrent(generation)) {
      handoffActionLockRef.current = false;
      return;
    }
    if (shareInFlightRef.current || handoffPostIssuedRef.current || handoffCancelledRef.current) {
      handoffActionLockRef.current = false;
      return;
    }
    if (handoffBusyRef.current) {
      return;
    }

    handoffBusyRef.current = true;
    handoffActionLockRef.current = true;
    setHandoffBusy(true);
    let ownershipPersisted = false;
    const ownershipLockAcquired = await withShareHandoffLock(async () => {
      ownershipPersisted = persistHandoffRecoveryMarker({
        shareBoard: localBoard,
        putStatus: "unknown",
        postState: "not_started"
      });
    });
    if (!ownershipLockAcquired || !ownershipPersisted) {
      handoffBusyRef.current = false;
      handoffActionLockRef.current = false;
      setHandoffBusy(false);
      protectLocalBoardRef.current = true;
      setHandoffErrorKind("recovery-unreadable");
      setAuthReturnPhase("recovery");
      return;
    }
    try {
      const result = await putRemoteBoardForHandoff(
        localBoard,
        expectedUpdatedAt,
        handoffSignal()
      );
      if (
        !isHandoffGenerationCurrent(generation) ||
        handoffCancelledRef.current
      ) {
        return;
      }
      if (result === "aborted") {
        return;
      }
      if (result === "unknown") {
        recoveryPutStatusRef.current = "unknown";
        let unknownPersisted = false;
        const unknownLockAcquired = await withShareHandoffLock(async () => {
          unknownPersisted = persistHandoffRecoveryMarker({
            shareBoard: localBoard,
            putStatus: "unknown",
            postState: "not_started"
          });
        });
        if (!unknownLockAcquired || !unknownPersisted) {
          protectLocalBoardRef.current = true;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        const restored = restoreGuestSnapshotToStorage();
        if (!restored) {
          setHandoffErrorKind("restore-failed");
        } else {
          setHandoffErrorKind("recovery-unknown");
        }
        setAuthReturnPhase("recovery");
        return;
      }
      if (result === "definite_failure") {
        clearDurableRecoveryRecords();
        recoveryPutStatusRef.current = "none";
        setHandoffErrorKind("save");
        setAuthReturnPhase("handoff-error");
        return;
      }
      if (result === "conflict") {
        const year = handoffYearRef.current;
        const nextSeason = handoffSeasonRef.current;
        if (year != null && nextSeason != null) {
          const fresh = await fetchRemoteBoardForHandoff(
            year,
            nextSeason,
            handoffSignal()
          );
          if (
            !isHandoffGenerationCurrent(generation) ||
            handoffCancelledRef.current
          ) {
            return;
          }
          if (!fresh.ok) {
            if (fresh.reason === "aborted") {
              return;
            }
            setHandoffErrorKind(fresh.reason === "context" ? "context" : "load");
            setAuthReturnPhase("handoff-error");
            return;
          }
          handoffRemoteRef.current = fresh.board;
        }
        clearDurableRecoveryRecords();
        setAuthReturnPhase("conflict");
        return;
      }
      recoveryPutStatusRef.current = "completed";
      let completedMarkerPersisted = false;
      const completedMarkerLockAcquired = await withShareHandoffLock(async () => {
        completedMarkerPersisted = persistHandoffRecoveryMarker({
          shareBoard: localBoard,
          putStatus: "completed",
          postState: "not_started"
        });
      });
      if (!completedMarkerLockAcquired || !completedMarkerPersisted) {
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      await postShareFromHandoff(generation, localBoard);
    } catch {
      if (!isHandoffGenerationCurrent(generation) || handoffCancelledRef.current) {
        return;
      }
      recoveryPutStatusRef.current = "unknown";
      let unknownPersisted = false;
      const unknownLockAcquired = await withShareHandoffLock(async () => {
        unknownPersisted = persistHandoffRecoveryMarker({
          shareBoard: localBoard,
          putStatus: "unknown",
          postState: "not_started"
        });
      });
      if (!unknownLockAcquired || !unknownPersisted) {
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      const restored = restoreGuestSnapshotToStorage();
      setHandoffErrorKind(restored ? "recovery-unknown" : "restore-failed");
      setAuthReturnPhase("recovery");
    } finally {
      if (isHandoffGenerationCurrent(generation) && !handoffPostIssuedRef.current) {
        handoffBusyRef.current = false;
        handoffActionLockRef.current = false;
        setHandoffBusy(false);
      }
    }
  }

  async function postShareFromHandoff(generation: number, shareBoard: BoardState) {
    if (!isHandoffGenerationCurrent(generation)) {
      return;
    }
    if (handoffCancelledRef.current) {
      return;
    }
    if (shareInFlightRef.current || handoffPostIssuedRef.current) {
      return;
    }

    shareInFlightRef.current = true;
    const shareToken = shareAttemptTokenRef.current + 1;
    shareAttemptTokenRef.current = shareToken;
    handoffShareBoardRef.current = shareBoard;
    handoffActionLockRef.current = true;

    const lockAcquired = await withShareHandoffLock(async () => {
      await performHandoffPost(generation, shareBoard);
    });
    if (!lockAcquired && isHandoffGenerationCurrent(generation)) {
      handoffPostIssuedRef.current = false;
      protectLocalBoardRef.current = true;
      setHandoffErrorKind("recovery-other-tab");
      setAuthReturnPhase("recovery");
    }

    if (shareAttemptTokenRef.current === shareToken) {
      shareInFlightRef.current = false;
    }
    if (isHandoffGenerationCurrent(generation)) {
      setSharing(false);
      setHandoffBusy(false);
      handoffBusyRef.current = false;
      handoffActionLockRef.current = false;
    }
  }

  async function performHandoffPost(generation: number, shareBoard: BoardState) {
    const markerWritten = persistHandoffRecoveryMarker({
      shareBoard,
      putStatus: recoveryPutStatusRef.current,
      postState: "post_started_unknown"
    });
    if (!markerWritten) {
      const held = readShareHandoffRecoveryDurable();
      const otherOwner =
        held.kind === "ok" &&
        !isRecoveryMarkerOwnedBy(
          held.value,
          handoffOwnerTabIdRef.current,
          recoveryAttemptIdRef.current
        ) &&
        !recoveryMarkerAgeExpired(held.value) &&
        !recoveryLeaseExpired(held.value);
      setHandoffErrorKind(otherOwner ? "recovery-other-tab" : "recovery-unreadable");
      setAuthReturnPhase("recovery");
      return;
    }

    if (!clearPendingShareIntent()) {
      protectLocalBoardRef.current = true;
      setHandoffErrorKind("recovery-unreadable");
      setAuthReturnPhase("recovery");
      return;
    }

    handoffPostIssuedRef.current = true;
    setSharing(true);
    setHandoffBusy(true);
    setAuthReturnPhase("sharing");
    setError(null);

    const shareItems =
      handoffItemsRef.current.length > 0 ? handoffItemsRef.current : items;

    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ board: shareBoard, items: shareItems })
      });
      let payload: ShareApiResponse = {};
      let jsonParsed = true;
      try {
        payload = (await response.json()) as ShareApiResponse;
      } catch {
        jsonParsed = false;
        payload = {};
      }

      const outcomeClass = classifySharePostResponse(response, payload, jsonParsed);
      if (outcomeClass !== "success") {
        const failureStatePersisted = persistHandoffRecoveryMarker({
          shareBoard,
          putStatus: recoveryPutStatusRef.current,
          postState:
            outcomeClass === "definite_failure"
              ? "post_failed_definite"
              : "post_started_unknown"
        });
        if (!failureStatePersisted) {
          protectLocalBoardRef.current = true;
          handoffPostIssuedRef.current = false;
          setHandoffErrorKind("recovery-unreadable");
          setAuthReturnPhase("recovery");
          return;
        }
        const restored = restoreGuestSnapshotToStorage();
        handoffPostIssuedRef.current = false;
        if (isHandoffGenerationCurrent(generation)) {
          if (!restored) {
            setHandoffErrorKind("restore-failed");
            setAuthReturnPhase("recovery");
          } else if (outcomeClass === "definite_failure") {
            setHandoffErrorKind("share");
            setAuthReturnPhase("handoff-error");
          } else {
            setHandoffErrorKind("recovery-unknown");
            setAuthReturnPhase("recovery");
          }
        }
        return;
      }

      const cleanupPendingWritten = persistHandoffRecoveryMarker({
        shareBoard,
        putStatus: recoveryPutStatusRef.current,
        postState: "post_completed_cleanup_pending"
      });
      if (!cleanupPendingWritten) {
        handoffPostIssuedRef.current = false;
        protectLocalBoardRef.current = true;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }

      const year = handoffYearRef.current;
      const nextSeason = handoffSeasonRef.current;
      const chosenRaw = JSON.stringify(shareBoard);
      const boardWritten =
        year != null &&
        nextSeason != null &&
        writeLocalStorageRaw(getStorageKey(year, nextSeason), chosenRaw);
      if (!boardWritten) {
        handoffPostIssuedRef.current = false;
        protectLocalBoardRef.current = true;
        if (isHandoffGenerationCurrent(generation)) {
          setHandoffErrorKind("recovery-unknown");
          setAuthReturnPhase("recovery");
        }
        return;
      }
      setBoard(shareBoard);

      track({ name: "tier_share_create" });
      const nextShareUrl = `${window.location.origin}/share/${payload.shareId}`;
      setShareUrl(nextShareUrl);
      const outcome = await shareOrCopyUrl({
        url: nextShareUrl,
        title: "今期アニメTier表",
        text: "私の今期アニメTier表をシェアします"
      });
      if (isHandoffGenerationCurrent(generation)) {
        setShareOutcome(outcome);
        if (outcome === "copied") {
          if (copyConfirmTimeoutRef.current !== null) {
            window.clearTimeout(copyConfirmTimeoutRef.current);
          }
          setCopyConfirm(true);
          copyConfirmTimeoutRef.current = window.setTimeout(() => {
            setCopyConfirm(false);
            copyConfirmTimeoutRef.current = null;
          }, 2000);
        }
      }

      if (clearDurableRecoveryRecords()) {
        recoveryAttemptIdRef.current = null;
        protectLocalBoardRef.current = false;
        handoffPostIssuedRef.current = false;
        if (isHandoffGenerationCurrent(generation)) {
          setAuthReturnPhase("none");
          setHandoffErrorKind(null);
        }
        return;
      }

      handoffPostIssuedRef.current = false;
      protectLocalBoardRef.current = true;
      if (isHandoffGenerationCurrent(generation)) {
        setHandoffErrorKind("recovery-unknown");
        setAuthReturnPhase("recovery");
      }
    } catch {
      const unknownStatePersisted = persistHandoffRecoveryMarker({
        shareBoard,
        putStatus: recoveryPutStatusRef.current,
        postState: "post_started_unknown"
      });
      if (!unknownStatePersisted) {
        protectLocalBoardRef.current = true;
        handoffPostIssuedRef.current = false;
        setHandoffErrorKind("recovery-unreadable");
        setAuthReturnPhase("recovery");
        return;
      }
      const restored = restoreGuestSnapshotToStorage();
      handoffPostIssuedRef.current = false;
      setHandoffErrorKind(restored ? "recovery-unknown" : "restore-failed");
      setAuthReturnPhase("recovery");
    }
  }

  function cancelShareHandoff() {
    if (handoffPostIssuedRef.current || authReturnPhaseRef.current === "sharing") {
      return;
    }
    const existing = readShareHandoffRecoveryDurable();
    if (existing.kind === "ok") {
      const marker = existing.value;
      if (
        !isRecoveryMarkerOwnedBy(
          marker,
          handoffOwnerTabIdRef.current,
          recoveryAttemptIdRef.current
        ) &&
        !recoveryMarkerAgeExpired(marker) &&
        !recoveryLeaseExpired(marker)
      ) {
        setHandoffErrorKind("recovery-other-tab");
        setAuthReturnPhase("recovery");
        protectLocalBoardRef.current = true;
        return;
      }
    }
    handoffCancelledRef.current = true;
    bumpHandoffGeneration();
    if (!restoreGuestSnapshotToStorage()) {
      protectLocalBoardRef.current = true;
      handoffPostIssuedRef.current = false;
      setSharing(false);
      setHandoffBusy(false);
      setHandoffErrorKind("restore-failed");
      setAuthReturnPhase("recovery");
      return;
    }
    if (!clearPendingShareIntent()) {
      protectLocalBoardRef.current = true;
      handoffPostIssuedRef.current = false;
      setSharing(false);
      setHandoffBusy(false);
      setHandoffErrorKind("restore-failed");
      setAuthReturnPhase("recovery");
      return;
    }
    if (!clearDurableRecoveryRecords()) {
      protectLocalBoardRef.current = true;
      handoffPostIssuedRef.current = false;
      setSharing(false);
      setHandoffBusy(false);
      setHandoffErrorKind("restore-failed");
      setAuthReturnPhase("recovery");
      return;
    }
    protectLocalBoardRef.current = true;
    handoffPostIssuedRef.current = false;
    recoveryAttemptIdRef.current = null;
    recoveryPutStatusRef.current = "none";
    setSharing(false);
    setHandoffBusy(false);
    setAuthReturnPhase("none");
    setHandoffErrorKind(null);
  }

  function abortHandoffWritesAndReturnToConflict() {
    if (handoffPostIssuedRef.current || authReturnPhaseRef.current === "sharing") {
      return;
    }
    handoffCancelledRef.current = true;
    bumpHandoffGeneration();
    setSharing(false);
    setHandoffBusy(false);
    handoffCancelledRef.current = false;
    setAuthReturnPhase("conflict");
  }

  function adoptRemoteThenShare() {
    if (!tryBeginHandoffUserAction()) {
      return;
    }
    const remote = handoffRemoteRef.current;
    const year = handoffYearRef.current;
    const nextSeason = handoffSeasonRef.current;
    if (!remote || year == null || nextSeason == null) {
      handoffActionLockRef.current = false;
      return;
    }
    if (!remoteBoardMatchesHandoffContext(remote, year, nextSeason)) {
      handoffActionLockRef.current = false;
      setHandoffErrorKind("context");
      setAuthReturnPhase("handoff-error");
      return;
    }

    const generation = handoffGenerationRef.current;
    const nextItems =
      handoffItemsRef.current.length > 0 ? handoffItemsRef.current : items;
    const adopted =
      nextItems.length > 0
        ? reconcileBoard(remote, nextItems, year, nextSeason)
        : remote;
    setBoard(adopted);
    recoveryPutStatusRef.current = "none";
    void postShareFromHandoff(generation, adopted);
  }

  function confirmReplaceLocalThenShare() {
    if (!tryBeginHandoffUserAction()) {
      return;
    }
    const remote = handoffRemoteRef.current;
    void putLocalThenShare(
      handoffGenerationRef.current,
      remote?.updatedAt ?? null
    );
  }

  function retryShareHandoff() {
    if (!tryBeginHandoffUserAction()) {
      return;
    }
    if (
      handoffErrorKind === "recovery-unknown" ||
      handoffErrorKind === "recovery-expired" ||
      handoffErrorKind === "recovery-unreadable" ||
      handoffErrorKind === "recovery-other-tab"
    ) {
      handoffActionLockRef.current = false;
      return;
    }
    if (handoffErrorKind === "restore-failed") {
      handoffActionLockRef.current = false;
      cancelShareHandoff();
      return;
    }
    const generation = handoffGenerationRef.current;
    if (handoffErrorKind === "share") {
      const shareBoard = handoffShareBoardRef.current ?? handoffLocalRef.current;
      if (!shareBoard) {
        handoffActionLockRef.current = false;
        return;
      }
      void postShareFromHandoff(generation, shareBoard);
      return;
    }
    if (handoffErrorKind === "save") {
      void putLocalThenShare(
        generation,
        handoffRemoteRef.current?.updatedAt ?? null
      );
      return;
    }
    void compareAndContinueShareHandoff(generation);
  }

  async function handleCreateShare() {
    if (shareInFlightRef.current) {
      return;
    }
    if (!board || !items.length || isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    if (!isAuthenticated) {
      setLoginPrompt("share");
      return;
    }

    shareInFlightRef.current = true;
    const shareToken = shareAttemptTokenRef.current + 1;
    shareAttemptTokenRef.current = shareToken;

    // Explicit Share only: consume pending intent and verify removal before POST.
    if (!clearPendingShareIntent()) {
      shareInFlightRef.current = false;
      setError(SHARE_CREATE_ERROR_MESSAGE);
      return;
    }

    setSharing(true);
    setError(null);

    // Capture the displayed local board for the POST body (never remote/PUT).
    const shareBoard = board;
    const shareItems = items;

    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ board: shareBoard, items: shareItems })
      });
      let payload: ShareApiResponse = {};
      try {
        payload = (await response.json()) as ShareApiResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.shareId) {
        throw new Error(SHARE_CREATE_ERROR_MESSAGE);
      }

      track({ name: "tier_share_create" });
      const nextShareUrl = `${window.location.origin}/share/${payload.shareId}`;
      setShareUrl(nextShareUrl);
      const outcome = await shareOrCopyUrl({
        url: nextShareUrl,
        title: "今期アニメTier表",
        text: "私の今期アニメTier表をシェアします"
      });
      setShareOutcome(outcome);

      if (outcome === "copied") {
        if (copyConfirmTimeoutRef.current !== null) {
          window.clearTimeout(copyConfirmTimeoutRef.current);
        }
        setCopyConfirm(true);
        copyConfirmTimeoutRef.current = window.setTimeout(() => {
          setCopyConfirm(false);
          copyConfirmTimeoutRef.current = null;
        }, 2000);
      }

      // Success only: leave guard. Failure keeps local board + guard (no remote GET/PUT).
      if (protectLocalBoardRef.current) {
        protectLocalBoardRef.current = false;
        setAuthReturnPhase("none");
      }
    } catch {
      // Fixed copy; local board unchanged; no automatic retry; stay guarded if still in guard.
      setError(SHARE_CREATE_ERROR_MESSAGE);
    } finally {
      if (shareAttemptTokenRef.current === shareToken) {
        shareInFlightRef.current = false;
      }
      setSharing(false);
    }
  }

  function handleGoogleLoginFromPrompt() {
    if (loginPrompt === "share") {
      const written = writePendingShareIntent({
        version: PENDING_SHARE_INTENT_VERSION,
        action: "share",
        year: seasonYear,
        season,
        createdAt: new Date().toISOString()
      });
      if (!written) {
        setError(PENDING_SHARE_INTENT_STORAGE_ERROR_MESSAGE);
        return;
      }
    }
    void signIn("google");
  }

  return (
    <div className={moveHintSeen ? "app-shell move-hint-seen" : "app-shell"}>
      {moveAnnouncement ? (
        <div className="tier-move-toast" role="status" aria-live="polite">
          {moveAnnouncement}
        </div>
      ) : null}
      <header className="topbar">
        <div className="title-block">
          <h1>今期アニメTier表</h1>
          <div className="status-line">
            {items.length}作品
            {isAuthenticated && saveState === "saving" ? (
              <span role="status" aria-live="polite">
                {" / 保存中..."}
              </span>
            ) : null}
            {isAuthenticated && saveState === "error" ? (
              <span className="save-error" role="alert">
                {" / 保存に失敗しました"}
                <button
                  type="button"
                  className="save-retry-button"
                  onClick={handleRetrySave}
                  disabled={retryingSave || isAuthReturnLocked}
                >
                  {retryingSave ? "再試行中..." : "再試行"}
                </button>
              </span>
            ) : null}
            {isAuthenticated && saveSuccessVisible ? (
              <span className="save-success-check" role="status" aria-live="polite">
                {" / "}
                <Check size={12} strokeWidth={3} aria-hidden="true" />
                保存済み
              </span>
            ) : null}
          </div>
        </div>

        <div className="control-bar">
          <div className="control-bar-season" aria-label="年と季節">
            <label className="field">
              <span>年</span>
              <select
                value={seasonYear}
                onChange={(event) => {
                  if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
                    return;
                  }
                  setSeasonYear(Number(event.target.value));
                }}
                disabled={isAuthReturnLocked}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>期</span>
              <select
                value={season}
                onChange={(event) => {
                  if (isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
                    return;
                  }
                  setSeason(event.target.value as AnimeSeason);
                }}
                disabled={isAuthReturnLocked}
              >
                {SEASONS.map((option) => (
                  <option key={option} value={option}>
                    {SEASON_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="control-bar-actions" aria-label="ツールバー操作">
            <button
              className="command-button"
              type="button"
              onClick={() => void loadAnime()}
              disabled={loading || isAuthReturnLocked}
              title="再取得"
            >
              {loading ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : (
                <RefreshCw size={18} aria-hidden="true" />
              )}
              <span>再取得</span>
            </button>

            <button
              className={copyConfirm ? "command-button copy-confirm" : "command-button"}
              type="button"
              onClick={() => void handleCreateShare()}
              disabled={
                !board || sharing || loading || !items.length || isAuthReturnLocked
              }
              title="共有URLを作成"
            >
              {sharing ? (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              ) : copyConfirm ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Share2 size={18} aria-hidden="true" />
              )}
              <span>{copyConfirm ? "コピーしました" : "共有"}</span>
            </button>

            <div className="toolbar-more-wrap">
              <button
                ref={toolbarMoreButtonRef}
                className="command-button"
                type="button"
                onClick={() => setToolbarMenuOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={toolbarMenuOpen}
                title="その他の操作"
              >
                <MoreHorizontal size={18} aria-hidden="true" />
                <span>その他</span>
              </button>

              {toolbarMenuOpen && (
                <>
                  <div
                    className="toolbar-more-backdrop"
                    onClick={() => setToolbarMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="toolbar-more-menu" aria-label="その他の操作">
                    <div className="toolbar-more-filters no-export" aria-label="表示フィルター">
                      <button
                        className={hideMovies ? "filter-chip is-active" : "filter-chip"}
                        type="button"
                        onClick={() => setHideMovies((current) => !current)}
                        aria-pressed={hideMovies}
                        title="映画を非表示"
                      >
                        映画OFF
                      </button>
                      <button
                        className={hideRerunCandidates ? "filter-chip is-active" : "filter-chip"}
                        type="button"
                        onClick={() => setHideRerunCandidates((current) => !current)}
                        aria-pressed={hideRerunCandidates}
                        title="旧作・再放送候補を非表示"
                      >
                        旧作OFF
                      </button>
                    </div>

                    <button
                      className="toolbar-more-item"
                      type="button"
                      onClick={() => {
                        setToolbarMenuOpen(false);
                        if (
                          window.confirm(
                            "現在の配置を人気順で上書きします。よろしいですか？"
                          )
                        ) {
                          handleAutoPublicTier();
                        }
                      }}
                      disabled={
                        !board || loading || !items.length || isAuthReturnLocked
                      }
                      title="人気順で自動的にTier配置"
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      <span>自動配置</span>
                    </button>

                    <button
                      className="toolbar-more-item"
                      type="button"
                      onClick={() => {
                        setToolbarMenuOpen(false);
                        if (
                          window.confirm(
                            "Tier表を最初からやり直しますか？この操作は取り消せません。"
                          )
                        ) {
                          handleReset();
                        }
                      }}
                      disabled={!board || isAuthReturnLocked}
                      title="Tier表をリセット"
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      <span>リセット</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {loginPrompt ? (
        <div
          className="tier-login-prompt"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tier-login-prompt-title"
        >
          <div className="tier-login-prompt-content">
            <strong id="tier-login-prompt-title">ログインが必要です</strong>
            <p>
              {loginPrompt === "status"
                ? "視聴ステータスを保存するにはログインしてください。Tier表の編集はログインなしで続けられます。"
                : SHARE_LOGIN_PROMPT_MESSAGE}
            </p>
          </div>
          <div className="tier-login-prompt-actions">
            <button
              className="command-button emphasis-button"
              type="button"
              onClick={handleGoogleLoginFromPrompt}
            >
              Googleでログイン
            </button>
            <button
              className="command-button"
              type="button"
              onClick={() => setLoginPrompt(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}

      {authReturnPhase === "conflict" ||
      authReturnPhase === "confirm-replace" ||
      authReturnPhase === "handoff-error" ||
      authReturnPhase === "sharing" ||
      authReturnPhase === "recovery" ? (
        <ShareHandoffDialog
          title={
            authReturnPhase === "sharing"
              ? HANDOFF_SHARING_STATUS_MESSAGE
              : authReturnPhase === "recovery"
                ? handoffErrorKind === "recovery-expired"
                  ? HANDOFF_RECOVERY_EXPIRED_MESSAGE
                  : handoffErrorKind === "recovery-unreadable"
                    ? HANDOFF_RECOVERY_UNREADABLE_MESSAGE
                    : handoffErrorKind === "restore-failed"
                      ? HANDOFF_RESTORE_FAILED_MESSAGE
                      : handoffErrorKind === "recovery-other-tab"
                        ? HANDOFF_RECOVERY_OTHER_TAB_MESSAGE
                        : HANDOFF_RECOVERY_UNKNOWN_MESSAGE
              : authReturnPhase === "handoff-error"
                ? handoffErrorKind === "share"
                  ? SHARE_CREATE_ERROR_MESSAGE
                  : handoffErrorKind === "context"
                    ? HANDOFF_REMOTE_CONTEXT_ERROR_MESSAGE
                    : HANDOFF_LOAD_ERROR_MESSAGE
                : authReturnPhase === "confirm-replace"
                  ? HANDOFF_REPLACE_CONFIRM_MESSAGE
                  : HANDOFF_CONFLICT_TITLE
          }
          alert={
            authReturnPhase === "handoff-error" || authReturnPhase === "recovery"
          }
          escapeLocked={authReturnPhase === "sharing"}
          onEscape={
            authReturnPhase === "sharing"
              ? () => undefined
              : authReturnPhase === "confirm-replace"
                ? abortHandoffWritesAndReturnToConflict
                : cancelShareHandoff
          }
        >
          {authReturnPhase === "conflict" ? (
            <>
              <button
                className="command-button emphasis-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={() => setAuthReturnPhase("confirm-replace")}
              >
                この端末のTier表を使う
              </button>
              <button
                className="command-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={() => adoptRemoteThenShare()}
              >
                アカウントのTier表を使う
              </button>
              <button
                className="command-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={cancelShareHandoff}
              >
                共有をやめる
              </button>
            </>
          ) : null}
          {authReturnPhase === "confirm-replace" ? (
            <>
              <button
                className="command-button emphasis-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={() => confirmReplaceLocalThenShare()}
              >
                置き換えて共有
              </button>
              <button
                className="command-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={abortHandoffWritesAndReturnToConflict}
              >
                戻る
              </button>
              <button
                className="command-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={cancelShareHandoff}
              >
                共有をやめる
              </button>
            </>
          ) : null}
          {authReturnPhase === "handoff-error" ? (
            <>
              <button
                className="command-button emphasis-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={() => retryShareHandoff()}
              >
                再試行
              </button>
              <button
                className="command-button"
                type="button"
                disabled={handoffActionsLocked}
                onClick={cancelShareHandoff}
              >
                共有をやめる
              </button>
            </>
          ) : null}
          {authReturnPhase === "recovery" ? (
            <>
              {handoffErrorKind === "restore-failed" ? (
                <button
                  className="command-button emphasis-button"
                  type="button"
                  disabled={handoffActionsLocked}
                  onClick={() => retryShareHandoff()}
                >
                  再試行
                </button>
              ) : null}
              {handoffErrorKind === "recovery-other-tab" ? null : (
                <button
                  className="command-button"
                  type="button"
                  disabled={handoffActionsLocked}
                  onClick={cancelShareHandoff}
                >
                  共有をやめる
                </button>
              )}
            </>
          ) : null}
        </ShareHandoffDialog>
      ) : null}

      <main className="app-main">
        {authReturnPhase === "evaluating" ? (
          <div className="notice" role="status" aria-live="polite">
            {AUTH_RETURN_STATUS_EVALUATING}
          </div>
        ) : null}
        {authReturnPhase === "sharing" ? (
          <div className="notice" role="status" aria-live="polite">
            {HANDOFF_SHARING_STATUS_MESSAGE}
          </div>
        ) : null}
        {authReturnPhase === "expired" ? (
          <div className="notice" role="status" aria-live="polite">
            {AUTH_RETURN_STATUS_EXPIRED}
          </div>
        ) : null}
        {warning ? (
          <div className="notice warning" role="status" aria-live="polite">
            {warning}
          </div>
        ) : null}
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
        {shareUrl ? (
          <div className="notice success" role="status" aria-live="polite">
            {shareOutcome === "copied" ? "共有URLをコピーしました:" : "共有URL:"}{" "}
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
              <span className="sr-only">（新しいタブで開きます）</span>
            </a>
          </div>
        ) : null}

        {isAuthenticated && !isAuthReturnLocked ? (
          <RatingQueuePanel
            statusLoadState={statusLoadState}
            displayMode={displayMode}
            remainingCount={ratingQueueCandidateIds.length}
            currentItem={ratingQueueCurrentItem}
            currentTierId={ratingQueueCurrentTierId}
            tiers={board?.tiers ?? []}
            canUndo={Boolean(lastQueuePlacement)}
            onDefer={handleQueueDefer}
            onPlace={handleQueuePlace}
            onUndo={handleQueueUndo}
            onRetryStatuses={() => setStatusReloadToken((token) => token + 1)}
          />
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveItemId(null);
            dragOriginTierIdRef.current = null;
          }}
        >
          <section className="board-section" aria-label="Tier表">
            <div className="export-surface">
              <div className="export-heading">
                <strong>
                  {seasonYear}年 {SEASON_LABELS[season]}アニメ
                </strong>
              </div>

              <div className="tier-list">
                {!board ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="skeleton-tier-row">
                      {Array.from({ length: 5 }, (_, j) => (
                        <div key={j} className="skeleton-card" />
                      ))}
                    </div>
                  ))
                ) : (
                  rankedTiers.map((tier) => (
                    <TierLane
                      key={tier.id}
                      tier={tier}
                      itemMap={itemMap}
                      editable={!isAuthReturnLocked}
                      onRename={handleRenameTier}
                      onColor={handleColorTier}
                      onDelete={handleDeleteTier}
                      onOpenMoveMenu={handleOpenMoveMenu}
                    />
                  ))
                )}
              </div>
            </div>
            <button
              className="command-button tier-add-button"
              type="button"
              onClick={handleAddTier}
              disabled={!board || isAuthReturnLocked}
              title="Tierを追加"
            >
              <Plus size={18} aria-hidden="true" />
              <span>Tierを追加</span>
            </button>
          </section>

          {!board ? (
            <section className="pool-section" aria-label="未分類">
              <div className="skeleton-pool">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="skeleton-card" />
                ))}
              </div>
            </section>
          ) : unrankedTier ? (
            <>
              <button
                type="button"
                className="pool-drawer-trigger"
                onClick={() => setPoolDrawerOpen((current) => !current)}
                aria-expanded={poolDrawerOpen}
                aria-controls="pool-drawer-section"
              >
                未分類 {unrankedTier.itemIds.length}件 {poolDrawerOpen ? "▼" : "▲"}
              </button>
              <section
                id="pool-drawer-section"
                className={
                  poolDrawerOpen ? "pool-section pool-drawer is-open" : "pool-section pool-drawer"
                }
                aria-label="未分類"
                aria-hidden={!poolDrawerOpen}
                inert={!poolDrawerOpen}
              >
              <TierLane
                tier={unrankedTier}
                itemMap={itemMap}
                pool
                editable={!isAuthReturnLocked}
                onRename={handleRenameTier}
                onColor={handleColorTier}
                onDelete={handleDeleteTier}
                onOpenMoveMenu={handleOpenMoveMenu}
              />
              </section>
            </>
          ) : null}

          <DragOverlay>
            {activeItem ? <AnimeCard item={activeItem} overlay /> : null}
          </DragOverlay>
        </DndContext>

        {board && moveMenuItem ? (
          <MoveItemSheet
            item={moveMenuItem}
            tiers={board.tiers}
            currentTierId={moveMenuCurrentTierId}
            status={statusMap[moveMenuItem.id] ?? null}
            statusDisabled={isAuthReturnLocked}
            onMove={handleMoveItemToTier}
            onStatusChange={handleStatusChange}
            onClose={() => setMoveMenuItemId(null)}
          />
        ) : null}
      </main>
    </div>
  );
}

function RatingQueuePanel({
  statusLoadState,
  displayMode,
  remainingCount,
  currentItem,
  currentTierId,
  tiers,
  canUndo,
  onDefer,
  onPlace,
  onUndo,
  onRetryStatuses
}: {
  statusLoadState: StatusLoadState;
  displayMode: DisplayMode;
  remainingCount: number;
  currentItem: AnimeItem | null;
  currentTierId: string | null;
  tiers: TierRow[];
  canUndo: boolean;
  onDefer: () => void;
  onPlace: (tierId: string) => void;
  onUndo: () => void;
  onRetryStatuses: () => void;
}) {
  const showCandidate = statusLoadState === "ready" && currentItem;
  const nativeTitle =
    currentItem?.titles.native || currentItem?.title || "";

  return (
    <section
      className={
        displayMode === "simple" ? "rating-queue rating-queue--simple" : "rating-queue"
      }
      aria-label="評価待ち"
    >
      <div className="rating-queue-header">
        <h2 className="rating-queue-title">評価待ち</h2>
        {statusLoadState === "ready" ? (
          <p className="rating-queue-count" aria-live="polite">
            残り {remainingCount} 件
          </p>
        ) : null}
      </div>

      {statusLoadState === "loading" ? (
        <AsyncState
          status="loading"
          title="評価待ちを読み込み中"
          description="視聴ステータスを取得しています。Tier表の編集は続けられます。"
        />
      ) : null}

      {statusLoadState === "error" ? (
        <AsyncState
          status="error"
          title="評価待ちを取得できませんでした。"
          description="Tier表の編集は続けられます。"
          action={{ label: "再試行", onClick: onRetryStatuses }}
        />
      ) : null}

      {statusLoadState === "ready" && !currentItem ? (
        <AsyncState
          status="empty"
          title="評価待ちはありません"
          description="完了済みで未分類の作品があると、ここに1件ずつ表示されます。"
        />
      ) : null}

      {showCandidate && currentItem ? (
        <>
          <div className="rating-queue-card" data-anime-id={currentItem.id}>
            <div className="rating-queue-poster">
              {displayMode === "simple" ? null : currentItem.proxiedImageUrl ? (
                <img
                  src={currentItem.proxiedImageUrl}
                  alt={nativeTitle}
                  draggable={false}
                />
              ) : (
                <AnimeCardPlaceholder title={nativeTitle} draggable={false} />
              )}
            </div>
            <div className="rating-queue-card-body">
              <p className="rating-queue-item-title">{nativeTitle}</p>
              {currentItem.titles.romaji &&
              currentItem.titles.romaji !== nativeTitle ? (
                <p className="rating-queue-item-sub">{currentItem.titles.romaji}</p>
              ) : null}
            </div>
          </div>

          <div className="rating-queue-toolbar">
            <button
              className="command-button rating-queue-later"
              type="button"
              onClick={onDefer}
            >
              あとで
            </button>
          </div>

          <p className="rating-queue-section-label">移動先を選択</p>
          <div className="rating-queue-destinations move-tier-grid">
            {tiers.map((tier) => {
              const isCurrent = tier.id === currentTierId;
              return (
                <button
                  key={tier.id}
                  className={
                    isCurrent ? "move-tier-button is-current" : "move-tier-button"
                  }
                  type="button"
                  disabled={isCurrent}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={isCurrent ? `${tier.label}（現在）` : tier.label}
                  style={
                    {
                      "--tier-color": tier.color,
                      "--tier-text": getReadableTextColor(tier.color)
                    } as React.CSSProperties
                  }
                  onKeyDown={(event) => {
                    if (isCurrent) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onPlace(tier.id);
                    }
                  }}
                  onClick={() => {
                    if (isCurrent) {
                      return;
                    }
                    onPlace(tier.id);
                  }}
                >
                  <span>{tier.label}</span>
                  {isCurrent ? <small>現在</small> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {canUndo ? (
        <button
          className="command-button rating-queue-undo"
          type="button"
          onClick={onUndo}
        >
          元に戻す
        </button>
      ) : null}
    </section>
  );
}

function MoveItemSheet({
  item,
  tiers,
  currentTierId,
  status,
  statusDisabled = false,
  onMove,
  onStatusChange,
  onClose
}: {
  item: AnimeItem;
  tiers: TierRow[];
  currentTierId: string | null;
  status: ViewingStatus | null;
  statusDisabled?: boolean;
  onMove: (itemId: string, tierId: string) => void;
  onStatusChange: (item: AnimeItem, status: ViewingStatus | null) => void;
  onClose: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div className="move-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="move-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="作品の詳細"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="move-sheet-preview">
          {item.proxiedImageUrl ? (
            <img src={item.proxiedImageUrl} alt={item.title} draggable={false} loading="lazy" />
          ) : (
            <AnimeCardPlaceholder title={item.title} draggable={false} />
          )}
          <div>
            <strong>{item.title}</strong>
            <div className="move-sheet-subline">
              <span>{item.format ?? "ANIME"}</span>
              <a
                href={item.siteUrl}
                target="_blank"
                rel="noreferrer"
                title="外部リンク"
                aria-label={`${item.title}の外部リンク（新しいタブで開きます）`}
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">（新しいタブで開きます）</span>
              </a>
            </div>
          </div>
        </div>

        <div className="move-sheet-details">
          <ReputationBadges item={item} />
          <AiringBadges item={item} />
          <StreamingPlatformLinks item={item} />
        </div>

        <p className="move-sheet-section-label">視聴ステータス</p>
        <StatusChips
          className="move-status-chips"
          status={status}
          disabled={statusDisabled}
          onChange={(nextStatus) => onStatusChange(item, nextStatus)}
        />

        <p className="move-sheet-section-label">移動先を選択</p>
        <div className="move-tier-grid">
          {tiers.map((tier) => (
            <button
              key={tier.id}
              className={tier.id === currentTierId ? "move-tier-button is-current" : "move-tier-button"}
              type="button"
              style={
                {
                  "--tier-color": tier.color,
                  "--tier-text": getReadableTextColor(tier.color)
                } as React.CSSProperties
              }
              onClick={() => onMove(item.id, tier.id)}
            >
              <span>{tier.label}</span>
              {tier.id === currentTierId ? <small>現在</small> : null}
            </button>
          ))}
        </div>

        <button
          ref={cancelButtonRef}
          className="move-sheet-cancel"
          type="button"
          onClick={onClose}
        >
          閉じる
        </button>
      </section>
    </div>
  );
}

function TierLane({
  tier,
  itemMap,
  editable = false,
  pool = false,
  onRename,
  onColor,
  onDelete,
  onOpenMoveMenu
}: {
  tier: TierRow;
  itemMap: Map<string, AnimeItem>;
  editable?: boolean;
  pool?: boolean;
  onRename: (tierId: string, label: string) => void;
  onColor: (tierId: string, color: string) => void;
  onDelete: (tierId: string) => void;
  onOpenMoveMenu: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
    data: {
      type: "tier"
    }
  });
  const style = {
    "--tier-color": tier.color,
    "--tier-text": getReadableTextColor(tier.color)
  } as React.CSSProperties;
  const items = tier.itemIds
    .map((id) => itemMap.get(id))
    .filter((item): item is AnimeItem => Boolean(item));

  return (
    <div
      ref={setNodeRef}
      className={[
        pool ? "pool-lane" : "tier-row",
        isOver ? "is-over" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className={pool ? "pool-title" : "tier-label"}>
        {pool ? (
          <strong>{tier.label}</strong>
        ) : (
          <input
            value={tier.label}
            aria-label={`${tier.label}の名前`}
            disabled={!editable}
            onChange={(event) => onRename(tier.id, event.target.value)}
          />
        )}
      </div>

      <SortableContext items={tier.itemIds} strategy={rectSortingStrategy}>
        <div
          className={[
            pool ? "pool-items" : "tier-items",
            items.length === 0 ? "is-empty" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {items.length ? (
            items.map((item) => (
              <SortableAnimeCard
                key={item.id}
                item={item}
                onOpenMoveMenu={onOpenMoveMenu}
              />
            ))
          ) : (
            <span className="empty-state">空</span>
          )}
        </div>
      </SortableContext>

      {editable ? (
        <div className="row-tools no-export">
          <input
            className="color-control"
            type="color"
            value={tier.color}
            onChange={(event) => onColor(tier.id, event.target.value)}
            title="Tier色"
            aria-label={`${tier.label}の色`}
          />
          {!tier.locked ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `「${tier.label}」を削除しますか？含まれるアニメは未分類に移動します。`
                  )
                ) {
                  onDelete(tier.id);
                }
              }}
              title="Tierを削除"
              aria-label="Tierを削除"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SortableAnimeCard({
  item,
  onOpenMoveMenu
}: {
  item: AnimeItem;
  onOpenMoveMenu: (itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      data: {
        type: "anime-card"
      }
    });
  /** Sticky guard: trailing click/tap after drag must not open the detail sheet. */
  const suppressOpenRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);

  const clearSuppressTimer = useCallback(() => {
    if (suppressTimerRef.current != null) {
      window.clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = null;
    }
  }, []);

  const armSuppressOpen = useCallback(() => {
    suppressOpenRef.current = true;
    clearSuppressTimer();
  }, [clearSuppressTimer]);

  useEffect(() => {
    if (isDragging) {
      armSuppressOpen();
      return;
    }
    if (!suppressOpenRef.current) {
      return;
    }
    // Keep suppression past isDragging=false so the post-drag click/tap is ignored.
    clearSuppressTimer();
    suppressTimerRef.current = window.setTimeout(() => {
      suppressOpenRef.current = false;
      suppressTimerRef.current = null;
    }, 250);
    return () => {
      clearSuppressTimer();
    };
  }, [isDragging, armSuppressOpen, clearSuppressTimer]);

  useEffect(() => {
    return () => {
      clearSuppressTimer();
    };
  }, [clearSuppressTimer]);

  const openDetailsFromPointer = useCallback(() => {
    if (isDragging || suppressOpenRef.current) {
      suppressOpenRef.current = false;
      clearSuppressTimer();
      pointerOriginRef.current = null;
      return;
    }
    onOpenMoveMenu(item.id);
  }, [clearSuppressTimer, isDragging, item.id, onOpenMoveMenu]);

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.35 : 1
  } as React.CSSProperties;

  const dragLabel = `${item.title}をドラッグして並べ替え`;
  const detailLabel = `${item.title}の詳細を開く`;
  const {
    onPointerDown: dndPointerDown,
    onKeyDown: dndKeyDown,
    ...otherListeners
  } = listeners ?? {};

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "sortable-card-shell is-dragging" : "sortable-card-shell"}
      style={style}
    >
      {/*
        Drag activator is a non-button surface with dnd-kit attributes (role/tabIndex).
        Enter/Space stay reserved for KeyboardSensor. Detail open is a sibling control
        so we never nest <button> inside the drag activator.
      */}
      <div
        className="sortable-card-drag"
        data-sortable-drag="true"
        title={dragLabel}
        {...attributes}
        {...otherListeners}
        aria-label={dragLabel}
        onPointerDown={(event) => {
          pointerOriginRef.current = { x: event.clientX, y: event.clientY };
          dndPointerDown?.(event);
        }}
        onPointerMove={(event) => {
          const origin = pointerOriginRef.current;
          if (!origin) {
            return;
          }
          if (
            Math.abs(event.clientX - origin.x) > 6 ||
            Math.abs(event.clientY - origin.y) > 6
          ) {
            armSuppressOpen();
          }
        }}
        onPointerUp={() => {
          pointerOriginRef.current = null;
        }}
        onPointerCancel={() => {
          pointerOriginRef.current = null;
        }}
        onClick={() => {
          openDetailsFromPointer();
        }}
        onKeyDown={(event) => {
          // Enter/Space: forward to dnd-kit only. Never open the detail sheet here.
          dndKeyDown?.(event);
        }}
      >
        <AnimeCard item={item} />
      </div>
      <button
        type="button"
        className="sortable-card-detail"
        aria-label={detailLabel}
        title={detailLabel}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMoveMenu(item.id);
        }}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function AnimeCard({
  item,
  overlay = false
}: {
  item: AnimeItem;
  overlay?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [item.proxiedImageUrl]);

  return (
    <article
      className={["anime-card", overlay ? "is-overlay" : ""].filter(Boolean).join(" ")}
    >
      {item.proxiedImageUrl && !imageFailed ? (
        <img
          src={item.proxiedImageUrl}
          alt={item.title}
          draggable={false}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <AnimeCardPlaceholder title={item.title} draggable={false} />
      )}
      <div className="anime-meta">
        <div className="anime-title" title={item.title}>
          {item.title}
        </div>
      </div>
    </article>
  );
}

function StatusChips({
  status,
  compact = false,
  className = "",
  disabled = false,
  onChange
}: {
  status: ViewingStatus | null;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  onChange: (status: ViewingStatus | null) => void;
}) {
  return (
    <div
      className={["status-chip-group", compact ? "is-compact" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="視聴ステータス"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className={!status ? "status-chip is-active" : "status-chip"}
        type="button"
        aria-pressed={!status}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          onChange(null);
        }}
      >
        未設定
      </button>
      {viewingStatusOptions.map((option) => (
        <button
          key={option.value}
          className={status === option.value ? "status-chip is-active" : "status-chip"}
          type="button"
          aria-pressed={status === option.value}
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AiringBadges({ item }: { item: AnimeItem }) {
  const airing = item.airing;

  if (!airing) {
    return null;
  }

  const scheduleText =
    formatScheduleFromNextEpisode(airing.nextEpisode?.airingAt) ??
    formatBroadcastSchedule(airing);
  const nextEpisode = airing.nextEpisode
    ? `#${airing.nextEpisode.episode} ${formatWeekdayTime(
        airing.nextEpisode.airingAt
      )}`
    : null;
  const cour = airing.courEstimate ?? estimateCourFromEpisodes(item.episodes);

  if (!scheduleText && !nextEpisode && !cour) {
    return null;
  }

  return (
    <div className="airing-badges">
      {scheduleText ? (
        <span title={`放送: ${scheduleText}`}>
          <CalendarDays size={11} />
          {scheduleText}
        </span>
      ) : null}
      {nextEpisode ? (
        <span title={`次回: ${nextEpisode}`}>
          <CalendarDays size={11} />
          次回 {nextEpisode}
        </span>
      ) : null}
      {cour ? (
        <span title={`話数からの推定: ${cour}`}>
          <CalendarDays size={11} />
          {cour}
        </span>
      ) : null}
    </div>
  );
}

function StreamingLinks({ item }: { item: AnimeItem }) {
  const links = item.streamingEpisodes?.filter((episode) => episode.url).slice(0, 2);

  if (!links?.length) {
    return null;
  }

  return (
    <div className="streaming-links">
      {links.map((episode) => (
        <a
          key={episode.url}
          href={episode.url}
          target="_blank"
          rel="noreferrer"
          title={episode.title ?? episode.site ?? "配信リンク"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <PlayCircle size={11} />
          <span>{episode.site ?? episode.title ?? "配信"}</span>
          <span className="sr-only">（新しいタブで開きます）</span>
        </a>
      ))}
    </div>
  );
}

function StreamingPlatformLinks({ item }: { item: AnimeItem }) {
  const platforms = getMergedStreamingPlatforms(item);
  const visiblePlatforms = platforms.slice(0, STREAMING_PLATFORM_VISIBLE_LIMIT);
  const remainingCount = getStreamingPlatformOverflowCount(platforms.length);

  if (!visiblePlatforms.length) {
    return null;
  }

  return (
    <div className="streaming-links" aria-label="見放題">
      {visiblePlatforms.map((platform) =>
        platform.url ? (
          <a
            key={`${platform.name}:${platform.url}`}
            href={platform.url}
            target="_blank"
            rel="noreferrer"
            title={`${platform.name}で見放題`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <PlayCircle size={11} />
            <span>{platform.name}</span>
            <span className="sr-only">見放題（新しいタブで開きます）</span>
          </a>
        ) : (
          <span
            key={`${platform.name}:nolink`}
            title={`${platform.name}で見放題`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <PlayCircle size={11} />
            <span>{platform.name}</span>
          </span>
        )
      )}
      {remainingCount ? (
        <span className="streaming-more" title={`他${remainingCount}件の見放題`}>
          +{remainingCount}
        </span>
      ) : null}
    </div>
  );
}

function ReputationBadges({ item }: { item: AnimeItem }) {
  const reputation = item.reputation;

  if (!reputation) {
    return null;
  }

  const score = formatScore(reputation.score, reputation.scoreMax);
  const audience =
    reputation.members ?? reputation.popularity
      ? formatCompactNumber(reputation.members ?? reputation.popularity)
      : null;
  const momentumValue = reputation.trending ?? reputation.favourites ?? null;
  const momentum = momentumValue ? formatCompactNumber(momentumValue) : null;

  if (!score && !audience && !momentum && !reputation.rank) {
    return null;
  }

  return (
    <div className="reputation-badges" title={getReputationTitle(item)}>
      {score ? (
        <span aria-label={`評価 ${score}`}>
          <Star size={11} aria-hidden="true" />
          {score}
        </span>
      ) : null}
      {audience ? (
        <span aria-label={`人気 ${audience}`}>
          <TrendingUp size={11} aria-hidden="true" />
          {audience}
        </span>
      ) : null}
      {momentum ? (
        <span aria-label={`お気に入り ${momentum}`}>
          <Heart size={11} aria-hidden="true" />
          {momentum}
        </span>
      ) : reputation.rank ? (
        <span aria-label={`順位 ${reputation.rank}位`}>#{reputation.rank}</span>
      ) : null}
    </div>
  );
}

function getReputationTitle(item: AnimeItem): string {
  const reputation = item.reputation;

  if (!reputation) {
    return "評判データなし";
  }

  const values = [
    reputation.score
      ? `評価: ${formatScore(reputation.score, reputation.scoreMax)}`
      : null,
    reputation.scoredBy ? `投票数: ${formatCompactNumber(reputation.scoredBy)}` : null,
    reputation.members ? `メンバー: ${formatCompactNumber(reputation.members)}` : null,
    reputation.popularity
      ? `人気度: ${formatCompactNumber(reputation.popularity)}`
      : null,
    reputation.trending
      ? `トレンド: ${formatCompactNumber(reputation.trending)}`
      : null,
    reputation.favourites
      ? `お気に入り: ${formatCompactNumber(reputation.favourites)}`
      : null,
    reputation.rank ? `順位: #${reputation.rank}` : null
  ].filter(Boolean);

  return values.length ? values.join(" / ") : "評判データなし";
}

function formatScore(score?: number | null, max?: number | null): string | null {
  if (typeof score !== "number") {
    return null;
  }

  if (max === 10) {
    return score.toFixed(1);
  }

  return String(Math.round(score));
}

function formatCompactNumber(value?: number | null): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return new Intl.NumberFormat("ja-JP", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatBroadcastSchedule(airing: NonNullable<AnimeItem["airing"]>): string | null {
  const day = normalizeBroadcastDay(airing.broadcastDay);
  const time = airing.broadcastTime ? normalizeTime(airing.broadcastTime) : null;

  if (day && time) {
    return `${day} ${time}`;
  }

  if (airing.broadcastText) {
    return simplifyBroadcastText(airing.broadcastText);
  }

  return day ?? time;
}

function formatScheduleFromNextEpisode(value?: string | null): string | null {
  const weekdayTime = formatWeekdayTime(value);
  return weekdayTime ? `毎週${weekdayTime}` : null;
}

function formatWeekdayTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeBroadcastDay(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/s$/i, "").trim().toLowerCase();
  const dayMap: Record<string, string> = {
    monday: "月曜",
    tuesday: "火曜",
    wednesday: "水曜",
    thursday: "木曜",
    friday: "金曜",
    saturday: "土曜",
    sunday: "日曜"
  };

  return dayMap[trimmed] ?? value;
}

function normalizeTime(value: string): string {
  return value.replace(/^(\d):/, "0$1:");
}

function simplifyBroadcastText(value: string): string {
  return value
    .replace(/\b(Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)\b/gi, (match) =>
      normalizeBroadcastDay(match) ?? match
    )
    .replace(/\s+at\s+/i, " ")
    .replace(/\s*\(JST\)/i, "")
    .trim();
}

function estimateCourFromEpisodes(episodes?: number | null): string | null {
  if (typeof episodes !== "number" || episodes <= 0) {
    return null;
  }

  if (episodes <= 13) {
    return "1クール";
  }

  if (episodes <= 26) {
    return "2クール";
  }

  if (episodes <= 39) {
    return "3クール";
  }

  return "4クール以上";
}

function createDefaultBoard(
  seasonYear: number,
  season: AnimeSeason,
  items: AnimeItem[]
): BoardState {
  return {
    version: STORAGE_VERSION,
    season,
    seasonYear,
    tiers: defaultTierTemplates.map((template) => ({
      ...template,
      itemIds: template.id === UNRANKED_TIER_ID ? items.map((item) => item.id) : []
    })),
    updatedAt: new Date().toISOString()
  };
}

function reconcileBoard(
  board: BoardState,
  items: AnimeItem[],
  seasonYear: number,
  season: AnimeSeason
): BoardState {
  const knownItemIds = new Set(items.map((item) => item.id));
  const usedItemIds = new Set<string>();
  const baseTiers = ensureUnrankedTier(board.tiers);
  const tiers = baseTiers.map((tier) => {
    const itemIds = tier.itemIds.filter((id) => {
      if (!knownItemIds.has(id) || usedItemIds.has(id)) {
        return false;
      }

      usedItemIds.add(id);
      return true;
    });

    return {
      ...tier,
      itemIds
    };
  });
  const unranked = tiers.find((tier) => tier.id === UNRANKED_TIER_ID);
  const missingItemIds = items
    .map((item) => item.id)
    .filter((itemId) => !usedItemIds.has(itemId));

  if (unranked) {
    unranked.itemIds = [...unranked.itemIds, ...missingItemIds];
  }

  return {
    ...board,
    version: STORAGE_VERSION,
    season,
    seasonYear,
    tiers,
    updatedAt: new Date().toISOString()
  };
}

function ensureUnrankedTier(tiers: TierRow[]): TierRow[] {
  if (tiers.some((tier) => tier.id === UNRANKED_TIER_ID)) {
    return tiers;
  }

  const unrankedTemplate = defaultTierTemplates.find(
    (tier) => tier.id === UNRANKED_TIER_ID
  );

  return [
    ...tiers,
    {
      id: UNRANKED_TIER_ID,
      label: "未分類",
      color: unrankedTemplate?.color ?? "#9ca3af",
      itemIds: [],
      locked: true
    }
  ];
}

function moveItemBetweenTiers(
  board: BoardState,
  activeId: string,
  overId: string
): BoardState {
  const fromTierId = findTierIdByItemId(board.tiers, activeId);
  const toTierId = isTierId(board.tiers, overId)
    ? overId
    : findTierIdByItemId(board.tiers, overId);

  if (!fromTierId || !toTierId) {
    return board;
  }

  const fromTier = board.tiers.find((tier) => tier.id === fromTierId);
  const toTier = board.tiers.find((tier) => tier.id === toTierId);

  if (!fromTier || !toTier) {
    return board;
  }

  if (fromTierId === toTierId) {
    const oldIndex = fromTier.itemIds.indexOf(activeId);
    const newIndex = fromTier.itemIds.indexOf(overId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return board;
    }

    return {
      ...board,
      tiers: board.tiers.map((tier) =>
        tier.id === fromTierId
          ? { ...tier, itemIds: arrayMove(tier.itemIds, oldIndex, newIndex) }
          : tier
      )
    };
  }

  const insertIndex = toTier.itemIds.indexOf(overId);
  const safeInsertIndex = insertIndex >= 0 ? insertIndex : toTier.itemIds.length;

  return {
    ...board,
    tiers: board.tiers.map((tier) => {
      if (tier.id === fromTierId) {
        return {
          ...tier,
          itemIds: tier.itemIds.filter((id) => id !== activeId)
        };
      }

      if (tier.id === toTierId) {
        const nextItemIds = [...tier.itemIds];
        nextItemIds.splice(safeInsertIndex, 0, activeId);
        return {
          ...tier,
          itemIds: nextItemIds
        };
      }

      return tier;
    })
  };
}

function compareByPublicReputation(a: AnimeItem, b: AnimeItem): number {
  return (
    getAnimePopularity(b) - getAnimePopularity(a) ||
    (b.reputation?.favourites ?? 0) - (a.reputation?.favourites ?? 0) ||
    (b.reputation?.trending ?? 0) - (a.reputation?.trending ?? 0) ||
    getNormalizedScore(b) - getNormalizedScore(a) ||
    a.title.localeCompare(b.title, "ja")
  );
}

function getNormalizedScore(item: AnimeItem): number {
  const score = item.reputation?.score;

  if (typeof score !== "number") {
    return 0;
  }

  return item.reputation?.scoreMax === 10 ? score * 10 : score;
}

function getPublicTierIndex(
  index: number,
  total: number,
  tierCount: number
): number {
  if (tierCount <= 1 || total <= 1) {
    return 0;
  }

  if (tierCount < 5) {
    return Math.min(Math.floor((index / total) * tierCount), tierCount - 1);
  }

  const percentile = index / total;

  if (percentile < 0.1) {
    return 0;
  }

  if (percentile < 0.3) {
    return 1;
  }

  if (percentile < 0.6) {
    return 2;
  }

  if (percentile < 0.85) {
    return 3;
  }

  return 4;
}

function findTierIdByItemId(tiers: TierRow[], itemId: string): string | null {
  return tiers.find((tier) => tier.itemIds.includes(itemId))?.id ?? null;
}

function getTierIdFromDroppable(tiers: TierRow[], id: string): string | null {
  return isTierId(tiers, id) ? id : findTierIdByItemId(tiers, id);
}

function isTierId(tiers: TierRow[], id: string): boolean {
  return tiers.some((tier) => tier.id === id);
}

function getStorageKey(year: number, season: AnimeSeason): string {
  return `${STORAGE_PREFIX}:${year}:${season}`;
}

function writePendingShareIntent(intent: PendingShareIntent): boolean {
  const serialized = JSON.stringify(intent);
  try {
    sessionStorage.setItem(PENDING_SHARE_INTENT_KEY, serialized);
    return sessionStorage.getItem(PENDING_SHARE_INTENT_KEY) === serialized;
  } catch {
    return false;
  }
}

function readPendingShareIntentRaw(): DurableRead<string> {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARE_INTENT_KEY);
    return raw == null ? { kind: "absent" } : { kind: "ok", value: raw };
  } catch {
    return { kind: "unreadable" };
  }
}

function clearPendingShareIntent(): boolean {
  try {
    sessionStorage.removeItem(PENDING_SHARE_INTENT_KEY);
    return sessionStorage.getItem(PENDING_SHARE_INTENT_KEY) == null;
  } catch {
    return false;
  }
}

function hashShareHandoffBoardRaw(raw: string): string {
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function createHandoffOwnerTabId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createHandoffAttemptId(): string | null {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    return null;
  }
  return null;
}

function readOrCreateStableHandoffOwnerTabId(): string | null {
  try {
    const existing = sessionStorage.getItem(SHARE_HANDOFF_OWNER_TAB_ID_KEY);
    if (existing != null) {
      return existing.length > 0 ? existing : null;
    }

    const created = createHandoffOwnerTabId();
    sessionStorage.setItem(SHARE_HANDOFF_OWNER_TAB_ID_KEY, created);
    return sessionStorage.getItem(SHARE_HANDOFF_OWNER_TAB_ID_KEY) === created
      ? created
      : null;
  } catch {
    return null;
  }
}

function isRecoveryMarkerOwnedBy(
  marker: ShareHandoffRecoveryMarker,
  ownerTabId: string | null,
  attemptId: string | null
): boolean {
  return (
    ownerTabId != null &&
    attemptId != null &&
    marker.ownerTabId === ownerTabId &&
    marker.attemptId === attemptId
  );
}

async function withShareHandoffLock(callback: () => Promise<void>): Promise<boolean> {
  if (typeof navigator === "undefined") {
    return false;
  }

  const lockManager = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!lockManager || typeof lockManager.request !== "function") {
    return false;
  }

  let acquired = false;
  try {
    await lockManager.request(
      SHARE_HANDOFF_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          return;
        }
        acquired = true;
        await callback();
      }
    );
    return acquired;
  } catch {
    return false;
  }
}

function isCanonicalAnimeSeason(value: unknown): value is AnimeSeason {
  return (
    value === "WINTER" ||
    value === "SPRING" ||
    value === "SUMMER" ||
    value === "FALL"
  );
}

function isPositiveIntegerYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseStrictIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms).toISOString() === value ? ms : null;
}

function parseBoardMatchingContext(
  raw: string,
  year: number,
  season: AnimeSeason
): BoardState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const board = parseBoardState(parsed);
  if (!board) {
    return null;
  }
  if (board.seasonYear !== year || board.season !== season) {
    return null;
  }
  return board;
}

function readLocalStorageRaw(
  key: string
): { kind: "absent" } | { kind: "unreadable" } | { kind: "ok"; raw: string } {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) {
      return { kind: "absent" };
    }
    return { kind: "ok", raw };
  } catch {
    return { kind: "unreadable" };
  }
}

function writeLocalStorageRaw(key: string, raw: string): boolean {
  try {
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw;
  } catch {
    return false;
  }
}

function isShareHandoffRecoveryMarker(
  value: unknown
): value is ShareHandoffRecoveryMarker {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const expected = [
    "attemptId",
    "chosenBoardHash",
    "chosenBoardRaw",
    "createdAt",
    "guestRaw",
    "leaseExpiresAt",
    "ownerTabId",
    "postState",
    "putStatus",
    "season",
    "storageKey",
    "version",
    "year"
  ];
  if (keys.length !== expected.length || keys.join(",") !== expected.join(",")) {
    return false;
  }
  if (candidate.version !== SHARE_HANDOFF_RECOVERY_VERSION) {
    return false;
  }
  if (!isPositiveIntegerYear(candidate.year)) {
    return false;
  }
  if (!isCanonicalAnimeSeason(candidate.season)) {
    return false;
  }
  if (typeof candidate.storageKey !== "string") {
    return false;
  }
  if (candidate.storageKey !== getStorageKey(candidate.year, candidate.season)) {
    return false;
  }
  if (typeof candidate.attemptId !== "string" || candidate.attemptId.length === 0) {
    return false;
  }
  if (typeof candidate.ownerTabId !== "string" || candidate.ownerTabId.length === 0) {
    return false;
  }
  if (typeof candidate.guestRaw !== "string" || typeof candidate.chosenBoardRaw !== "string") {
    return false;
  }
  if (typeof candidate.chosenBoardHash !== "string") {
    return false;
  }
  if (candidate.chosenBoardHash !== hashShareHandoffBoardRaw(candidate.chosenBoardRaw)) {
    return false;
  }
  if (parseStrictIsoTimestamp(candidate.createdAt) == null) {
    return false;
  }
  if (parseStrictIsoTimestamp(candidate.leaseExpiresAt) == null) {
    return false;
  }
  if (
    candidate.putStatus !== "none" &&
    candidate.putStatus !== "completed" &&
    candidate.putStatus !== "unknown"
  ) {
    return false;
  }
  if (
    candidate.postState !== "not_started" &&
    candidate.postState !== "post_started_unknown" &&
    candidate.postState !== "post_failed_definite" &&
    candidate.postState !== "post_completed_cleanup_pending"
  ) {
    return false;
  }
  const guestBoard = parseBoardMatchingContext(
    candidate.guestRaw,
    candidate.year,
    candidate.season
  );
  const chosenBoard = parseBoardMatchingContext(
    candidate.chosenBoardRaw,
    candidate.year,
    candidate.season
  );
  return guestBoard != null && chosenBoard != null;
}

function recoveryMarkerAgeExpired(marker: ShareHandoffRecoveryMarker, now = Date.now()): boolean {
  const createdMs = parseStrictIsoTimestamp(marker.createdAt);
  if (createdMs == null || createdMs > now) {
    return true;
  }
  return now - createdMs > SHARE_HANDOFF_RECOVERY_MAX_AGE_MS;
}

function recoveryLeaseExpired(marker: ShareHandoffRecoveryMarker, now = Date.now()): boolean {
  const expiresMs = parseStrictIsoTimestamp(marker.leaseExpiresAt);
  return expiresMs == null || expiresMs <= now;
}

function readShareHandoffRecoveryDurable(): DurableRead<ShareHandoffRecoveryMarker> {
  const raw = readLocalStorageRaw(SHARE_HANDOFF_RECOVERY_KEY);
  if (raw.kind === "absent" || raw.kind === "unreadable") {
    return raw;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.raw);
  } catch {
    return { kind: "malformed" };
  }
  if (!isShareHandoffRecoveryMarker(parsed)) {
    return { kind: "malformed" };
  }
  return { kind: "ok", value: parsed };
}

function casWriteShareHandoffRecoveryMarker(
  next: ShareHandoffRecoveryMarker
): boolean {
  if (!next.ownerTabId || !next.attemptId) {
    return false;
  }
  const existing = readShareHandoffRecoveryDurable();
  if (existing.kind === "unreadable") {
    return false;
  }
  if (existing.kind === "malformed") {
    return false;
  }
  if (existing.kind === "ok") {
    const held = existing.value;
    if (
      !isRecoveryMarkerOwnedBy(held, next.ownerTabId, next.attemptId) &&
      !recoveryMarkerAgeExpired(held) &&
      !recoveryLeaseExpired(held)
    ) {
      return false;
    }
  }
  const serialized = JSON.stringify(next);
  if (!writeLocalStorageRaw(SHARE_HANDOFF_RECOVERY_KEY, serialized)) {
    return false;
  }
  const verify = readShareHandoffRecoveryDurable();
  return (
    verify.kind === "ok" &&
    verify.value.ownerTabId === next.ownerTabId &&
    verify.value.attemptId === next.attemptId &&
    verify.value.postState === next.postState &&
    verify.value.chosenBoardHash === next.chosenBoardHash
  );
}

function clearDurableRecoveryRecords(): boolean {
  try {
    localStorage.removeItem(SHARE_HANDOFF_RECOVERY_KEY);
    if (localStorage.getItem(SHARE_HANDOFF_RECOVERY_KEY) != null) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasUnresolvedShareHandoffRecoveryMarker(): boolean {
  const marker = readShareHandoffRecoveryDurable();
  return marker.kind !== "absent";
}

function classifySharePostResponse(
  response: Response,
  payload: unknown,
  jsonParsed: boolean
): SharePostOutcome {
  if (!response.ok) {
    return "definite_failure";
  }
  if (!jsonParsed) {
    return "unknown";
  }
  if (!payload || typeof payload !== "object") {
    return "unknown";
  }
  const shareId = (payload as ShareApiResponse).shareId;
  if (typeof shareId !== "string" || shareId.trim() === "") {
    return "unknown";
  }
  return "success";
}

/** Exact metadata-only schema; reject extra keys and wrong shapes. */
function isExactPendingShareIntent(value: unknown): value is PendingShareIntent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const keys = Object.keys(value).sort();
  if (
    keys.length !== 5 ||
    keys[0] !== "action" ||
    keys[1] !== "createdAt" ||
    keys[2] !== "season" ||
    keys[3] !== "version" ||
    keys[4] !== "year"
  ) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === PENDING_SHARE_INTENT_VERSION &&
    candidate.action === "share" &&
    isPositiveIntegerYear(candidate.year) &&
    isCanonicalAnimeSeason(candidate.season) &&
    parseStrictIsoTimestamp(candidate.createdAt) != null
  );
}

type AuthReturnShareEvaluation = {
  decision: AuthReturnShareDecision;
  /** Present when schema yields year/season (valid/expired are always current). */
  year?: number;
  season?: AnimeSeason;
  corruptRaw?: string;
};

/** Mutations stay locked until handoff chooses a board or is cancelled/expired. */
function isAuthReturnPhaseLocked(phase: AuthReturnPhase): boolean {
  return (
    phase === "pending" ||
    phase === "evaluating" ||
    phase === "conflict" ||
    phase === "confirm-replace" ||
    phase === "handoff-error" ||
    phase === "sharing" ||
    phase === "recovery"
  );
}

/**
 * Optional E2E hooks (Chromium/Mobile Chrome) so tests can observe evaluating paint
 * and hold the decision boundary without changing production policy.
 */
type AuthReturnWindowHooks = {
  __ATB704_AUTH_RETURN_DECISION_GATE__?: Promise<void> | null;
  __ATB704_AUTH_RETURN_EVALUATING_PAINTED__?: () => void;
  __ATB692_IGNORE_HANDOFF_ABORT__?: boolean;
};

/**
 * Yield past the current effect turn so React can commit `evaluating`, then wait
 * for a real browser paint (double rAF). Compatible with client components / useEffect.
 */
function waitForBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    // Macrotask first: lets React process the evaluating setState from useEffect.
    window.setTimeout(() => {
      if (typeof window.requestAnimationFrame !== "function") {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    }, 0);
  });
}

/**
 * After setState(evaluating): wait for commit+paint, notify optional test hooks,
 * then await an optional decision gate before valid/expired/invalid final phase.
 */
async function waitForAuthReturnEvaluatingBoundary(): Promise<void> {
  await waitForBrowserPaint();

  const hooks = window as unknown as AuthReturnWindowHooks;
  try {
    hooks.__ATB704_AUTH_RETURN_EVALUATING_PAINTED__?.();
  } catch {
    // Test hooks must never break production evaluation.
  }

  const gate = hooks.__ATB704_AUTH_RETURN_DECISION_GATE__;
  if (gate != null && typeof (gate as PromiseLike<void>).then === "function") {
    await gate;
  }
}

/**
 * Evaluate pending share intent on authenticated return.
 * Valid only: exact schema, CURRENT year and CURRENT season, parseable non-future
 * createdAt within 10 minutes, and an existing valid matching local board.
 * Past/future year or season mismatch is invalid (local-only, not protected).
 */
function evaluateAuthReturnShareIntent(
  rawOverride?: string
): AuthReturnShareEvaluation {
  const pendingRead =
    rawOverride === undefined
      ? readPendingShareIntentRaw()
      : { kind: "ok" as const, value: rawOverride };
  if (pendingRead.kind === "unreadable") {
    return { decision: "unreadable" };
  }
  const raw = pendingRead.kind === "ok" ? pendingRead.value : null;

  if (raw == null) {
    return { decision: "none" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { decision: "invalid" };
  }

  if (!isExactPendingShareIntent(parsed)) {
    return { decision: "invalid" };
  }

  const year = parsed.year;
  const season = parsed.season as AnimeSeason;
  const withSeason = { year, season };
  const current = getCurrentAnimeSeason();

  // Past/future year or non-current season → invalid (never protected).
  if (year !== current.year || season !== current.season) {
    return { decision: "invalid", ...withSeason };
  }

  const createdMs = parseStrictIsoTimestamp(parsed.createdAt);
  if (createdMs == null) {
    return { decision: "invalid", ...withSeason };
  }

  const now = Date.now();
  if (createdMs > now) {
    return { decision: "invalid", ...withSeason };
  }

  if (now - createdMs > PENDING_SHARE_INTENT_MAX_AGE_MS) {
    return { decision: "expired", ...withSeason };
  }

  const stored = readStoredBoardRecord(getStorageKey(year, season));
  if (stored.kind === "unreadable") {
    return { decision: "unreadable", ...withSeason };
  }
  if (stored.kind === "ok" && stored.board == null) {
    return { decision: "corrupt", ...withSeason, corruptRaw: stored.raw };
  }
  if (
    stored.kind !== "ok" ||
    !stored.board ||
    stored.board.seasonYear !== year ||
    stored.board.season !== season ||
    isCanonicalGeneratedDefaultBoard(stored.board)
  ) {
    return { decision: "invalid", ...withSeason };
  }

  return { decision: "valid", ...withSeason };
}

async function readRemoteBoard(
  year: number,
  season: AnimeSeason
): Promise<BoardState | null> {
  const response = await fetch(`/api/boards?year=${year}&season=${season}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as BoardApiResponse;
  return payload.board && isBoardState(payload.board) ? payload.board : null;
}

type HandoffRemoteResult =
  | { ok: true; board: BoardState | null }
  | { ok: false; reason: "http" | "malformed" | "aborted" | "context" };

function remoteBoardMatchesHandoffContext(
  board: BoardState,
  year: number,
  season: AnimeSeason
): boolean {
  const normalized = normalizeSeason(String(board.season));
  return board.seasonYear === year && normalized === season;
}

/** Handoff GET: HTTP failure is distinct from remote-none (`board: null`). */
async function fetchRemoteBoardForHandoff(
  year: number,
  season: AnimeSeason,
  signal: AbortSignal
): Promise<HandoffRemoteResult> {
  try {
    const response = await fetch(`/api/boards?year=${year}&season=${season}`, {
      cache: "no-store",
      signal
    });

    if (!response.ok) {
      return { ok: false, reason: "http" };
    }

    const payload = (await response.json()) as BoardApiResponse;
    if (payload.board == null) {
      return { ok: true, board: null };
    }
    const parsed = parseBoardState(payload.board);
    if (!parsed) {
      return { ok: false, reason: "malformed" };
    }
    if (!remoteBoardMatchesHandoffContext(parsed, year, season)) {
      return { ok: false, reason: "context" };
    }
    return { ok: true, board: parsed };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "http" };
  }
}

async function putRemoteBoardForHandoff(
  board: BoardState,
  expectedUpdatedAt: string | null,
  signal: AbortSignal
): Promise<HandoffPutOutcome> {
  try {
    const response = await fetch("/api/boards", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        board,
        expectedUpdatedAt
      }),
      signal
    });

    if (response.status === 409) {
      return "conflict";
    }

    if (!response.ok) {
      return "definite_failure";
    }

    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "aborted";
    }
    return "unknown";
  }
}

async function saveRemoteBoard(board: BoardState, signal: AbortSignal): Promise<void> {
  const response = await fetch("/api/boards", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ board }),
    signal
  });

  if (!response.ok) {
    throw new Error("Failed to save board.");
  }
}

function getSaveStateLabel(state: "local" | "saving" | "saved" | "error"): string {
  if (state === "saving") return "保存中";
  if (state === "saved") return "保存済み";
  if (state === "error") return "保存失敗";
  return "この端末に保存中";
}

function readStoredBoard(storageKey: string): BoardState | null {
  const stored = readStoredBoardRecord(storageKey);
  return stored.kind === "ok" ? stored.board : null;
}

function readStoredBoardRecord(storageKey: string): StoredBoardRead {
  const rawRead = readLocalStorageRaw(storageKey);
  if (rawRead.kind === "absent" || rawRead.kind === "unreadable") {
    return rawRead;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRead.raw);
  } catch {
    return { kind: "ok", raw: rawRead.raw, board: null };
  }
  return { kind: "ok", raw: rawRead.raw, board: parseBoardState(parsed) };
}

function parseBoardState(value: unknown): BoardState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const boardKeys = Object.keys(candidate).sort();
  if (
    boardKeys.length !== 5 ||
    boardKeys.join(",") !== "season,seasonYear,tiers,updatedAt,version"
  ) {
    return null;
  }
  if (candidate.version !== STORAGE_VERSION) {
    return null;
  }
  if (!isPositiveIntegerYear(candidate.seasonYear)) {
    return null;
  }
  if (!isCanonicalAnimeSeason(candidate.season)) {
    return null;
  }
  if (
    typeof candidate.updatedAt !== "string" ||
    parseStrictIsoTimestamp(candidate.updatedAt) == null
  ) {
    return null;
  }
  if (!Array.isArray(candidate.tiers) || candidate.tiers.length === 0) {
    return null;
  }

  const seenTierIds = new Set<string>();
  const seenItemIds = new Set<string>();
  const tiers: TierRow[] = [];

  for (const entry of candidate.tiers) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const tier = entry as Record<string, unknown>;
    const tierKeys = Object.keys(tier).sort();
    if (
      (tierKeys.length !== 4 && tierKeys.length !== 5) ||
      tierKeys.slice(0, 4).join(",") !== "color,id,itemIds,label" ||
      (tierKeys.length === 5 && tierKeys[4] !== "locked")
    ) {
      return null;
    }
    if (typeof tier.id !== "string" || tier.id.trim() === "") {
      return null;
    }
    if (typeof tier.label !== "string" || tier.label.trim() === "") {
      return null;
    }
    if (typeof tier.color !== "string") {
      return null;
    }
    if (!Array.isArray(tier.itemIds)) {
      return null;
    }
    if (seenTierIds.has(tier.id)) {
      return null;
    }
    seenTierIds.add(tier.id);
    const itemIds: string[] = [];
    for (const itemId of tier.itemIds) {
      if (typeof itemId !== "string" || itemId.trim() === "") {
        return null;
      }
      if (seenItemIds.has(itemId)) {
        return null;
      }
      seenItemIds.add(itemId);
      itemIds.push(itemId);
    }
    if (tier.locked !== undefined && typeof tier.locked !== "boolean") {
      return null;
    }
    tiers.push({
      id: tier.id,
      label: tier.label,
      color: tier.color,
      itemIds,
      ...(typeof tier.locked === "boolean" ? { locked: tier.locked } : {})
    });
  }

  const unranked = tiers.filter((tier) => tier.id === UNRANKED_TIER_ID);
  if (unranked.length !== 1 || unranked[0].locked !== true) {
    return null;
  }

  return {
    version: STORAGE_VERSION,
    season: candidate.season as AnimeSeason,
    seasonYear: candidate.seasonYear,
    tiers,
    updatedAt: candidate.updatedAt
  };
}

function isBoardState(value: unknown): value is BoardState {
  return parseBoardState(value) !== null;
}

function cloneBoardState(board: BoardState): BoardState {
  return JSON.parse(JSON.stringify(board)) as BoardState;
}

function isCanonicalGeneratedDefaultBoard(board: BoardState): boolean {
  if (board.tiers.length !== defaultTierTemplates.length) {
    return false;
  }
  return defaultTierTemplates.every((template, index) => {
    const tier = board.tiers[index];
    return (
      tier.id === template.id &&
      tier.label === template.label &&
      tier.color === template.color &&
      Boolean(tier.locked) === Boolean(template.locked) &&
      (template.id === UNRANKED_TIER_ID || tier.itemIds.length === 0)
    );
  });
}

function boardsEquivalentForHandoff(left: BoardState, right: BoardState): boolean {
  return (
    left.version === right.version &&
    left.season === right.season &&
    left.seasonYear === right.seasonYear &&
    JSON.stringify(
      left.tiers.map((tier) => ({
        id: tier.id,
        label: tier.label,
        color: tier.color,
        itemIds: tier.itemIds,
        locked: Boolean(tier.locked)
      }))
    ) ===
      JSON.stringify(
        right.tiers.map((tier) => ({
          id: tier.id,
          label: tier.label,
          color: tier.color,
          itemIds: tier.itemIds,
          locked: Boolean(tier.locked)
        }))
      )
  );
}

function ShareHandoffDialog({
  title,
  alert,
  escapeLocked = false,
  onEscape,
  children
}: {
  title: string;
  alert: boolean;
  escapeLocked?: boolean;
  onEscape: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = panelRef.current;
    const first = root?.querySelector<HTMLButtonElement>("button:not([disabled])");
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!escapeLocked) {
          onEscape();
        }
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) {
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [escapeLocked, onEscape, title]);

  return (
    <div
      className="move-sheet-backdrop"
      role="presentation"
      onClick={escapeLocked ? undefined : onEscape}
    >
      <section
        ref={panelRef}
        className="move-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-share-handoff-title"
        onClick={(event) => event.stopPropagation()}
      >
        {alert ? (
          <p id="tier-share-handoff-title" className="move-sheet-section-label" role="alert">
            {title}
          </p>
        ) : escapeLocked ? (
          <p id="tier-share-handoff-title" className="move-sheet-section-label" role="status">
            {title}
          </p>
        ) : (
          <strong id="tier-share-handoff-title">{title}</strong>
        )}
        <div className="tier-login-prompt-actions">
          {children}
        </div>
      </section>
    </div>
  );
}

function getReadableTextColor(hex: string): string {
  const normalized = hex.replace("#", "");

  if (normalized.length !== 6) {
    return "#111827";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.56 ? "#111827" : "#ffffff";
}

