import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

const PALETTE = [
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#0ea5e9", "#06b6d4"],
  ["#10b981", "#14b8a6"],
  ["#f59e0b", "#ef4444"],
  ["#8b5cf6", "#ec4899"],
  ["#06b6d4", "#0ea5e9"],
  ["#14b8a6", "#10b981"],
];

function titleToColors(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffff;
  }
  const pair = PALETTE[hash % PALETTE.length];
  return [pair[0], pair[1]];
}

function initials(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  const chars = [...trimmed];
  return chars.slice(0, 2).join("");
}

export type DemoAnimeItem = {
  id: string;
  title: string;
  imageUrl?: string;
  format?: string | null;
};

export function AnimeCard({ item }: { item: DemoAnimeItem }) {
  const [from, to] = useMemo(() => titleToColors(item.title), [item.title]);
  const init = useMemo(() => initials(item.title), [item.title]);

  return (
    <View className="bg-white dark:bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 w-full max-w-[320px] shadow-sm">
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', height: 160 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          className="h-[160px] items-center justify-center"
          style={{ backgroundColor: from }}
        >
          <Text className="text-white text-5xl font-bold tracking-widest">{init}</Text>
        </View>
      )}

      <View className="p-3 gap-1.5">
        <Text
          className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug"
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <View className="flex-row items-center gap-2">
          <Text className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            {item.format ?? "ANIME"}
          </Text>
          <View className="px-2 py-px rounded bg-emerald-100 dark:bg-emerald-900">
            <Text className="text-[10px] text-emerald-700 dark:text-emerald-300">移植済み</Text>
          </View>
        </View>

        {/* Status chip example (transplanted interaction hint) */}
        <View className="mt-1 self-start rounded-full bg-blue-100 dark:bg-blue-900/70 px-3 py-1">
          <Text className="text-blue-700 dark:text-blue-200 text-xs font-medium">＋ 見たい</Text>
        </View>
      </View>
    </View>
  );
}
