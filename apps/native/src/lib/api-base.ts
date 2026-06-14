import { Platform } from 'react-native';

export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');