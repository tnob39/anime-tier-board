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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { track } from "@/lib/analytics";
import { filterAnimeItems } from "@/lib/anime-filters";
import { getAnimePopularity } from "@/lib/anime-popularity";
import {
  fetchSeasonalAnimeClient,
  seedSeasonalAnimeCache,
} from "@/lib/seasonal-anime-client-cache";
import { getCurrentAnimeSeason } from "@/lib/season";
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

const AUTH_RETURN_STATUS_EVALUATING = "Tier表を引き継いでいます…";
const AUTH_RETURN_STATUS_PROTECTED =
  "ログイン前のTier表を保持しています。「共有」を押して共有を続けてください。";
const AUTH_RETURN_STATUS_EXPIRED =
  "共有の再開期限が切れました。もう一度「共有」を押してください。";
const SHARE_CREATE_ERROR_MESSAGE = "シェアの作成に失敗しました。";

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

/** Auth-return pending-share evaluation phase (P0-B). */
type AuthReturnPhase = "pending" | "evaluating" | "protected" | "expired" | "none";

type AuthReturnShareDecision = "none" | "valid" | "expired" | "invalid";

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
  const moveAnnouncementTimeoutRef = useRef<number | null>(null);
  const dragOriginTierIdRef = useRef<string | null>(null);
  /** pending until session settles; evaluating/protected/expired/none after auth-return guard. */
  const [authReturnPhase, setAuthReturnPhase] = useState<AuthReturnPhase>("pending");
  /**
   * Suppress automatic remote board/status traffic while a recognized pending intent
   * (valid / expired / invalid) keeps the guest local board until explicit Share.
   */
  const protectLocalBoardRef = useRef(false);
  const authReturnPhaseRef = useRef<AuthReturnPhase>("pending");
  authReturnPhaseRef.current = authReturnPhase;
  /** Synchronous Share in-flight lock (state `sharing` alone can miss double-activation). */
  const shareInFlightRef = useRef(false);
  /** Canonical pending|evaluating lock for handlers + UI (single source of truth). */
  const isAuthReturnLocked = isAuthReturnPhaseLocked(authReturnPhase);

  useEffect(() => {
    setMoveHintSeen(window.localStorage.getItem(MOVE_HINT_STORAGE_KEY) === "1");
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

    let cancelled = false;

    async function runAuthReturnGuard() {
      let hasIntent = false;
      try {
        hasIntent = sessionStorage.getItem(PENDING_SHARE_INTENT_KEY) != null;
      } catch {
        hasIntent = false;
      }

      if (!hasIntent) {
        if (!cancelled) {
          protectLocalBoardRef.current = false;
          setAuthReturnPhase("none");
        }
        return;
      }

      // Recognized pending-intent key: local-only guard immediately (before any await).
      // Valid / expired / invalid all keep this guard until explicit Share success.
      protectLocalBoardRef.current = true;

      const evaluation = evaluateAuthReturnShareIntent();
      const decision = evaluation.decision;

      // Valid/expired require current year+season only; never retarget UI from mismatched intent.
      if (
        (decision === "valid" || decision === "expired") &&
        evaluation.year != null &&
        evaluation.season != null
      ) {
        setSeasonYear(evaluation.year);
        setSeason(evaluation.season);
      }

      // Enter evaluating before any final decision so the status can commit/paint.
      if (!cancelled) {
        setAuthReturnPhase("evaluating");
      }

      // Paint-safe boundary (macrotask + double rAF) + optional E2E decision gate.
      // Must await out of the effect so React can commit evaluating first (no flushSync in lifecycle).
      await waitForAuthReturnEvaluatingBoundary();

      if (cancelled) {
        return;
      }

      if (decision === "valid") {
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("protected");
        return;
      }

      if (decision === "expired") {
        clearPendingShareIntent();
        protectLocalBoardRef.current = true;
        setAuthReturnPhase("expired");
        return;
      }

      // invalid (or unexpected): consume intent, keep local-only guard, no protected-status UI.
      clearPendingShareIntent();
      protectLocalBoardRef.current = true;
      setAuthReturnPhase("none");
    }

    void runAuthReturnGuard();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatusMap({});
      return;
    }

    // Wait for auth-return decision; while guarded, never automatic statuses GET.
    if (!authReturnReady || protectLocalBoardRef.current) {
      return;
    }

    let cancelled = false;

    fetch("/api/statuses", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          let message = "視聴ステータスの取得に失敗しました。";
          try {
            const body = (await response.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // ignore
          }
          throw new Error(message);
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
      })
      .catch((statusError) => {
        if (cancelled) {
          return;
        }
        setWarning(
          statusError instanceof Error
            ? statusError.message
            : "視聴ステータスの取得に失敗しました。"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [authReturnReady, authReturnPhase, isAuthenticated]);

  useEffect(() => {
    if (!board) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(board));

    // Protected auth-return: localStorage only — never PUT / autosave.
    if (!isAuthenticated || protectLocalBoardRef.current) {
      setSaveState("local");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (protectLocalBoardRef.current) {
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
    if (!board || retryingSave || protectLocalBoardRef.current) {
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

  async function handleCreateShare() {
    if (!board || !items.length || isAuthReturnPhaseLocked(authReturnPhaseRef.current)) {
      return;
    }

    // Synchronous in-flight lock prevents double activation before React re-render.
    if (shareInFlightRef.current) {
      return;
    }

    if (!isAuthenticated) {
      setLoginPrompt("share");
      return;
    }

    shareInFlightRef.current = true;

    // Explicit Share only: atomically consume pending intent before the single POST.
    clearPendingShareIntent();

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
      shareInFlightRef.current = false;
      setSharing(false);
    }
  }

  function handleGoogleLoginFromPrompt() {
    if (loginPrompt === "share") {
      writePendingShareIntent({
        version: PENDING_SHARE_INTENT_VERSION,
        action: "share",
        year: seasonYear,
        season,
        createdAt: new Date().toISOString()
      });
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
                : "Tier表を共有するにはログインしてください。作成したTier表はそのまま残ります。"}
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
              className="command-button tier-login-prompt-close"
              type="button"
              onClick={() => setLoginPrompt(null)}
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <main className="app-main">
        {authReturnPhase === "evaluating" ? (
          <div className="notice" role="status" aria-live="polite">
            {AUTH_RETURN_STATUS_EVALUATING}
          </div>
        ) : null}
        {authReturnPhase === "protected" ? (
          <div className="notice" role="status" aria-live="polite">
            {AUTH_RETURN_STATUS_PROTECTED}
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

function writePendingShareIntent(intent: PendingShareIntent): void {
  try {
    sessionStorage.setItem(PENDING_SHARE_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // quota / private mode: later readers simply see no intent
  }
}

function clearPendingShareIntent(): void {
  try {
    sessionStorage.removeItem(PENDING_SHARE_INTENT_KEY);
  } catch {
    // ignore
  }
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
    typeof candidate.year === "number" &&
    Number.isFinite(candidate.year) &&
    typeof candidate.season === "string" &&
    (SEASONS as readonly string[]).includes(candidate.season) &&
    typeof candidate.createdAt === "string"
  );
}

type AuthReturnShareEvaluation = {
  decision: AuthReturnShareDecision;
  /** Present when schema yields year/season (valid/expired are always current). */
  year?: number;
  season?: AnimeSeason;
};

/** Contract mutations stay locked for both pre-decision phases. */
function isAuthReturnPhaseLocked(phase: AuthReturnPhase): boolean {
  return phase === "pending" || phase === "evaluating";
}

/**
 * Optional E2E hooks (Chromium/Mobile Chrome) so tests can observe evaluating paint
 * and hold the decision boundary without changing production policy.
 */
type AuthReturnWindowHooks = {
  __ATB704_AUTH_RETURN_DECISION_GATE__?: Promise<void> | null;
  __ATB704_AUTH_RETURN_EVALUATING_PAINTED__?: () => void;
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
function evaluateAuthReturnShareIntent(): AuthReturnShareEvaluation {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_SHARE_INTENT_KEY);
  } catch {
    return { decision: "none" };
  }

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

  const createdMs = Date.parse(parsed.createdAt);
  if (!Number.isFinite(createdMs)) {
    return { decision: "invalid", ...withSeason };
  }

  const now = Date.now();
  if (createdMs > now) {
    return { decision: "invalid", ...withSeason };
  }

  if (now - createdMs > PENDING_SHARE_INTENT_MAX_AGE_MS) {
    return { decision: "expired", ...withSeason };
  }

  const localBoard = readStoredBoard(getStorageKey(year, season));
  if (
    !localBoard ||
    localBoard.seasonYear !== year ||
    localBoard.season !== season
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
  try {
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isBoardState(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isBoardState(value: unknown): value is BoardState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BoardState>;
  return (
    candidate.version === STORAGE_VERSION &&
    typeof candidate.seasonYear === "number" &&
    typeof candidate.season === "string" &&
    Array.isArray(candidate.tiers)
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

