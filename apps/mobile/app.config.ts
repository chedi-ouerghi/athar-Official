import type { ExpoConfig, ConfigContext } from 'expo/config';
import { assertReleaseConfig } from './release-check.cjs';

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
/**
 * HTTPS hosts that open the app from a table's QR code, from the same variable
 * the in-app link parser reads, so the operating system and the app agree.
 *
 * Empty until the domain is decided (architecture.md, open decision 3): with no
 * host there are no associated domains or intent filters, and only the
 * `athar://` scheme and the in-app scanner open a table. Once a host is set,
 * these links still open the app only if that host serves the verification files
 * (`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`)
 * and the app is a build that carries them; they never work in Expo Go.
 */
// EAS names the build profile in this variable. A preview or production build with a
// placeholder, local or plain-http API address is refused here, before anything is
// compiled (see src/config/release-check.ts and docs/deployment.md).
const buildProfile = process.env.EAS_BUILD_PROFILE;
assertReleaseConfig(buildProfile, {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_TABLE_LINK_HOSTS: process.env.EXPO_PUBLIC_TABLE_LINK_HOSTS,
});

const tableLinkHosts = (process.env.EXPO_PUBLIC_TABLE_LINK_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter((host) => host.length > 0);

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
    ...(tableLinkHosts.length > 0
      ? { associatedDomains: tableLinkHosts.map((host) => `applinks:${host}`) }
      : {}),
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
    ...(tableLinkHosts.length > 0
      ? {
          intentFilters: tableLinkHosts.map((host) => ({
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host, pathPrefix: '/t' }],
            category: ['BROWSABLE', 'DEFAULT'],
          })),
        }
      : {}),
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-build-properties',
      {
        android: {
          // Plain-http API traffic (a laptop on the LAN) only in development builds.
          // Every other build, including `preview`, may talk https only.
          usesCleartextTraffic: buildProfile === 'development',
        },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'ATHAR uses the camera only to read the QR code on your table.',
        // The app never records video or audio.
        recordAudioAndroid: false,
      },
    ],
    // Lists both languages in the system's per-app language settings.
    ['expo-localization', { supportedLocales: { ios: ['en', 'ar'], android: ['en', 'ar'] } }],
  ],
  experiments: {
    typedRoutes: true,
  },
});
