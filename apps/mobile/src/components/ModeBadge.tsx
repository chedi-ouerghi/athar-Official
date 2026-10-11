import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { radius, spacing, type Theme } from '../theme';
import { AppText } from './AppText';
import { MODE_LABEL_KEY, resolveDisplayMode, type DisplayMode } from './mode';
import { useTheme } from './use-theme';

export interface ModeBadgeProps {
  /**
   * `table.mode` or `job.mode`. Typed loosely on purpose: whatever arrives, a
   * badge is shown, and anything but the two known values reads "Unknown mode".
   */
  readonly mode: unknown;
  readonly testID?: string;
}

function colours(
  mode: DisplayMode,
  theme: Theme,
): { background: string; text: string; dot: string } {
  switch (mode) {
    case 'simulation':
      return { background: theme.accentSoft, text: theme.accentText, dot: theme.gold };
    case 'hardware':
      return { background: theme.successSoft, text: theme.success, dot: theme.success };
    case 'unknown':
      return { background: theme.warningSoft, text: theme.warning, dot: theme.warning };
  }
}

/**
 * Says whether what the user is looking at is simulated or real. Fail-closed:
 * it always renders something, and "real" only for an exact `'hardware'`.
 */
export function ModeBadge({ mode, testID }: ModeBadgeProps): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const display = resolveDisplayMode(mode);
  const { background, text, dot } = colours(display, theme);

  return (
    <View
      accessible
      accessibilityRole="text"
      style={[styles.badge, { backgroundColor: background, borderColor: dot }]}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <AppText variant="label" style={{ color: text }}>
        {t(MODE_LABEL_KEY[display])}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
