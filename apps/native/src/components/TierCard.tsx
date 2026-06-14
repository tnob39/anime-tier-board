import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { STATUS_LABELS, type ViewingStatus } from '@/lib/statuses';
import type { AnimeItem } from '@/lib/types';

const PALETTE = [
  ['#6366f1', '#8b5cf6'],
  ['#ec4899', '#f43f5e'],
  ['#0ea5e9', '#06b6d4'],
  ['#10b981', '#14b8a6'],
];

function titleToColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffff;
  }
  return PALETTE[hash % PALETTE.length][0];
}

function initials(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  return [...trimmed].slice(0, 2).join('');
}

export function TierCard({
  item,
  status,
  onPress,
}: {
  item: AnimeItem;
  status?: ViewingStatus | null;
  onPress?: () => void;
}) {
  const color = useMemo(() => titleToColor(item.title), [item.title]);
  const init = useMemo(() => initials(item.title), [item.title]);
  const imageUrl = item.proxiedImageUrl || item.imageUrl;

  return (
    <Pressable
      onPress={onPress}
      className="w-[72px] active:opacity-80"
      accessibilityLabel={`${item.title} を移動`}
    >
      <View className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: 72, height: 96 }} contentFit="cover" />
        ) : (
          <View className="w-[72px] h-24 items-center justify-center" style={{ backgroundColor: color }}>
            <Text className="text-white text-sm font-bold">{init}</Text>
          </View>
        )}
      </View>
      <Text className="text-[10px] text-zinc-700 dark:text-zinc-300 mt-1 leading-tight" numberOfLines={2}>
        {item.title}
      </Text>
      {status ? (
        <Text className="text-[9px] text-violet-600 dark:text-violet-300">{STATUS_LABELS[status]}</Text>
      ) : null}
    </Pressable>
  );
}