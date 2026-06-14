import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { StatusChips } from '@/components/StatusChips';
import type { TierRow } from '@/lib/board';
import { STATUS_LABELS, type ViewingStatus } from '@/lib/statuses';
import type { AnimeItem } from '@/lib/types';

export function MoveItemSheet({
  visible,
  item,
  tiers,
  currentTierId,
  status,
  saving,
  onMove,
  onStatusChange,
  onClose,
}: {
  visible: boolean;
  item: AnimeItem | null;
  tiers: TierRow[];
  currentTierId: string | null;
  status: ViewingStatus | null;
  saving?: boolean;
  onMove: (itemId: string, tierId: string) => void;
  onStatusChange: (status: ViewingStatus | null) => void;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  const imageUrl = item.proxiedImageUrl || item.imageUrl;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <Pressable
          className="bg-white dark:bg-zinc-900 rounded-t-3xl px-4 pt-4 pb-8 gap-4 max-h-[85%]"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="flex-row gap-3 items-center">
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 56, height: 76, borderRadius: 8 }} />
            ) : (
              <View className="w-14 h-[76px] rounded-lg bg-zinc-300 dark:bg-zinc-700" />
            )}
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-100" numberOfLines={2}>
                {item.title}
              </Text>
              <Text className="text-sm text-zinc-500">移動先を選択</Text>
              {status ? (
                <Text className="text-xs text-violet-600 dark:text-violet-300">
                  視聴: {STATUS_LABELS[status]}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">視聴ステータス</Text>
            <StatusChips
              status={status}
              onChange={onStatusChange}
              disabled={saving}
              allowClear
            />
          </View>

          <ScrollView className="max-h-56">
            <View className="flex-row flex-wrap gap-2">
              {tiers.map((tier) => {
                const isCurrent = tier.id === currentTierId;
                return (
                  <Pressable
                    key={tier.id}
                    disabled={saving}
                    onPress={() => onMove(item.id, tier.id)}
                    className={`px-4 py-3 rounded-xl border min-w-[72px] items-center active:opacity-80 ${
                      isCurrent ? 'border-zinc-900 dark:border-white' : 'border-zinc-200 dark:border-zinc-700'
                    }`}
                    style={{ backgroundColor: tier.color }}
                  >
                    <Text className="text-white font-bold text-base">{tier.label}</Text>
                    {isCurrent ? <Text className="text-white/80 text-[10px]">現在</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable onPress={onClose} className="self-center py-2 active:opacity-80">
            <Text className="text-sm text-zinc-500">キャンセル</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}