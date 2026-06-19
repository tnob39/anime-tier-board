import * as Notifications from 'expo-notifications';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useStatuses } from '@/hooks/use-statuses';
import { configureAppShortcuts } from '@/lib/quick-actions';
import { syncTonightWidget } from '@/lib/widget-sync';

export function NativeFeaturesBootstrap() {
  const router = useRouter();
  const { records } = useStatuses();

  useQuickActionRouting();

  useEffect(() => {
    void configureAppShortcuts();
  }, []);

  useEffect(() => {
    void syncTonightWidget(records);
  }, [records]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.length > 0) {
        router.push(url as '/watchlist');
      }
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}