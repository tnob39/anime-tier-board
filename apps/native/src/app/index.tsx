import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimeCard, DemoAnimeItem } from '@/components/AnimeCard';
import { useAuth } from '@/contexts/auth-context';
import { fetchStatusesWithAuth } from '@/lib/auth-api';
import { API_BASE } from '@/lib/api-base';

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
    imageUrl: 'https://picsum.photos/id/1016/300/200',
  },
];

export default function ExpoPoCScreen() {
  const { user, token, loading, signingIn, signInWithGoogle, signInWithDev, signOut } = useAuth();
  const [fetchLoading, setFetchLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  async function handleFetchStatuses() {
    setFetchLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = await fetchStatusesWithAuth(token);
      setResult(JSON.stringify(parsed, null, 2));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDevSignIn() {
    setAuthError(null);
    try {
      await signInWithDev();
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-6 gap-6 max-w-[680px] self-center w-full"
      >
        <View className="items-center gap-1">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Anime Tier Board
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            認証フロー PoC (Issue #90)
          </Text>
          <View className="mt-1 px-3 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900">
            <Text className="text-xs text-violet-700 dark:text-violet-300">
              expo-auth-session + SecureStore
            </Text>
          </View>
        </View>

        <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-3">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            認証
          </Text>

          {loading ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-zinc-500">セッション確認中...</Text>
            </View>
          ) : user ? (
            <View className="gap-2">
              <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                ログイン中: {user.name ?? user.email ?? user.id}
              </Text>
              <Text className="text-[10px] text-zinc-400 font-mono">token: {token?.slice(0, 24)}...</Text>
              <Pressable
                onPress={() => void signOut()}
                className="self-start active:opacity-80 bg-zinc-200 dark:bg-zinc-700 px-4 py-2 rounded-xl"
              >
                <Text className="text-zinc-900 dark:text-zinc-100 font-medium">ログアウト</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-2">
              <Pressable
                onPress={() => void handleGoogleSignIn()}
                disabled={signingIn}
                className="self-start active:opacity-80 bg-zinc-900 dark:bg-white px-4 py-2 rounded-xl"
              >
                <Text className="text-white dark:text-zinc-900 font-medium">
                  {signingIn ? '認証中...' : 'Google でログイン'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDevSignIn()}
                disabled={signingIn}
                className="self-start active:opacity-80 border border-zinc-300 dark:border-zinc-600 px-4 py-2 rounded-xl"
              >
                <Text className="text-zinc-700 dark:text-zinc-200 font-medium">
                  開発モードでログイン
                </Text>
              </Pressable>
              <Text className="text-[10px] text-zinc-400">
                Google ログインには EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が必要です。
              </Text>
            </View>
          )}

          {authError && (
            <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
              <Text className="text-red-700 dark:text-red-300 text-sm">{authError}</Text>
            </View>
          )}
        </View>

        <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-3">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            認証付き API 疎通
          </Text>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            Bearer トークン付きで <Text className="font-mono text-xs">/api/statuses</Text> を取得します。
          </Text>

          <Pressable
            onPress={() => void handleFetchStatuses()}
            disabled={fetchLoading || !user}
            className="self-start active:opacity-80 bg-zinc-900 dark:bg-white px-4 py-2 rounded-xl disabled:opacity-40"
          >
            <Text className="text-white dark:text-zinc-900 font-medium">
              {fetchLoading ? '取得中...' : '認証付き /api/statuses をフェッチ'}
            </Text>
          </Pressable>

          {fetchLoading && (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-zinc-500">Next サーバー起動を確認してください</Text>
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

          <Text className="text-[10px] text-zinc-400">ベースURL: {API_BASE}</Text>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AnimeCard 移植サンプル
            </Text>
          </View>

          <View className="items-center gap-4 py-2">
            {SAMPLE_ITEMS.map((item) => (
              <AnimeCard key={item.id} item={item} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}