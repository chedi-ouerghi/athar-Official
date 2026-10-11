import type { DesignSummary } from '@athar/contracts';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDesign } from '../features/designs/useDesign';
import { describeDuration } from '../i18n/format-duration';
import { useI18n } from '../i18n/context';
import { localize } from '../i18n/locale';
import { radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';
import { DesignPreview } from './DesignPreview';
import { Icon } from './Icon';
import { useTheme } from './use-theme';

export interface DesignCardProps {
  readonly design: DesignSummary;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Side of the preview disc. */
const THUMBNAIL = 104;

/**
 * One design in the list. The list endpoint carries no preview, so the card
 * fetches its own design detail for the picture (open decision 7); until it
 * arrives, or if it fails, an empty sand disc holds its place.
 */
export function DesignCard({ design, onPress, testID }: DesignCardProps): ReactElement {
  const { locale, isRtl, t } = useI18n();
  const theme = useTheme();
  const detail = useDesign(design.id);
  const duration = describeDuration(design.estimatedDurationSeconds, locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={localize(design.title, locale)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        shadows.soft,
        {
          backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      testID={testID}
    >
      {/* Reserve the disc's space so the card does not jump when the picture loads. */}
      <View style={[styles.thumbnail, { backgroundColor: theme.discEdge }]}>
        {detail.state.status === 'ready' ? (
          <DesignPreview
            path={detail.state.data.previewPath}
            size={THUMBNAIL}
            testID={testID ? `${testID}-preview` : undefined}
          />
        ) : null}
      </View>

      <View style={styles.text}>
        <AppText variant="heading">{localize(design.title, locale)}</AppText>
        <AppText variant="caption" tone="textMuted" numberOfLines={2}>
          {localize(design.description, locale)}
        </AppText>
        <View style={styles.meta}>
          <Icon name="clock" color={theme.gold} size={14} />
          <AppText variant="caption" tone="accentText">
            {t(duration.key, duration.params)}
          </AppText>
        </View>
      </View>

      <Icon name="chevron" color={theme.textMuted} size={20} mirror={isRtl} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    alignItems: 'center',
  },
  thumbnail: { width: THUMBNAIL, height: THUMBNAIL, borderRadius: THUMBNAIL / 2 },
  text: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
