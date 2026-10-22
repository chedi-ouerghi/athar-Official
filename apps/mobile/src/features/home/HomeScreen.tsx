import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DotRule } from '../../components/DotRule';
import { EnterCodeForm } from '../../components/EnterCodeForm';
import { Eyebrow } from '../../components/Eyebrow';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { Headline } from '../../components/Headline';
import { Icon } from '../../components/Icon';
import { Ornament } from '../../components/Ornament';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { EYEBROW_TRACKING, spacing } from '../../theme';
import type { RecentTable } from './recent-table';

export interface HomeScreenProps {
  readonly allowedHosts: readonly string[];
  /** The signed-in person's name, for the greeting. Empty when unknown. */
  readonly name: string;
  /** The last table they opened, offered as a way back in. */
  readonly recent: RecentTable | undefined;
  readonly onScan: () => void;
  readonly onTable: (tableId: string) => void;
  readonly onPairing: (link: { readonly tableId: string; readonly token: string }) => void;
}

/** The front door: a greeting, the way to a table, and the way back to the last one. */
export function HomeScreen({
  allowedHosts,
  name,
  recent,
  onScan,
  onTable,
  onPairing,
}: HomeScreenProps): ReactElement {
  const { t, isRtl } = useI18n();
  const theme = useTheme();
  const [typing, setTyping] = useState(false);

  return (
    <Screen tabBar testID="home-screen">
      <FadeIn style={styles.top}>
        <View style={styles.brand}>
          <AppText variant="label" style={{ letterSpacing: EYEBROW_TRACKING * 2.5 }}>
            ATHAR
          </AppText>
          {/* The name in Arabic, set with no tracking so its letters stay joined. */}
          <AppText variant="label" tone="accentText">
            أثر
          </AppText>
        </View>
        <DotRule />
      </FadeIn>

      <FadeIn delay={staggerDelay(1)} style={styles.greeting}>
        <Eyebrow accent>{t('home.greeting')}</Eyebrow>
        {name !== '' ? (
          <AppText variant="display" numberOfLines={2} testID="home-name">
            {name}
          </AppText>
        ) : null}
      </FadeIn>

      <FadeIn delay={staggerDelay(2)}>
        <Card tone="glow" style={styles.hero}>
          <View style={styles.ornament}>
            <Ornament size={150} strength={0.4} />
          </View>

          <Headline variant="title" style={styles.heroTitle}>
            {t('home.heroTitle')}
          </Headline>
          <AppText tone="textMuted" style={styles.tagline}>
            {t('home.tagline')}
          </AppText>

          <View style={styles.actions}>
            <Button label={t('home.scan')} dot onPress={onScan} testID="home-scan" />

            {typing ? (
              <EnterCodeForm allowedHosts={allowedHosts} onPairing={onPairing} autoFocus />
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
          </View>
        </Card>
      </FadeIn>

      {recent !== undefined ? (
        <FadeIn delay={staggerDelay(3)}>
          <Card
            onPress={() => {
              onTable(recent.id);
            }}
            accessibilityLabel={`${t('home.recentOpen')}: ${recent.name}`}
            testID="home-recent"
          >
            <View style={styles.recent}>
              <View style={[styles.recentIcon, { borderColor: theme.gold }]}>
                <Icon name="table" color={theme.gold} size={22} />
              </View>
              <View style={styles.recentText}>
                <Eyebrow>{t('home.recent')}</Eyebrow>
                <AppText variant="heading" numberOfLines={1}>
                  {recent.name}
                </AppText>
              </View>
              <Icon name="chevron" color={theme.textMuted} size={20} mirror={isRtl} />
            </View>
          </Card>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.md, paddingTop: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { gap: spacing.sm },
  hero: { gap: spacing.md },
  ornament: { position: 'absolute', top: spacing.sm, end: spacing.sm },
  heroTitle: { maxWidth: '82%' },
  tagline: { maxWidth: '86%' },
  actions: { gap: spacing.md, marginTop: spacing.md },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { flex: 1, gap: 2 },
});
