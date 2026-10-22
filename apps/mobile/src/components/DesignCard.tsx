import type { DesignSummary, TableGeometry } from '@athar/contracts';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesign } from '../features/designs/useDesign';
import { describeDuration } from '../i18n/format-duration';
import { useI18n } from '../i18n/context';
import { localize } from '../i18n/locale';
import { radius, spacing } from '../theme';
import { AppText } from './AppText';
import { Card } from './Card';
import { DesignPreview } from './DesignPreview';
import { Icon } from './Icon';
import { useTheme } from './use-theme';

export interface DesignCardProps {
  readonly design: DesignSummary;
  readonly onPress: () => void;
  /** The table the design is for, so the picture has its shape. Round when left out. */
  readonly geometry?: TableGeometry;
  readonly testID?: string;
}

/** Longer side of the preview. */
const THUMBNAIL = 100;

/**
 * One design in the list. The list endpoint carries no preview, so the card
 * fetches its own design detail for the picture (open decision 7); until it
 * arrives, or if it fails, an empty sand disc holds its place.
 */
export function DesignCard({ design, onPress, geometry, testID }: DesignCardProps): ReactElement {
  const { locale, isRtl, t } = useI18n();
  const theme = useTheme();
  const detail = useDesign(design.id);
  const duration = describeDuration(design.estimatedDurationSeconds, locale);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={localize(design.title, locale)}
      padding="md"
      testID={testID}
    >
      <View style={styles.row}>
        {/* Reserve the picture's space so the card does not jump when it loads; the picture then draws its own table. */}
        <View
          style={[
            styles.thumbnail,
            detail.state.status === 'ready'
              ? null
              : { backgroundColor: theme.discEdge, borderRadius: THUMBNAIL / 2 },
          ]}
        >
          {detail.state.status === 'ready' ? (
            <DesignPreview
              path={detail.state.data.previewPath}
              size={THUMBNAIL}
              geometry={geometry}
              testID={testID ? `${testID}-preview` : undefined}
            />
          ) : null}
        </View>

        <View style={styles.text}>
          <AppText variant="heading">{localize(design.title, locale)}</AppText>
          <AppText variant="caption" tone="textMuted" numberOfLines={2}>
            {localize(design.description, locale)}
          </AppText>
          <View style={[styles.duration, { backgroundColor: theme.accentSoft }]}>
            <Icon name="clock" color={theme.accentText} size={14} />
            <AppText variant="caption" tone="accentText">
              {t(duration.key, duration.params)}
            </AppText>
          </View>
        </View>

        <View style={[styles.chevron, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name="chevron" color={theme.accentText} size={18} mirror={isRtl} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    marginTop: 2,
  },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
