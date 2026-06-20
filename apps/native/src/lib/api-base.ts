import { Platform } from 'react-native';

const DEV_FALLBACK_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? DEV_FALLBACK_BASE;

const isLocalDevHost = API_BASE === DEV_FALLBACK_BASE;

if (!isLocalDevHost && !API_BASE.startsWith('https://')) {
  throw new Error(
    `EXPO_PUBLIC_API_BASE が HTTPS ではありません: ${API_BASE}。Bearer token が平文で送信される可能性があります。`
  );
}
