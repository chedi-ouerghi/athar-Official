import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { SUPPORTED_LOCALES } from '../i18n/locale';
import { spacing } from '../theme';
import { AppText } from './AppText';
import { SegmentedControl } from './SegmentedControl';

/**
 * Chooses the app language, as a two-part switch. Each language is named in its own
 * language, so a visitor who cannot read the current one can still find theirs.
 */
export function LanguageSwitch({
  showLabel = true,
}: {
  /** Off where a title next to it already says "Language". */
  readonly showLabel?: boolean;
}): ReactElement {
  const { locale, setLocale, restartRequired, t } = useI18n();

  return (
    <View style={styles.container}>
      {showLabel ? (
        <AppText variant="label" tone="textMuted">
          {t('language.title')}
        </AppText>
      ) : null}
      <SegmentedControl
        options={SUPPORTED_LOCALES.map((candidate) => ({
          value: candidate,
          label: t(`language.${candidate}`),
          testID: `language-${candidate}`,
        }))}
        value={locale}
        onChange={setLocale}
      />
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
});
