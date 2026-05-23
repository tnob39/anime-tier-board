"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
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
import {
  Download,
  ExternalLink,
  Heart,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  TrendingUp,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentAnimeSeason } from "@/lib/season";
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
  error?: string;
};

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
  const [exporting, setExporting] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragOriginTierIdRef = useRef<string | null>(null);

  const storageKey = useMemo(
    () => getStorageKey(seasonYear, season),
    [seasonYear, season]
  );

  const itemMap = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const activeItem = activeItemId ? itemMap.get(activeItemId) ?? null : null;
  const unrankedTier = board?.tiers.find((tier) => tier.id === UNRANKED_TIER_ID);
  const rankedTiers =
    board?.tiers.filter((tier) => tier.id !== UNRANKED_TIER_ID) ?? [];
  const tierIdSet = useMemo(
    () => new Set(board?.tiers.map((tier) => tier.id) ?? []),
    [board?.tiers]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
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
      const storedBoard = readStoredBoard(storageKey);
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
      setWarning(payload.warning ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setItems([]);
      setBoard(createDefaultBoard(seasonYear, season, []));
      setSource(null);
      setCached(false);
    } finally {
      setLoading(false);
    }
  }, [season, seasonYear, storageKey]);

  useEffect(() => {
    void loadAnime();
  }, [loadAnime]);

  useEffect(() => {
    if (!board) {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(board));
  }, [board, storageKey]);

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
            className="icon-button"
            type="button"
            onClick={handleReset}
            disabled={!board}
            title="リセット"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <main className="app-main">
        {warning ? <div className="notice warning">{warning}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

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
              />
            </section>
          ) : null}

          <DragOverlay>
            {activeItem ? <AnimeCard item={activeItem} overlay /> : null}
          </DragOverlay>
        </DndContext>
      </main>
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
  onDelete
}: {
  tier: TierRow;
  itemMap: Map<string, AnimeItem>;
  editable?: boolean;
  pool?: boolean;
  onRename: (tierId: string, label: string) => void;
  onColor: (tierId: string, color: string) => void;
  onDelete: (tierId: string) => void;
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
            items.map((item) => <SortableAnimeCard key={item.id} item={item} />)
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

function SortableAnimeCard({ item }: { item: AnimeItem }) {
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
      {...attributes}
      {...listeners}
    >
      <AnimeCard item={item} />
    </div>
  );
}

function AnimeCard({ item, overlay = false }: { item: AnimeItem; overlay?: boolean }) {
  return (
    <article className={overlay ? "anime-card is-overlay" : "anime-card"}>
      <img src={item.proxiedImageUrl} alt={item.title} draggable={false} />
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
      </div>
    </article>
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
