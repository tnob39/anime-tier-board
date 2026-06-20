import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginPanel } from '@/components/LoginPanel';
import { useAuth } from '@/contexts/auth-context';
import { useStatuses } from '@/hooks/use-statuses';
import { filterAnimeItems } from '@/lib/anime-filters';
import { fetchSeasonalAnime } from '@/lib/api-client';
import {
  buildPreferences,
  formatNumber,
  formatScore,
  rankItems,
  type SortMode,
} from '@/lib/explore-ranking';
import { STATUS_LABELS } from '@/lib/statuses';
import { SEASON_LABELS, SEASONS, type AnimeItem, type AnimeSeason } from '@/lib/types';

export default function ExploreScreen() {
  const { user, token, handleUnauthorized } = useAuth();
  const { records, statusMap, savingId, updateStatus, error: statusError } = useStatuses();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 10);
  const [season, setSeason] = useState<AnimeSeason>('SPRING');
  const [sortMode, setSortMode] = useState<SortMode>('fit');
  const [items, setItems] = useState<AnimeItem[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hideMovies, setHideMovies] = useState(false);
  const [hideRerunCandidates, setHideRerunCandidates] = useState(false);
  const [onlyInstantWatch, setOnlyInstantWatch] = useState(false);
  const loadGenerationRef = useRef(0);

  const preferences = useMemo(() => buildPreferences(records), [records]);
  const yearOptions = useMemo(() => {
    const start = 1990;
    return Array.from({ length: currentYear - start + 1 }, (_, index) => currentYear - index);
  }, [currentYear]);

  const filteredItems = useMemo(
    () =>
      filterAnimeItems(items, {
        hideMovies,
        hideRerunCandidates,
        seasonYear: year,
        onlyInstantWatch,
      }),
    [hideMovies, hideRerunCandidates, items, year, onlyInstantWatch]
  );

  const rankedItems = useMemo(
    () => rankItems(filteredItems, preferences, statusMap, sortMode),
    [filteredItems, preferences, statusMap, sortMode]
  );

  async function loadSeason() {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setLoading(true);
    setMessage(null);

    try {
      const payload = await fetchSeasonalAnime(year, season, token, handleUnauthorized);
      if (generation !== loadGenerationRef.current) {
        return;
      }

      setItems(payload.items);
      setSource(payload.source);
      setMessage(payload.warning ?? null);
    } catch (error) {
      if (generation !== loadGenerationRef.current) {
        return;
      }

      setMessage(error instanceof Error ? error.message : '作品の取得に失敗しました。');
      setItems([]);
      setSource(null);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  async function addToWatchlist(item: AnimeItem) {
    if (!user || !token) {
      setMessage('視聴管理に追加するにはログインが必要です。');
      return;
    }

    try {
      await updateStatus(item, 'planned');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '視聴管理への追加に失敗しました。');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4 pb-8">
        <View className="gap-1">
          <Text className="text-xs text-violet-600 dark:text-violet-300 font-medium">過去作品探索</Text>
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white">次に見る候補を探す</Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            選んだ年・期の作品を、人気・評価・あなたの好みで並べます。
          </Text>
        </View>

        {!user ? (
          <LoginPanel
            title="ログインしておすすめを表示"
            description="視聴履歴に基づくおすすめ順にはログインが必要です。未ログインでも作品一覧は取得できます。"
          />
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {yearOptions.slice(0, 12).map((option) => (
            <Pressable
              key={option}
              onPress={() => setYear(option)}
              className={`px-3 py-1.5 rounded-full border ${
                year === option
                  ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white'
                  : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  year === option ? 'text-white dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {yearOptions.slice(12).map((option) => (
            <Pressable
              key={option}
              onPress={() => setYear(option)}
              className={`px-3 py-1.5 rounded-full border ${
                year === option
                  ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white'
                  : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  year === option ? 'text-white dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View className="flex-row flex-wrap gap-2">
          {SEASONS.map((option) => (
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
          {(
            [
              ['fit', 'おすすめ'],
              ['popularity', '人気'],
              ['score', '評価'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setSortMode(value)}
              className={`px-3 py-1.5 rounded-full border ${
                sortMode === value
                  ? 'bg-violet-600 border-violet-600'
                  : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  sortMode === value ? 'text-white' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          <FilterChip label="映画OFF" active={hideMovies} onPress={() => setHideMovies((v) => !v)} />
          <FilterChip
            label="旧作OFF"
            active={hideRerunCandidates}
            onPress={() => setHideRerunCandidates((v) => !v)}
          />
          <FilterChip
            label="今すぐ見放題"
            active={onlyInstantWatch}
            onPress={() => setOnlyInstantWatch((v) => !v)}
          />
          <Pressable
            onPress={() => void loadSeason()}
            disabled={loading}
            className="px-4 py-1.5 rounded-full bg-zinc-900 dark:bg-white active:opacity-80 disabled:opacity-50"
          >
            <Text className="text-xs font-medium text-white dark:text-zinc-900">
              {loading ? '取得中...' : '探す'}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View className="items-center py-6 gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-zinc-500">作品を取得中...</Text>
          </View>
        ) : null}

        {message || statusError ? (
          <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-3 rounded-xl">
            <Text className="text-amber-800 dark:text-amber-200 text-sm">{message ?? statusError}</Text>
          </View>
        ) : null}

        {source ? (
          <Text className="text-xs text-zinc-500">
            データ元: {source === 'anilist' ? 'AniList' : 'Jikan'}
          </Text>
        ) : null}

        {rankedItems.length ? (
          <View className="gap-3">
            {rankedItems.map((entry, index) => {
              const imageUrl = entry.item.proxiedImageUrl || entry.item.imageUrl;
              const currentStatus = statusMap[entry.item.id];

              return (
                <View
                  key={entry.item.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 140 }} contentFit="cover" />
                  ) : (
                    <View className="h-[140px] bg-zinc-200 dark:bg-zinc-700" />
                  )}
                  <View className="p-4 gap-2">
                    <Text className="text-xs text-violet-600 dark:text-violet-300 font-semibold">
                      #{index + 1}
                    </Text>
                    <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {entry.item.title}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      <Badge text={`人気 ${formatNumber(entry.item.popularity)}`} />
                      <Badge text={`評価 ${formatScore(entry.item)}`} />
                      <Badge text={`Fit ${entry.fitScore}`} />
                    </View>
                    <Text className="text-sm text-zinc-600 dark:text-zinc-400">{entry.reason}</Text>
                    <View className="flex-row flex-wrap gap-2 pt-1">
                      {currentStatus ? (
                        <View className="px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900">
                          <Text className="text-xs text-emerald-700 dark:text-emerald-200">
                            {STATUS_LABELS[currentStatus]}
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => void addToWatchlist(entry.item)}
                          disabled={savingId === entry.item.id}
                          className="px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-white active:opacity-80 disabled:opacity-50"
                        >
                          <Text className="text-xs font-medium text-white dark:text-zinc-900">
                            {savingId === entry.item.id ? '追加中...' : '見たい'}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => {
                          void Linking.openURL(entry.item.siteUrl).catch(() => {
                            setMessage('リンクを開けませんでした。');
                          });
                        }}
                        className="px-3 py-1.5 rounded-full border border-zinc-300 dark:border-zinc-600 active:opacity-80"
                      >
                        <Text className="text-xs text-zinc-700 dark:text-zinc-200">詳細</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : !loading ? (
          <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 items-center gap-2">
            <Text className="text-base font-semibold text-zinc-800 dark:text-zinc-200">年代と期を選んで探索</Text>
            <Text className="text-sm text-zinc-500 text-center">
              90年代から現在まで、選んだシーズンの作品を取得してランキングします。
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        active
          ? 'bg-violet-100 border-violet-300 dark:bg-violet-900 dark:border-violet-700'
          : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
      }`}
    >
      <Text className="text-xs text-zinc-700 dark:text-zinc-200">{label}</Text>
    </Pressable>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
      <Text className="text-[10px] text-zinc-600 dark:text-zinc-300">{text}</Text>
    </View>
  );
}