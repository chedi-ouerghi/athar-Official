import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AtharApiClient } from '../api/athar-api-client';
import { ApiClientProvider } from '../api/api-client-context';
import { useTheme } from '../components/use-theme';
import { environment } from '../config/environment';
import { fontSources } from '../fonts';
import { I18nProvider } from '../i18n/I18nProvider';
import { fontFamily } from '../theme';

/**
 * Root layout.
 *
 * This is the single place shared providers are mounted. Adding a provider
 * here makes it available to every route without each screen repeating the
 * wiring.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontSources);

  // Wait for the fonts, so text never flashes in a fallback face. A font that
  // fails to load must not keep the app from opening: it falls back to the
  // system font, which still renders Arabic and Latin.
  if (!fontsLoaded && fontError === null) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StatusBar style="auto" />
        <ApiProviderAndStack />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function ApiProviderAndStack() {
  const theme = useTheme();
  const client = useMemo(() => new AtharApiClient(environment), []);

  return (
    <ApiClientProvider client={client}>
      <Stack
        screenOptions={{
          // Titles live in the screens; the header only carries the back arrow,
          // which the native stack mirrors for right-to-left languages.
          title: '',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: fontFamily.semibold },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </ApiClientProvider>
  );
}
