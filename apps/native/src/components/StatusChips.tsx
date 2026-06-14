import { Pressable, Text, View } from 'react-native';

import { STATUS_LABELS, VIEWING_STATUSES, type ViewingStatus } from '@/lib/statuses';

type StatusChipsProps = {
  status: ViewingStatus | null;
  onChange: (status: ViewingStatus | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
};

export function StatusChips({
  status,
  onChange,
  disabled = false,
  allowClear = true,
}: StatusChipsProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {VIEWING_STATUSES.map((option) => {
        const active = status === option;
        return (
          <Pressable
            key={option}
            disabled={disabled}
            onPress={() => onChange(active && allowClear ? null : option)}
            className={`px-3 py-1.5 rounded-full border ${
              active
                ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white'
                : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600'
            } ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
          >
            <Text
              className={`text-xs font-medium ${
                active ? 'text-white dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              {STATUS_LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}