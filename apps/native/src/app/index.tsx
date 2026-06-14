import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimeCard, DemoAnimeItem } from '@/components/AnimeCard';

// API base selection for dev connectivity (iOS sim / web: localhost, Android emulator: 10.0.2.2)
const API_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const SAMPLE_ITEMS: DemoAnimeItem[] = [
  {
    id: 'demo-1',
    title: '葬送のフリーレン',
    format: 'TV',
  },
  {
    id: 'demo-2',
    title: 'ダンダダン',
    format: 'TV',
    // Use public placeholder image for visual demo (works in Expo)
    imageUrl: 'https://picsum.photos/id/1016/300/200',
  },
];

export default function ExpoPoCScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetchStatuses() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/statuses`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      setResult(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-6 gap-6 max-w-[680px] self-center w-full"
      >
        {/* Header */}
        <View className="items-center gap-1">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Anime Tier Board
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            Expo + EAS PoC (Issue #89)
          </Text>
          <View className="mt-1 px-3 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900">
            <Text className="text-xs text-violet-700 dark:text-violet-300">
              Expo Router v4 + NativeWind
            </Text>
          </View>
        </View>

        {/* Fetch /api/statuses section */}
        <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-3">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            API 疎通確認
          </Text>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            既存 Next.js の <Text className="font-mono text-xs">/api/statuses</Text> へ fetch。
            （認証が必要なため通常エラー応答になりますが、CORS・接続の確認になります）
          </Text>

          <Pressable
            onPress={handleFetchStatuses}
            disabled={loading}
            className="self-start active:opacity-80 bg-zinc-900 dark:bg-white px-4 py-2 rounded-xl"
          >
            <Text className="text-white dark:text-zinc-900 font-medium">
              {loading ? '取得中...' : '/api/statuses をフェッチ'}
            </Text>
          </Pressable>

          {loading && (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-zinc-500">Next サーバー (localhost:3000) 起動中か確認してください</Text>
            </View>
          )}

          {error && (
            <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
              <Text className="text-red-700 dark:text-red-300 text-sm font-medium">エラー</Text>
              <Text className="text-red-600 dark:text-red-400 text-xs mt-1">{error}</Text>
            </View>
          )}

          {result && (
            <View className="bg-zinc-950 rounded-xl p-3">
              <Text className="text-emerald-400 text-xs mb-1">レスポンス</Text>
              <Text className="text-zinc-200 font-mono text-[11px] leading-snug">{result}</Text>
            </View>
          )}

          <Text className="text-[10px] text-zinc-400">
            ベースURL: {API_BASE} （Android エミュレータは 10.0.2.2 自動切替）
          </Text>
        </View>

        {/* Transplanted AnimeCard demo */}
        <View className="gap-3">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AnimeCard 移植サンプル
            </Text>
            <Text className="text-[10px] text-emerald-600 dark:text-emerald-400">components/ 相当</Text>
          </View>
          <Text className="text-xs text-zinc-500 px-1">
            既存 AnimeCardPlaceholder + AnimeCard のロジック（色生成・イニシャル・メタ表示）を NativeWind + RN で再現。
          </Text>

          <View className="items-center gap-4 py-2">
            {SAMPLE_ITEMS.map((item) => (
              <AnimeCard key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Completion notes */}
        <View className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <Text className="font-medium text-sm text-zinc-700 dark:text-zinc-300 mb-2">完了条件チェック</Text>
          <View className="gap-1">
            <Text className="text-xs text-zinc-600 dark:text-zinc-400">• npx expo start で起動 → この画面</Text>
            <Text className="text-xs text-zinc-600 dark:text-zinc-400">• /api/statuses fetch 疎通 → 上部ボタンで確認</Text>
            <Text className="text-xs text-zinc-600 dark:text-zinc-400">• AnimeCard 1個以上描画 → 移植済みカード表示済み</Text>
            <Text className="text-xs text-zinc-600 dark:text-zinc-400">• NativeWind (className) + Expo Router (src/app/ ファイルルーティング) 動作中</Text>
          </View>
          <Text className="mt-3 text-[10px] text-zinc-400">
            次のステップ: EAS Build で実機/ストア検証（別 Issue）。ルートは turborepo 移行予定。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
