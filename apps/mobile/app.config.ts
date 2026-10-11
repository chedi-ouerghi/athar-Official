import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Expo application configuration.
 *
 * Runtime configuration (API base URL, timeouts) is *not* defined here: it is
 * read from `EXPO_PUBLIC_*` variables by `src/config/env.ts` so that the same
 * values are visible to the type checker, the tests and the running app.
 *
 * Note on secrets: only variables prefixed with `EXPO_PUBLIC_` are inlined
 * into the JavaScript bundle, and therefore always public. Server credentials
 * must never be added to a mobile app — they ship to every device.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ATHAR',
  slug: 'athar',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'athar',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
  },
  android: {
    package: 'com.athar.mobile',
    adaptiveIcon: {
      backgroundColor: '#0B1120',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
});
