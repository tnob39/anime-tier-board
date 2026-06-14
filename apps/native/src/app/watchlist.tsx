import { Image } from 'expo-image';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginPanel } from '@/components/LoginPanel';
import { StatusChips } from '@/components/StatusChips';
import { useAuth } from '@/contexts/auth-context';
import { useStatuses } from '@/hooks/use-statuses';
import { STATUS_LABELS } from '@/lib/statuses';

export default function WatchlistScreen() {
  const { user } = useAuth();
  const { records, loading, savingId, error, updateStatus } = useStatuses();
  const visibleItems = records.filter((record) => record.anime);

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4 pb-8">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white">視聴管理</Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            見たい / 視聴中 / 完了 などのステータスを変更できます。
          </Text>
        </View>

        {!user ? (
          <LoginPanel
            title="ログインが必要です"
            description="視聴ステータスの表示・変更にはログインが必要です。"
          />
        ) : null}

        {loading ? (
          <View className="items-center py-8 gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-zinc-500">読み込み中...</Text>
          </View>
        ) : null}

        {error ? (
          <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
            <Text className="text-red-700 dark:text-red-300 text-sm">{error}</Text>
          </View>
        ) : null}

        {user && !loading && !visibleItems.length ? (
          <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 items-center gap-2">
            <Text className="text-base font-semibold text-zinc-800 dark:text-zinc-200">まだ作品がありません</Text>
            <Text className="text-sm text-zinc-500 text-center">
              Explore 画面や Tier 表から「見たい」を追加してください。
            </Text>
          </View>
        ) : null}

        {visibleItems.map((record) => {
          const anime = record.anime!;
          const imageUrl = anime.proxiedImageUrl || anime.imageUrl;
          const saving = savingId === record.animeId;

          return (
            <View
              key={record.animeId}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-3"
            >
              <View className="flex-row gap-3">
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={{ width: 56, height: 76, borderRadius: 8 }} />
                ) : (
                  <View className="w-14 h-[76px] rounded-lg bg-zinc-200 dark:bg-zinc-700" />
                )}
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100" numberOfLines={2}>
                    {anime.title}
                  </Text>
                  <Text className="text-xs text-zinc-500">
                    現在: {STATUS_LABELS[record.status]}
                    {saving ? ' / 保存中...' : ''}
                  </Text>
                </View>
              </View>

              <StatusChips
                status={record.status}
                onChange={(nextStatus) => void updateStatus(anime, nextStatus)}
                disabled={saving}
                allowClear
              />
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}