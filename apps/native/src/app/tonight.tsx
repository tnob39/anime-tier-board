import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginPanel } from '@/components/LoginPanel';
import { useAuth } from '@/contexts/auth-context';
import { useStatuses } from '@/hooks/use-statuses';
import { selectTonightCandidates, type TonightMode } from '@/lib/tonight-watch';

export default function TonightScreen() {
  const { user } = useAuth();
  const { records, loading, error } = useStatuses();
  const [mode, setMode] = useState<TonightMode>('continue');

  const candidates = useMemo(() => selectTonightCandidates(records, mode), [records, mode]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4 pb-8">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white">今夜何見る？</Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            視聴リズムに合わせて今夜の候補を表示します。
          </Text>
        </View>

        {!user ? (
          <LoginPanel
            title="ログインが必要です"
            description="今夜の候補を表示するにはログインしてください。"
          />
        ) : null}

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setMode('continue')}
            className={`px-3 py-1.5 rounded-full border ${
              mode === 'continue'
                ? 'bg-violet-600 border-violet-600'
                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                mode === 'continue' ? 'text-white' : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              続きを見る
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('finish')}
            className={`px-3 py-1.5 rounded-full border ${
              mode === 'finish'
                ? 'bg-violet-600 border-violet-600'
                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                mode === 'finish' ? 'text-white' : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              今夜完結したい
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View className="items-center py-8 gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-zinc-500">候補を読み込み中...</Text>
          </View>
        ) : null}

        {error ? (
          <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
            <Text className="text-red-700 dark:text-red-300 text-sm">{error}</Text>
          </View>
        ) : null}

        {user && !loading && candidates.length === 0 ? (
          <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 gap-2">
            <Text className="text-base font-semibold text-zinc-800 dark:text-zinc-200">候補がありません</Text>
            <Text className="text-sm text-zinc-500">
              視聴中の作品を追加するか、別モードを試してください。
            </Text>
          </View>
        ) : null}

        {candidates.map((candidate) => (
          <View
            key={candidate.record.animeId}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-2"
          >
            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {candidate.record.anime?.title}
            </Text>
            <Text className="text-sm text-zinc-600 dark:text-zinc-300">{candidate.reason}</Text>
            {candidate.tags.length ? (
              <View className="flex-row flex-wrap gap-2">
                {candidate.tags.map((tag) => (
                  <View
                    key={tag}
                    className="px-2 py-1 rounded-full bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800"
                  >
                    <Text className="text-xs text-violet-700 dark:text-violet-200">{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}