import { Tabs } from 'expo-router';
import { TabBar } from '../../components/TabBar';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';

/**
 * The three tabs of the signed-in app: home, the scanner, and the account. The
 * bar is our own floating one; the screens slide a little as you move between
 * tabs, so the change of place is felt.
 */
export default function TabsLayout() {
  const { t } = useI18n();
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="scan" options={{ title: t('tabs.scan') }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />
    </Tabs>
  );
}
