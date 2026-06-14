import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';

export function LoginPanel({ title, description }: { title: string; description: string }) {
  const {
    user,
    loading,
    signingIn,
    authError,
    sessionExpired,
    signInWithGoogle,
    signInWithDev,
    clearAuthError,
  } = useAuth();

  if (loading) {
    return (
      <View className="items-center justify-center py-12 gap-3">
        <ActivityIndicator size="small" />
        <Text className="text-sm text-zinc-500">セッション確認中...</Text>
      </View>
    );
  }

  if (user) {
    return null;
  }

  return (
    <View className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 gap-3">
      <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</Text>
      <Text className="text-sm text-zinc-600 dark:text-zinc-400">{description}</Text>

      {sessionExpired ? (
        <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-3 rounded-xl">
          <Text className="text-amber-800 dark:text-amber-200 text-sm">
            セッションが期限切れです。再ログインしてください。
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          clearAuthError();
          void signInWithGoogle();
        }}
        disabled={signingIn}
        className="self-start active:opacity-80 bg-zinc-900 dark:bg-white px-4 py-2.5 rounded-xl disabled:opacity-50"
      >
        <Text className="text-white dark:text-zinc-900 font-medium">
          {signingIn ? '認証中...' : 'Google でログイン'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          clearAuthError();
          void signInWithDev();
        }}
        disabled={signingIn}
        className="self-start active:opacity-80 border border-zinc-300 dark:border-zinc-600 px-4 py-2.5 rounded-xl disabled:opacity-50"
      >
        <Text className="text-zinc-700 dark:text-zinc-200 font-medium">開発モードでログイン</Text>
      </Pressable>

      {authError ? (
        <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-xl">
          <Text className="text-red-700 dark:text-red-300 text-sm">{authError}</Text>
        </View>
      ) : null}
    </View>
  );
}