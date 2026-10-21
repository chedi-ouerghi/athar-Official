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
import { secureSessionStorage } from '../session/secure-session-storage';
import { SessionManager } from '../session/session-manager';
import { SessionProvider, useSession } from '../session/SessionProvider';
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
  const { client, session } = useMemo(() => {
    const manager: SessionManager = new SessionManager(secureSessionStorage, (token) =>
      apiClient.refresh(token),
    );
    const apiClient: AtharApiClient = new AtharApiClient(environment, {
      accessToken: () => manager.accessToken(),
    });

    return { client: apiClient, session: manager };
  }, []);

  return (
    <ApiClientProvider client={client}>
      <SessionProvider manager={session}>
        <AppStack />
      </SessionProvider>
    </ApiClientProvider>
  );
}

/** Every screen but the sign-in and the connection details needs a session. */
function AppStack() {
  const theme = useTheme();
  const signedIn = useSession().account !== undefined;

  return (
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
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="scan" />
        <Stack.Screen name="pair" options={{ headerShown: false }} />
        <Stack.Screen name="t/[tableId]/index" />
        <Stack.Screen name="t/[tableId]/designs/[designId]" />
        <Stack.Screen name="t/[tableId]/jobs/[jobId]" />
        <Stack.Screen name="t/[tableId]/jobs/[jobId]/result" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
