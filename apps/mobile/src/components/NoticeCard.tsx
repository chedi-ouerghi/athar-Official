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

const TONE_ICON: Readonly<Record<NonNullable<NoticeCardProps['tone']>, IconName | undefined>> = {
  neutral: undefined,
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
    neutral: { background: theme.surface, mark: theme.gold, text: theme.text },
    warning: { background: theme.warningSoft, mark: theme.warning, text: theme.text },
    danger: { background: theme.dangerSoft, mark: theme.danger, text: theme.text },
    success: { background: theme.successSoft, mark: theme.success, text: theme.text },
  }[tone];
  const icon = TONE_ICON[tone];

  return (
    <View
      style={[
        styles.card,
        shadows.soft,
        {
          backgroundColor: palette.background,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}
      accessibilityRole={alert ? 'alert' : undefined}
      testID={testID}
    >
      {/* A slim bar down the start edge: it flips with the layout direction. */}
      <View style={[styles.bar, { backgroundColor: palette.mark }]} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          {icon ? (
            <View style={[styles.badge, { backgroundColor: palette.mark }]}>
              <Icon name={icon} color={theme.surface} size={16} />
            </View>
          ) : null}
          <AppText variant="heading" style={styles.title}>
            {title}
          </AppText>
        </View>
        {body ? <AppText tone={tone === 'neutral' ? 'textMuted' : 'text'}>{body}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bar: { width: 5 },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
});
