import { ScrollView, Text, View } from 'react-native';

import { TierCard } from '@/components/TierCard';
import type { TierRow } from '@/lib/board';
import type { ViewingStatus } from '@/lib/statuses';
import type { AnimeItem } from '@/lib/types';

export function TierLane({
  tier,
  itemMap,
  statusMap,
  pool = false,
  onOpenMoveMenu,
}: {
  tier: TierRow;
  itemMap: Map<string, AnimeItem>;
  statusMap: Record<string, ViewingStatus>;
  pool?: boolean;
  onOpenMoveMenu: (itemId: string) => void;
}) {
  const items = tier.itemIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is AnimeItem => Boolean(item));

  return (
    <View className={`${pool ? 'mt-2' : 'mb-3'}`}>
      <View className="flex-row items-stretch gap-2">
        <View
          className="w-12 rounded-xl items-center justify-center"
          style={{ backgroundColor: tier.color }}
        >
          <Text className="text-white font-bold text-lg">{tier.label}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 py-1 pr-2"
          className="flex-1"
        >
          {items.length ? (
            items.map((item) => (
              <TierCard
                key={item.id}
                item={item}
                status={statusMap[item.id]}
                onPress={() => onOpenMoveMenu(item.id)}
              />
            ))
          ) : (
            <View className="h-24 justify-center px-3">
              <Text className="text-xs text-zinc-400">{pool ? '未分類の作品' : '作品なし'}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}