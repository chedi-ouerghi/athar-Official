import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root layout.
 *
 * This is the single place shared providers are mounted. Adding a provider
 * here makes it available to every route without each screen repeating the
 * wiring.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </SafeAreaProvider>
  );
}
