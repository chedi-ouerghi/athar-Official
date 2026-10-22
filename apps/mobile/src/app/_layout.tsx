import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AtharApiClient } from '../api/athar-api-client';
import { ApiClientProvider } from '../api/api-client-context';
import { ThemePreferenceProvider } from '../components/theme-preference';
import { useIsDark, useTheme } from '../components/use-theme';
import { environment } from '../config/environment';
import { fontSources } from '../fonts';
import { I18nProvider } from '../i18n/I18nProvider';
import { secureSessionStorage } from '../session/secure-session-storage';
import { SessionManager } from '../session/session-manager';
import { SessionProvider, useSession } from '../session/SessionProvider';
import { fontFamily, motion } from '../theme';

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
      <ThemePreferenceProvider>
        <I18nProvider>
          <ApiProviderAndStack />
        </I18nProvider>
      </ThemePreferenceProvider>
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

/**
 * Every screen but the sign-in and the connection details needs a session.
 *
 * Pages move the way they mean: a table slides in from the side (you go deeper), a
 * design or a drawing rises from the bottom (you start something), its result fades
 * in (it is where you land, with no way back to the drawing), and the tabs sit under
 * all of it with their own slide.
 */
function AppStack() {
  const theme = useTheme();
  const dark = useIsDark();
  const signedIn = useSession().account !== undefined;

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          // Titles live in the screens; the header only carries the back arrow,
          // which the native stack mirrors for right-to-left languages.
          title: '',
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.accentText,
          headerTitleStyle: { fontFamily: fontFamily.semibold },
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          animationDuration: motion.slow - 120,
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen
            name="pair"
            options={{ headerShown: false, animation: 'fade_from_bottom' }}
          />
          <Stack.Screen name="t/[tableId]/index" />
          <Stack.Screen
            name="t/[tableId]/designs/[designId]"
            options={{ animation: 'fade_from_bottom' }}
          />
          <Stack.Screen
            name="t/[tableId]/jobs/[jobId]"
            options={{ animation: 'fade_from_bottom' }}
          />
          <Stack.Screen
            name="t/[tableId]/jobs/[jobId]/result"
            options={{ animation: 'fade', headerBackVisible: false, gestureEnabled: false }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="diagnostics" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}
