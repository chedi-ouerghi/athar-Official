import type { AuthAccount } from '@athar/contracts';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { GradientFill } from '../../components/GradientFill';
import { Icon } from '../../components/Icon';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useThemePreference, type ThemePreference } from '../../components/theme-preference';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { radius, spacing } from '../../theme';

export interface AccountScreenProps {
  readonly account: Pick<AuthAccount, 'displayName' | 'email' | 'role'>;
  readonly onDiagnostics: () => void;
  readonly onSignOut: () => void | Promise<unknown>;
}

const AVATAR = 64;

/** Who is signed in, how the app looks and speaks, and the way out. */
export function AccountScreen({
  account,
  onDiagnostics,
  onSignOut,
}: AccountScreenProps): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  // The first character of the name, whole: a name can start with a letter that is two code units.
  const initial = Array.from(account.displayName.trim())[0]?.toUpperCase() ?? '•';

  return (
    <Screen tabBar testID="account-screen">
      <ScreenHeader title={t('account.title')} eyebrow="ATHAR" />

      <FadeIn delay={staggerDelay(1)}>
        <Card tone="elevated" style={styles.profile}>
          <View style={styles.avatar}>
            <GradientFill
              from={theme.gradientStart}
              via={theme.gradientMid}
              to={theme.gradientEnd}
            />
            <AppText variant="title" style={{ color: theme.textOnAccent }}>
              {initial}
            </AppText>
          </View>
          <View style={styles.identity}>
            <AppText variant="heading" numberOfLines={1} testID="account-name">
              {account.displayName}
            </AppText>
            <AppText variant="caption" tone="textMuted" numberOfLines={1} testID="account-email">
              {account.email}
            </AppText>
            <View style={[styles.role, { backgroundColor: theme.accentSoft }]}>
              <AppText variant="caption" tone="accentText">
                {t(`account.role.${account.role}`)}
              </AppText>
            </View>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(2)}>
        <Card style={styles.section}>
          <View style={styles.sectionTitle}>
            <Icon name="contrast" color={theme.gold} size={20} />
            <AppText variant="heading">{t('account.appearance')}</AppText>
          </View>
          <SegmentedControl<ThemePreference>
            options={[
              { value: 'system', label: t('account.theme.system'), testID: 'theme-system' },
              { value: 'light', label: t('account.theme.light'), testID: 'theme-light' },
              { value: 'dark', label: t('account.theme.dark'), testID: 'theme-dark' },
            ]}
            value={preference}
            onChange={setPreference}
          />
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(3)}>
        <Card style={styles.section}>
          <View style={styles.sectionTitle}>
            <Icon name="globe" color={theme.gold} size={20} />
            <AppText variant="heading">{t('language.title')}</AppText>
          </View>
          <LanguageSwitch showLabel={false} />
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(4)}>
        <Card
          onPress={onDiagnostics}
          accessibilityLabel={t('home.diagnostics')}
          testID="account-diagnostics"
        >
          <View style={styles.row}>
            <Icon name="plug" color={theme.gold} size={22} />
            <AppText variant="bodyStrong" style={styles.rowLabel}>
              {t('home.diagnostics')}
            </AppText>
            <Icon name="chevron" color={theme.textMuted} size={20} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(5)}>
        <Button
          label={t('home.signOut')}
          variant="danger"
          icon="logout"
          onPress={onSignOut}
          testID="account-sign-out"
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, gap: 2, alignItems: 'flex-start' },
  role: {
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  section: { gap: spacing.md },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { flex: 1 },
});
