import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { SUPPORTED_LOCALES } from '../i18n/locale';
import { MIN_TOUCH_TARGET, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { useTheme } from './use-theme';

/**
 * Chooses the app language, as a two-part switch. Each language is named in its own
 * language, so a visitor who cannot read the current one can still find theirs.
 */
export function LanguageSwitch(): ReactElement {
  const { locale, setLocale, restartRequired, t } = useI18n();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <AppText variant="label" tone="textMuted">
        {t('language.title')}
      </AppText>
      <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
        {SUPPORTED_LOCALES.map((candidate) => {
          const selected = candidate === locale;

          return (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityLabel={t(`language.${candidate}`)}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) setLocale(candidate);
              }}
              style={[
                styles.option,
                selected && { backgroundColor: theme.surface, borderColor: theme.gold },
              ]}
              testID={`language-${candidate}`}
            >
              <AppText variant="bodyStrong" tone={selected ? 'text' : 'textMuted'}>
                {t(`language.${candidate}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {restartRequired ? (
        <AppText variant="caption" tone="warning" accessibilityRole="alert">
          {t('language.restartRequired')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
