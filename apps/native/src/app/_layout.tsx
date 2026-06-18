import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { NativeFeaturesBootstrap } from '@/components/NativeFeaturesBootstrap';
import { AuthProvider } from '@/contexts/auth-context';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <NativeFeaturesBootstrap />
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </AuthProvider>
  );
}
