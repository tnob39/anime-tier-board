import { Platform } from 'react-native';

import { buildTonightWidgetProps } from '@/lib/widget-data';
import type { AnimeStatusRecord } from '@/lib/statuses';

export async function syncTonightWidget(records: AnimeStatusRecord[]): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  try {
    const TonightWidget = (await import('@/widgets/TonightWidget')).default;
    TonightWidget.updateSnapshot(buildTonightWidgetProps(records));
  } catch {
    // Widgets require a development build; ignore in Expo Go.
  }
}