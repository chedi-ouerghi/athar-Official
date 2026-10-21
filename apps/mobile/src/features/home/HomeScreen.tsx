import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EnterCodeForm } from '../../components/EnterCodeForm';
import { FadeIn } from '../../components/FadeIn';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { Ornament } from '../../components/Ornament';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { spacing } from '../../theme';

export interface HomeScreenProps {
  readonly allowedHosts: readonly string[];
  readonly onScan: () => void;
  readonly onTable: (tableId: string) => void;
  readonly onDiagnostics: () => void;
  readonly onSignOut: () => void | Promise<unknown>;
}

/** Wordmark tracking, in px. Applied to the Latin name only: tracking breaks Arabic joins. */
const WORDMARK_TRACKING = 10;

/** The front door: scan a table, or type its code. */
export function HomeScreen({
  allowedHosts,
  onScan,
  onTable,
  onDiagnostics,
  onSignOut,
}: HomeScreenProps): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const [typing, setTyping] = useState(false);

  return (
    <Screen testID="home-screen">
      <View style={styles.hero}>
        <View style={styles.ornament}>
          <Ornament size={250} strength={0.4} />
        </View>

        <FadeIn style={styles.brand}>
          <View style={[styles.rule, { backgroundColor: theme.gold }]} />
          <AppText
            variant="hero"
            accessibilityRole="header"
            style={{ letterSpacing: WORDMARK_TRACKING }}
          >
            ATHAR
          </AppText>
          {/* The name in Arabic, set with no tracking so its letters stay joined. */}
          <AppText variant="title" tone="accentText">
            أثر
          </AppText>
          <AppText tone="textMuted" style={styles.tagline}>
            {t('home.tagline')}
          </AppText>
        </FadeIn>
      </View>

      <FadeIn delay={160} style={styles.actions}>
        <Button label={t('home.scan')} onPress={onScan} testID="home-scan" />

        {typing ? (
          <EnterCodeForm allowedHosts={allowedHosts} onTable={onTable} autoFocus />
        ) : (
          <Button
            label={t('home.enterCode')}
            variant="secondary"
            onPress={() => {
              setTyping(true);
            }}
            testID="home-enter-code"
          />
        )}
      </FadeIn>

      <FadeIn delay={300} style={styles.footer}>
        <LanguageSwitch />
        <Button
          label={t('home.diagnostics')}
          variant="ghost"
          onPress={onDiagnostics}
          testID="home-diagnostics"
        />
        <Button
          label={t('home.signOut')}
          variant="ghost"
          onPress={onSignOut}
          testID="home-sign-out"
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 300, justifyContent: 'center', paddingTop: spacing.xl },
  // Behind the wordmark, pushed to the end edge so the text stays on clean sand.
  ornament: { position: 'absolute', top: -30, end: -125 },
  brand: { gap: spacing.xs, alignItems: 'flex-start' },
  rule: { width: 44, height: 3, borderRadius: 2, marginBottom: spacing.md },
  tagline: { marginTop: spacing.sm, maxWidth: 230 },
  actions: { gap: spacing.md },
  footer: { gap: spacing.md, marginTop: spacing.lg },
});
