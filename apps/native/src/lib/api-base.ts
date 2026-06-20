import { Platform } from 'react-native';

const DEV_FALLBACK_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? DEV_FALLBACK_BASE;

const isLocalDevHost = API_BASE === DEV_FALLBACK_BASE;

if (!isLocalDevHost && !API_BASE.startsWith('https://')) {
  // 本番/実機向けの設定ミスを早期発見するための警告（処理は継続する）。
  console.warn(
    `EXPO_PUBLIC_API_BASE が HTTPS ではありません: ${API_BASE}。Bearer token が平文で送信される可能性があります。`
  );
}