import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginPanel } from '@/components/LoginPanel';
import { MoveItemSheet } from '@/components/MoveItemSheet';
import { TierLane } from '@/components/TierLane';
import { useAuth } from '@/contexts/auth-context';
import { useStatuses } from '@/hooks/use-statuses';
import { filterAnimeItems } from '@/lib/anime-filters';
import { fetchRemoteBoard, fetchSeasonalAnime, saveRemoteBoard } from '@/lib/api-client';
import {
  createDefaultBoard,
  findTierIdByItemId,
  getStorageKey,
  moveItemToTier,
  reconcileBoard,
  UNRANKED_TIER_ID,
  type BoardState,
} from '@/lib/board';
import { readStoredBoard, writeStoredBoard } from '@/lib/board-storage';
import { getCurrentAnimeSeason } from '@/lib/season';
import { SEASON_LABELS, type AnimeItem, type AnimeSeason } from '@/lib/types';

export default function TierBoardScreen() {
  const { user, token, handleUnauthorized } = useAuth();
  const { statusMap, savingId, updateStatus, error: statusError } = useStatuses();
  const currentSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const [seasonYear, setSeasonYear] = useState(currentSeason.year);
  const [season, setSeason] = useState<AnimeSeason>(currentSeason.season);
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'local' | 'saving' | 'saved' | 'error'>('local');
  const [moveMenuItemId, setMoveMenuItemId] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);

  const storageKey = useMemo(() => getStorageKey(seasonYear, season), [seasonYear, season]);
  const isAuthenticated = Boolean(user && token);

  const visibleItems = useMemo(
    () => filterAnimeItems(items, { hideMovies, hideRerunCandidates, seasonYear }),
    [hideMovies, hideRerunCandidates, items, seasonYear]
  );
  const itemMap = useMemo(
    () => new Map(visibleItems.map((item) => [item.id, item])),
    [visibleItems]
  );
  const visibleItemIds = useMemo(() => new Set(visibleItems.map((item) => item.id)), [visibleItems]);

  const visibleTiers = useMemo(
    () =>
      board?.tiers.map((tier) => ({
        ...tier,
        itemIds: tier.itemIds.filter((itemId) => visibleItemIds.has(itemId)),
      })) ?? [],
    [board?.tiers, visibleItemIds]
  );
  const rankedTiers = visibleTiers.filter((tier) => tier.id !== UNRANKED_TIER_ID);
  const unrankedTier = visibleTiers.find((tier) => tier.id === UNRANKED_TIER_ID);
  const moveMenuItem = moveMenuItemId ? itemMap.get(moveMenuItemId) ?? null : null;
  const moveMenuCurrentTierId =
    board && moveMenuItemId ? findTierIdByItemId(board.tiers, moveMenuItemId) : null;

  const yearOptions = useMemo(() => {
    const start = currentSeason.year - 3;
    return Array.from({ length: 8 }, (_, index) => start + index);
  }, [currentSeason.year]);

  const loadAnime = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const payload = await fetchSeasonalAnime(seasonYear, season, token, handleUnauthorized);
      const nextItems = payload.items;
      const storedBoard = isAuthenticated && token
        ? (await fetchRemoteBoard(seasonYear, season, token, handleUnauthorized)) ??
          (await readStoredBoard(storageKey))
        : await readStoredBoard(storageKey);
      const nextBoard = reconcileBoard(
        storedBoard ?? createDefaultBoard(seasonYear, season, nextItems),
        nextItems,
        seasonYear,
        season
      );

      setItems(nextItems);
      setBoard(nextBoard);
      setSource(payload.source);
      setWarning(payload.warning ?? payload.enrichWarning ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setItems([]);
      setBoard(createDefaultBoard(seasonYear, season, []));
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [seasonYear, season, token, isAuthenticated, storageKey, handleUnauthorized]);

  useEffect(() => {
    void loadAnime();
  }, [loadAnime]);

  useEffect(() => {
    if (!board) {
      return;
    }

    void writeStoredBoard(storageKey, board);

    if (!isAuthenticated || !token) {
      setSaveState('local');
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveAbortRef.current?.abort();

    saveTimeoutRef.current = setTimeout(() => {
      setSaveState('saving');
      void saveRemoteBoard(board, token, handleUnauthorized)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [board, isAuthenticated, token, storageKey, handleUnauthorized]);

  function handleMoveItemToTier(itemId: string, targetTierId: string) {
    setBoard((current) => (current ? moveItemToTier(current, itemId, targetTierId) : current));
    setMoveMenuItemId(null);
  }

  async function handleStatusChange(status: Parameters<typeof updateStatus>[1]) {
    if (!moveMenuItem) {
      return;
    }

    try {
      await updateStatus(moveMenuItem, status);
    } catch {
      // error surfaced via useStatuses
    }
  }

  const saveStateLabel =
    saveState === 'saving'
      ? '保存中...'
      : saveState === 'saved'
        ? 'クラウド保存済み'
        : saveState === 'error'
          ? '保存エラー'
          : 'ローカル保存';

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4 pb-8">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white">今期アニメ Tier 表</Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {items.length}作品
            {source ? ` / ${source === 'anilist' ? 'AniList' : 'Jikan'}` : ''}
            {isAuthenticated ? ` / ${saveStateLabel}` : ''}
          </Text>
        </View>

        {!user ? (
          <LoginPanel
            title="ログインして同期"
            description="Tier 表と視聴ステータスをクラウドに保存するにはログインが必要です。未ログインでもローカルで利用できます。"
          />
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {yearOptions.map((year) => (
            <Pressable
              key={year}
              onPress={() => setSeasonYear(year)}
              className={`px-3 py-1.5 rounded-full border ${
                seasonYear === year
                  ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white'
                  : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  seasonYear === year ? 'text-white dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {year}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {(['WINTER', 'SPRING', 'SUMMER', 'FALL'] as AnimeSeason[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setSeason(option)}
              className={`px-3 py-1.5 rounded-full border ${
                season === option
                  ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white'
                  : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  season === option ? 'text-white dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {SEASON_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => setHideMovies((current) => !current)}
            className={`px-3 py-1.5 rounded-full border ${
              hideMovies
                ? 'bg-violet-100 border-violet-300 dark:bg-violet-900 dark:border-violet-700'
                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
            }`}
          >
            <Text className="text-xs text-zinc-700 dark:text-zinc-200">映画OFF</Text>
          </Pressable>
          <Pressable
            onPress={() => setHideRerunCandidates((current) => !current)}
            className={`px-3 py-1.5 rounded-full border ${
              hideRerunCandidates
                ? 'bg-violet-100 border-violet-300 dark:bg-violet-900 dark:border-violet-700'
                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
            }`}
          >
            <Text className="text-xs text-zinc-700 dark:text-zinc-200">旧作OFF</Text>
          </Pressable>
          <Pressable
            onPress={() => void loadAnime()}
            disabled={loading}
            className="px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-white active:opacity-80 disabled:opacity-50"
          >
            <Text className="text-xs font-medium text-white dark:text-zinc-900">
              {loading ? '取得中...' : '再取得'}
            </Text>
          </Pressable>
        </View>

        {warning ? (
          <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-3 rounded-xl">
            <Text className="text-amber-800 dark:text-amber-200 text-sm">{warning}</Text>
          </View>
        ) : null}

        {error || statusError ? (
          <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
            <Text className="text-red-700 dark:text-red-300 text-sm">{error ?? statusError}</Text>
          </View>
        ) : null}

        {loading && !board ? (
          <View className="items-center py-8 gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-zinc-500">アニメを読み込み中...</Text>
          </View>
        ) : null}

        {board ? (
          <View className="gap-1">
            <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 px-1">
              {seasonYear}年 {SEASON_LABELS[season]}アニメ
            </Text>
            <Text className="text-xs text-zinc-500 px-1 mb-1">カードをタップして Tier 移動</Text>
            {rankedTiers.map((tier) => (
              <TierLane
                key={tier.id}
                tier={tier}
                itemMap={itemMap}
                statusMap={statusMap}
                onOpenMoveMenu={setMoveMenuItemId}
              />
            ))}
          </View>
        ) : null}

        {board && unrankedTier ? (
          <View className="gap-1 mt-2">
            <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 px-1">未分類</Text>
            <TierLane
              tier={unrankedTier}
              itemMap={itemMap}
              statusMap={statusMap}
              pool
              onOpenMoveMenu={setMoveMenuItemId}
            />
          </View>
        ) : null}
      </ScrollView>

      <MoveItemSheet
        visible={Boolean(moveMenuItem)}
        item={moveMenuItem}
        tiers={board?.tiers ?? []}
        currentTierId={moveMenuCurrentTierId}
        status={moveMenuItem ? statusMap[moveMenuItem.id] ?? null : null}
        saving={moveMenuItem ? savingId === moveMenuItem.id : false}
        onMove={handleMoveItemToTier}
        onStatusChange={(nextStatus) => void handleStatusChange(nextStatus)}
        onClose={() => setMoveMenuItemId(null)}
      />
    </SafeAreaView>
  );
}