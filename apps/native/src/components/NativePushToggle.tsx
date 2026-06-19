import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import {
  getExpoPushToken,
  getExpoPushTokenIfPermitted,
  getNativePushSubscriptionStatus,
  registerNativePushToken,
  unregisterNativePushToken,
} from '@/lib/push-notifications';

type State = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function NativePushToggle() {
  const { token, user, handleUnauthorized } = useAuth();
  const [state, setState] = useState<State>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !user) {
      setState('unsubscribed');
      return;
    }

    // 購読状態はサーバー側の記録で判定する。通知許可ダイアログは
    // ユーザーが「有効にする」を押すまで出さないため、ここでは
    // 既に許可済みの場合のみトークンを取得する（unsubscribe操作用）。
    const subscribed = await getNativePushSubscriptionStatus(token, handleUnauthorized);
    const pushToken = await getExpoPushTokenIfPermitted();
    setExpoPushToken(pushToken);
    setState(subscribed ? 'subscribed' : 'unsubscribed');
  }, [token, user, handleUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function subscribe() {
    if (!token) {
      setMessage('ログインが必要です。');
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      const pushToken = expoPushToken ?? (await getExpoPushToken());
      if (!pushToken) {
        setState('unsupported');
        setMessage('通知の許可または EAS Project ID の設定が必要です。');
        return;
      }

      await registerNativePushToken(pushToken, token, handleUnauthorized);
      setExpoPushToken(pushToken);
      setState('subscribed');
      setMessage('放送リマインダーを有効にしました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '通知の有効化に失敗しました。');
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    if (!token || !expoPushToken) {
      setState('unsubscribed');
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      await unregisterNativePushToken(expoPushToken, token, handleUnauthorized);
      setState('unsubscribed');
      setMessage('放送リマインダーを無効にしました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '通知の無効化に失敗しました。');
    } finally {
      setWorking(false);
    }
  }

  if (!user) {
    return null;
  }

  if (state === 'loading') {
    return (
      <View className="flex-row items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <ActivityIndicator size="small" />
        <Text className="text-sm text-zinc-500">通知設定を確認中...</Text>
      </View>
    );
  }

  if (state === 'unsupported') {
    return (
      <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 gap-1">
        <Text className="text-sm font-medium text-amber-900 dark:text-amber-100">放送リマインダー</Text>
        <Text className="text-sm text-amber-800 dark:text-amber-200">
          実機の開発ビルドと通知許可、EAS Project ID が必要です。
        </Text>
      </View>
    );
  }

  const isOn = state === 'subscribed';

  return (
    <View className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 gap-3">
      <View className="gap-1">
        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100">放送リマインダー</Text>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          {isOn ? '今日の放送をプッシュ通知でお知らせします。' : '視聴中・見たい作品の放送日に通知します。'}
        </Text>
      </View>
      <Pressable
        onPress={() => void (isOn ? unsubscribe() : subscribe())}
        disabled={working}
        className={`self-start px-4 py-2 rounded-full ${isOn ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-violet-600'} active:opacity-80 disabled:opacity-50`}
      >
        <Text className={`text-sm font-medium ${isOn ? 'text-zinc-800 dark:text-zinc-100' : 'text-white'}`}>
          {working ? '処理中...' : isOn ? '無効にする' : '有効にする'}
        </Text>
      </Pressable>
      {message ? <Text className="text-sm text-zinc-600 dark:text-zinc-300">{message}</Text> : null}
    </View>
  );
}