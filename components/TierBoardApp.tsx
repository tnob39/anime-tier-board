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
import { toPng } from "html-to-image";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  CalendarDays,
  Compass,
  Download,
  ExternalLink,
  Heart,
  ListChecks,
  Loader2,
  Megaphone,
  Mic2,
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
import { filterAnimeItems } from "@/lib/anime-filters";
import { getCurrentAnimeSeason } from "@/lib/season";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem, AnimeSeason, AnimeSourceName } from "@/lib/types";
import { SEASON_LABELS, SEASONS } from "@/lib/types";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "anime-tier-board:v1";
const UNRANKED_TIER_ID = "tier-unranked";

type TierRow = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
  locked?: boolean;
};

type BoardState = {
  version: typeof STORAGE_VERSION;
  season: AnimeSeason;
  seasonYear: number;
  tiers: TierRow[];
  updatedAt: string;
};

type SeasonalApiResponse = {
  year: number;
  season: AnimeSeason;
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
  enrichWarning?: string;
  error?: string;
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
  { value: "paused", label: "保留" },
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

export function TierBoardApp() {
  const { data: session, status: authStatus } = useSession();
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const [seasonYear, setSeasonYear] = useState(currentSeason.year);
  const [season, setSeason] = useState<AnimeSeason>(currentSeason.season);
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [source, setSource] = useState<AnimeSourceName | null>(null);
  const [cached, setCached] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"local" | "saving" | "saved" | "error">(
    "local"
  );
  const [statusMap, setStatusMap] = useState<Record<string, ViewingStatus>>({});
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [moveMenuItemId, setMoveMenuItemId] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragOriginTierIdRef = useRef<string | null>(null);

  const storageKey = useMemo(
    () => getStorageKey(seasonYear, season),
    [seasonYear, season]
  );
  const isAuthenticated = authStatus === "authenticated";
  const userLabel = session?.user?.name ?? session?.user?.email ?? "Googleユーザー";

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

  const loadAnime = useCallback(async () => {
    if (authStatus === "loading") {
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(
        `/api/anime/seasonal?year=${seasonYear}&season=${season}`,
        {
          cache: "no-store"
        }
      );
      const payload = (await response.json()) as SeasonalApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "季節アニメの取得に失敗しました。");
      }

      const nextItems = payload.items;
      const storedBoard = isAuthenticated
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
      setSource(payload.source);
      setCached(payload.cached);
      setWarning(payload.warning ?? payload.enrichWarning ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setItems([]);
      setBoard(createDefaultBoard(seasonYear, season, []));
      setSource(null);
      setCached(false);
    } finally {
      setLoading(false);
    }
  }, [authStatus, isAuthenticated, season, seasonYear, storageKey]);

  useEffect(() => {
    void loadAnime();
  }, [loadAnime]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatusMap({});
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!board) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(board));

    if (!isAuthenticated) {
      setSaveState("local");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSaveState("saving");
      void saveRemoteBoard(board, controller.signal)
        .then(() => setSaveState("saved"))
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

  function updateBoard(updater: (current: BoardState) => BoardState) {
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
    const activeId = String(event.active.id);

    dragOriginTierIdRef.current = board
      ? findTierIdByItemId(board.tiers, activeId)
      : null;
    setActiveItemId(activeId);
  }

  function handleDragOver(event: DragOverEvent) {
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
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const originTierId = dragOriginTierIdRef.current;

    setActiveItemId(null);
    dragOriginTierIdRef.current = null;

    if (!overId || !board) {
      return;
    }

    updateBoard((current) => {
      const currentTierId = findTierIdByItemId(current.tiers, activeId);

      if (originTierId && currentTierId && originTierId !== currentTierId) {
        return current;
      }

      return moveItemBetweenTiers(current, activeId, overId);
    });
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
    updateBoard((current) => {
      const sourceTierId = findTierIdByItemId(current.tiers, itemId);

      if (!sourceTierId || !isTierId(current.tiers, targetTierId)) {
        return current;
      }

      if (sourceTierId === targetTierId) {
        return current;
      }

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
    setMoveMenuItemId(null);
  }

  async function handleStatusChange(item: AnimeItem, status: ViewingStatus | null) {
    if (!isAuthenticated) {
      void signIn("google");
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
        throw new Error("Failed to save status.");
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError));
    }
  }

  function handleReset() {
    localStorage.removeItem(storageKey);
    setBoard(createDefaultBoard(seasonYear, season, items));
  }

  function handleAutoPublicTier() {
    if (!items.length) {
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

  async function handleExport() {
    if (!boardRef.current) {
      return;
    }

    setExporting(true);

    try {
      await waitForImages(boardRef.current);
      const dataUrl = await toPng(boardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f6f7f8",
        filter: (node) =>
          !(node instanceof HTMLElement && node.classList.contains("no-export"))
      });
      const link = document.createElement("a");
      link.download = `anime-tier-${seasonYear}-${season.toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "PNG出力に失敗しました。"
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleCreateShare() {
    if (!board || !items.length) {
      return;
    }

    if (!isAuthenticated) {
      void signIn("google");
      return;
    }

    setSharing(true);
    setError(null);

    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ board, items })
      });
      const payload = (await response.json()) as ShareApiResponse;

      if (!response.ok || !payload.shareId) {
        throw new Error(payload.error ?? "Failed to create share.");
      }

      const nextShareUrl = `${window.location.origin}/share/${payload.shareId}`;
      setShareUrl(nextShareUrl);
      await navigator.clipboard?.writeText(nextShareUrl);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : String(shareError));
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <h1>今期アニメTier表</h1>
          <div className="status-line">
            {items.length}作品
            {source ? ` / ${source === "anilist" ? "AniList" : "Jikan"}` : ""}
            {cached ? " / キャッシュ" : ""}
          </div>
        </div>

        <div className="control-bar">
          {isAuthenticated ? (
            <>
              <span className="status-line toolbar-status no-export">
                {userLabel} / {getSaveStateLabel(saveState)}
              </span>
              <button
                className="command-button auth-button"
                type="button"
                onClick={() => void signOut()}
                title="ログアウト"
              >
                <span>ログアウト</span>
              </button>
            </>
          ) : (
            <button
              className="command-button emphasis-button auth-button"
              type="button"
              onClick={() => void signIn("google")}
              disabled={authStatus === "loading"}
              title="Googleでログイン"
            >
              <span>Googleログイン</span>
            </button>
          )}

          <label className="field">
            <span>年</span>
            <select
              value={seasonYear}
              onChange={(event) => setSeasonYear(Number(event.target.value))}
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
              onChange={(event) => setSeason(event.target.value as AnimeSeason)}
            >
              {SEASONS.map((option) => (
                <option key={option} value={option}>
                  {SEASON_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-chip-group no-export" aria-label="表示フィルター">
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
            className="command-button"
            type="button"
            onClick={() => void loadAnime()}
            disabled={loading}
            title="再取得"
          >
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>再取得</span>
          </button>

          <button
            className="command-button"
            type="button"
            onClick={handleAddTier}
            disabled={!board}
            title="Tierを追加"
          >
            <Plus size={18} />
            <span>Tier追加</span>
          </button>

          <button
            className="command-button emphasis-button"
            type="button"
            onClick={handleAutoPublicTier}
            disabled={!board || loading || !items.length}
            title="人気順で自動的にTier配置"
          >
            <Sparkles size={18} />
            <span>出刃表</span>
          </button>

          <button
            className="command-button"
            type="button"
            onClick={() => void handleExport()}
            disabled={!board || exporting}
            title="Tier表をPNGで出力"
          >
            {exporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
            <span>表出力</span>
          </button>

          <button
            className="command-button"
            type="button"
            onClick={() => void handleCreateShare()}
            disabled={!board || sharing || loading || !items.length}
            title="共有URLを作成"
          >
            {sharing ? <Loader2 className="spin" size={18} /> : <Share2 size={18} />}
            <span>共有</span>
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={handleReset}
            disabled={!board}
            title="リセット"
          >
            <RotateCcw size={18} />
          </button>
          <a
            className="icon-button nav-icon-link"
            href="/dashboard"
            title="分析"
            aria-label="分析ページを開く"
          >
            <BarChart3 size={18} />
          </a>
          <a
            className="icon-button nav-icon-link"
            href="/watchlist"
            title="視聴管理"
            aria-label="視聴管理ページを開く"
          >
            <ListChecks size={18} />
          </a>
          <a
            className="icon-button nav-icon-link"
            href="/explore"
            title="過去作品探索"
            aria-label="過去作品探索ページを開く"
          >
            <Compass size={18} />
          </a>
          <a
            className="icon-button nav-icon-link"
            href="/voice-actors"
            title="声優"
            aria-label="声優ページを開く"
          >
            <Mic2 size={18} />
          </a>
          <a
            className="icon-button nav-icon-link nav-updates-link"
            href="/updates"
            title="更新情報"
            aria-label="更新情報を見る"
          >
            <Megaphone size={18} />
            <span className="nav-updates-dot" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="app-main">
        {warning ? <div className="notice warning">{warning}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {shareUrl ? (
          <div className="notice success">
            共有URLをコピーしました:{" "}
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
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
            <div ref={boardRef} className="export-surface">
              <div className="export-heading">
                <strong>
                  {seasonYear}年 {SEASON_LABELS[season]}アニメ
                </strong>
              </div>

              <div className="tier-list">
                {rankedTiers.map((tier) => (
                  <TierLane
                    key={tier.id}
                    tier={tier}
                    itemMap={itemMap}
                    editable
                    onRename={handleRenameTier}
                    onColor={handleColorTier}
                    onDelete={handleDeleteTier}
                    onOpenMoveMenu={setMoveMenuItemId}
                    statusMap={statusMap}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </div>
          </section>

          {unrankedTier ? (
            <section className="pool-section" aria-label="未分類">
              <TierLane
                tier={unrankedTier}
                itemMap={itemMap}
                pool
                onRename={handleRenameTier}
                onColor={handleColorTier}
                onDelete={handleDeleteTier}
                onOpenMoveMenu={setMoveMenuItemId}
                statusMap={statusMap}
                onStatusChange={handleStatusChange}
              />
            </section>
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
  onMove,
  onStatusChange,
  onClose
}: {
  item: AnimeItem;
  tiers: TierRow[];
  currentTierId: string | null;
  status: ViewingStatus | null;
  onMove: (itemId: string, tierId: string) => void;
  onStatusChange: (item: AnimeItem, status: ViewingStatus | null) => void;
  onClose: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
        className="move-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="移動先を選択"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="move-sheet-preview">
          <AnimeCardPlaceholder title={item.title} draggable={false} />
          <div>
            <strong>{item.title}</strong>
            <span>移動先を選択</span>
          </div>
        </div>

        <StatusChips
          className="move-status-chips"
          status={status}
          onChange={(nextStatus) => onStatusChange(item, nextStatus)}
        />

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
          キャンセル
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
  onOpenMoveMenu,
  statusMap,
  onStatusChange
}: {
  tier: TierRow;
  itemMap: Map<string, AnimeItem>;
  editable?: boolean;
  pool?: boolean;
  onRename: (tierId: string, label: string) => void;
  onColor: (tierId: string, color: string) => void;
  onDelete: (tierId: string) => void;
  onOpenMoveMenu: (itemId: string) => void;
  statusMap: Record<string, ViewingStatus>;
  onStatusChange: (item: AnimeItem, status: ViewingStatus | null) => void;
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
                compact={!pool}
                onOpenMoveMenu={onOpenMoveMenu}
                status={statusMap[item.id] ?? null}
                onStatusChange={onStatusChange}
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
              onClick={() => onDelete(tier.id)}
              title="Tierを削除"
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
  compact = false,
  onOpenMoveMenu,
  status,
  onStatusChange
}: {
  item: AnimeItem;
  compact?: boolean;
  onOpenMoveMenu: (itemId: string) => void;
  status: ViewingStatus | null;
  onStatusChange: (item: AnimeItem, status: ViewingStatus | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      data: {
        type: "anime-card"
      }
    });
  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.35 : 1
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "sortable-card-shell is-dragging" : "sortable-card-shell"}
      style={style}
      onClick={() => {
        if (!isDragging) {
          onOpenMoveMenu(item.id);
        }
      }}
      {...attributes}
      {...listeners}
    >
      <AnimeCard
        item={item}
        compact={compact}
        status={status}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}

function AnimeCard({
  item,
  overlay = false,
  compact = false,
  status = null,
  onStatusChange
}: {
  item: AnimeItem;
  overlay?: boolean;
  compact?: boolean;
  status?: ViewingStatus | null;
  onStatusChange?: (item: AnimeItem, status: ViewingStatus | null) => void;
}) {
  return (
    <article
      className={[
        "anime-card",
        overlay ? "is-overlay" : "",
        compact ? "is-compact" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <AnimeCardPlaceholder title={item.title} draggable={false} />
      {!compact ? (
        <div className="anime-meta">
        <div className="anime-title" title={item.title}>
          {item.title}
        </div>
        <div className="anime-subline">
          <span>{item.format ?? "ANIME"}</span>
          <a
            href={item.siteUrl}
            target="_blank"
            rel="noreferrer"
            title="外部リンク"
            aria-label={`${item.title}の外部リンク`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink size={13} />
          </a>
        </div>
        <ReputationBadges item={item} />
        <AiringBadges item={item} />
        <StreamingPlatformLinks item={item} />
        {item.streamingProvidersJp?.flatrate?.length ? (
          <div className="flatrate-candidates" title="TMDb / JustWatchベースの見放題候補">
            見放題候補: {item.streamingProvidersJp.flatrate.slice(0, 3).map((p) => p.name).join(" / ")}
          </div>
        ) : null}
        {onStatusChange ? (
          <StatusChips
            status={status}
            compact
            onChange={(nextStatus) => onStatusChange(item, nextStatus)}
          />
        ) : null}
        </div>
      ) : null}
    </article>
  );
}

function StatusChips({
  status,
  compact = false,
  className = "",
  onChange
}: {
  status: ViewingStatus | null;
  compact?: boolean;
  className?: string;
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
        onClick={() => onChange(null)}
      >
        未設定
      </button>
      {viewingStatusOptions.map((option) => (
        <button
          key={option.value}
          className={status === option.value ? "status-chip is-active" : "status-chip"}
          type="button"
          onClick={() => onChange(option.value)}
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
        </a>
      ))}
    </div>
  );
}

function StreamingPlatformLinks({ item }: { item: AnimeItem }) {
  const platforms = getStreamingPlatforms(item);
  const visiblePlatforms = platforms.slice(0, 2);
  const remainingCount = Math.max(0, platforms.length - visiblePlatforms.length);

  if (!visiblePlatforms.length) {
    return null;
  }

  return (
    <div className="streaming-links">
      {visiblePlatforms.map((platform) => (
        <a
          key={`${platform.name}:${platform.url}`}
          href={platform.url}
          target="_blank"
          rel="noreferrer"
          title={`${platform.name}で配信候補を見る`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <PlayCircle size={11} />
          <span>{platform.name}</span>
        </a>
      ))}
      {remainingCount ? <span className="streaming-more">+{remainingCount}</span> : null}
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
          <Star size={11} />
          {score}
        </span>
      ) : null}
      {audience ? (
        <span aria-label={`人気 ${audience}`}>
          <TrendingUp size={11} />
          {audience}
        </span>
      ) : null}
      {momentum ? (
        <span aria-label={`お気に入り ${momentum}`}>
          <Heart size={11} />
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

function getStreamingPlatforms(item: AnimeItem) {
  if (item.streamingPlatforms?.length) {
    return item.streamingPlatforms.filter((platform) => platform.url && platform.name);
  }

  if (item.streamingProvidersJp?.flatrate?.length) {
    const link = item.streamingProvidersJp.providerLink ?? "#";
    return item.streamingProvidersJp.flatrate
      .slice(0, 5)
      .map((provider) => ({ name: provider.name, url: link }));
  }

  const platforms = new Map<string, { name: string; url: string }>();
  for (const episode of item.streamingEpisodes ?? []) {
    if (!episode.url) {
      continue;
    }

    const name = episode.site?.trim() || getHostLabel(episode.url);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (!platforms.has(key)) {
      platforms.set(key, { name, url: episode.url });
    }
  }

  return Array.from(platforms.values()).slice(0, 5);
}

function getHostLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const [label] = host.split(".");
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
  } catch {
    return null;
  }
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
    getAudienceValue(b) - getAudienceValue(a) ||
    (b.reputation?.favourites ?? 0) - (a.reputation?.favourites ?? 0) ||
    (b.reputation?.trending ?? 0) - (a.reputation?.trending ?? 0) ||
    getNormalizedScore(b) - getNormalizedScore(a) ||
    a.title.localeCompare(b.title, "ja")
  );
}

function getAudienceValue(item: AnimeItem): number {
  const reputation = item.reputation;

  if (!reputation) {
    return 0;
  }

  if (typeof reputation.members === "number") {
    return reputation.members;
  }

  if (item.source === "jikan" && typeof reputation.popularity === "number") {
    return 1_000_000 / Math.max(1, reputation.popularity);
  }

  return reputation.popularity ?? 0;
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
  if (state === "saved") return "Turso保存済み";
  if (state === "error") return "保存失敗";
  return "ローカル保存";
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

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    })
  );
}
