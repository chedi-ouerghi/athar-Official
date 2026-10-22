import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './use-theme';

export interface NoticeCardProps {
  readonly title: string;
  readonly body?: string;
  readonly tone?: 'neutral' | 'warning' | 'danger' | 'success';
  /** Buttons or other actions, placed under the text. */
  readonly children?: ReactNode;
  /** Announce it to screen readers as soon as it appears (for failures). */
  readonly alert?: boolean;
  readonly testID?: string;
}

const TONE_ICON: Readonly<Record<NonNullable<NoticeCardProps['tone']>, IconName>> = {
  neutral: 'sparkle',
  warning: 'alert',
  danger: 'alert',
  success: 'check',
};

/** A short message with an optional action: the shape of every "state" in the app. */
export function NoticeCard({
  title,
  body,
  tone = 'neutral',
  children,
  alert = false,
  testID,
}: NoticeCardProps): ReactElement {
  const theme = useTheme();
  const palette = {
    neutral: { mark: theme.gold, soft: theme.accentSoft },
    warning: { mark: theme.warning, soft: theme.warningSoft },
    danger: { mark: theme.danger, soft: theme.dangerSoft },
    success: { mark: theme.success, soft: theme.successSoft },
  }[tone];

  return (
    <View
      style={[
        styles.card,
        shadows.soft,
        {
          backgroundColor: theme.surface,
          borderColor: tone === 'neutral' ? theme.border : palette.mark,
          shadowColor: theme.shadow,
        },
      ]}
      accessibilityRole={alert ? 'alert' : undefined}
      testID={testID}
    >
      <View style={styles.titleRow}>
        <View style={[styles.badge, { backgroundColor: palette.soft }]}>
          <Icon name={TONE_ICON[tone]} color={palette.mark} size={20} />
        </View>
        <AppText variant="heading" style={styles.title}>
          {title}
        </AppText>
      </View>
      {body ? <AppText tone="textMuted">{body}</AppText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
});
