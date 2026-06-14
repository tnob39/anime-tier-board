import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'anime-tier-board.session-token';

export async function getStoredSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}