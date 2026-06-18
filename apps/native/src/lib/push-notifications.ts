import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getExpoProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function registerNativePushToken(
  token: string,
  authToken: string,
  onUnauthorized?: () => void
): Promise<void> {
  const response = await apiFetch(
    '/api/push/native',
    {
      method: 'POST',
      body: JSON.stringify({
        expoPushToken: token,
        platform: Platform.OS,
      }),
    },
    authToken,
    onUnauthorized
  );

  if (!response.ok) {
    throw new Error('プッシュ通知の登録に失敗しました。');
  }
}

export async function unregisterNativePushToken(
  token: string,
  authToken: string,
  onUnauthorized?: () => void
): Promise<void> {
  const response = await apiFetch(
    '/api/push/native',
    {
      method: 'DELETE',
      body: JSON.stringify({ expoPushToken: token }),
    },
    authToken,
    onUnauthorized
  );

  if (!response.ok) {
    throw new Error('プッシュ通知の解除に失敗しました。');
  }
}

export async function getNativePushSubscriptionStatus(
  authToken: string,
  onUnauthorized?: () => void
): Promise<boolean> {
  const response = await apiFetch('/api/push/native', { method: 'GET' }, authToken, onUnauthorized);
  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as { subscribed?: boolean };
  return Boolean(payload.subscribed);
}