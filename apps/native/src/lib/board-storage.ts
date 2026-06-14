import AsyncStorage from '@react-native-async-storage/async-storage';

import { isBoardState, type BoardState } from '@/lib/board';

export async function readStoredBoard(key: string): Promise<BoardState | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isBoardState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStoredBoard(key: string, board: BoardState): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(board));
}

export async function removeStoredBoard(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}