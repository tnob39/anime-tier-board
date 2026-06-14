import type { AnimeItem, AnimeSeason } from '@/lib/types';

export const STORAGE_VERSION = 1;
export const STORAGE_PREFIX = 'anime-tier-board:v1';
export const UNRANKED_TIER_ID = 'tier-unranked';

export type TierRow = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
  locked?: boolean;
};

export type BoardState = {
  version: typeof STORAGE_VERSION;
  season: AnimeSeason;
  seasonYear: number;
  tiers: TierRow[];
  updatedAt: string;
};

const defaultTierTemplates: Array<Omit<TierRow, 'itemIds'>> = [
  { id: 'tier-s', label: 'S', color: '#f87171' },
  { id: 'tier-a', label: 'A', color: '#fbbf24' },
  { id: 'tier-b', label: 'B', color: '#34d399' },
  { id: 'tier-c', label: 'C', color: '#60a5fa' },
  { id: 'tier-d', label: 'D', color: '#a78bfa' },
  { id: UNRANKED_TIER_ID, label: '未分類', color: '#9ca3af', locked: true },
];

export function getStorageKey(year: number, season: AnimeSeason): string {
  return `${STORAGE_PREFIX}:${year}:${season}`;
}

export function createDefaultBoard(
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
      itemIds: template.id === UNRANKED_TIER_ID ? items.map((item) => item.id) : [],
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function reconcileBoard(
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

    return { ...tier, itemIds };
  });

  const unranked = tiers.find((tier) => tier.id === UNRANKED_TIER_ID);
  const missingItemIds = items.map((item) => item.id).filter((itemId) => !usedItemIds.has(itemId));

  if (unranked) {
    unranked.itemIds = [...unranked.itemIds, ...missingItemIds];
  }

  return {
    ...board,
    version: STORAGE_VERSION,
    season,
    seasonYear,
    tiers,
    updatedAt: new Date().toISOString(),
  };
}

export function findTierIdByItemId(tiers: TierRow[], itemId: string): string | null {
  for (const tier of tiers) {
    if (tier.itemIds.includes(itemId)) {
      return tier.id;
    }
  }
  return null;
}

export function moveItemToTier(board: BoardState, itemId: string, targetTierId: string): BoardState {
  const sourceTierId = findTierIdByItemId(board.tiers, itemId);
  if (!sourceTierId || sourceTierId === targetTierId) {
    return board;
  }

  return {
    ...board,
    tiers: board.tiers.map((tier) => {
      if (tier.id === sourceTierId) {
        return { ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) };
      }
      if (tier.id === targetTierId) {
        return { ...tier, itemIds: [...tier.itemIds, itemId] };
      }
      return tier;
    }),
    updatedAt: new Date().toISOString(),
  };
}

function ensureUnrankedTier(tiers: TierRow[]): TierRow[] {
  if (tiers.some((tier) => tier.id === UNRANKED_TIER_ID)) {
    return tiers;
  }

  const unranked = defaultTierTemplates.find((tier) => tier.id === UNRANKED_TIER_ID);
  return unranked ? [...tiers, { ...unranked, itemIds: [] }] : tiers;
}

export function isBoardState(value: unknown): value is BoardState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const board = value as BoardState;
  return (
    board.version === STORAGE_VERSION &&
    typeof board.seasonYear === 'number' &&
    typeof board.season === 'string' &&
    Array.isArray(board.tiers)
  );
}