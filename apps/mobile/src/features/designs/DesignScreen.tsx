import type { DesignDetail, DrawingJob, TableGeometry } from '@athar/contracts';
import { useEffect, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/http-client';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DesignPreview } from '../../components/DesignPreview';
import { DotRule } from '../../components/DotRule';
import { ErrorState } from '../../components/ErrorState';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { Icon } from '../../components/Icon';
import { LoadingState } from '../../components/LoadingState';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { describeDuration } from '../../i18n/format-duration';
import { useI18n } from '../../i18n/context';
import { localize } from '../../i18n/locale';
import { spacing } from '../../theme';
import { useStartJob } from '../jobs/useStartJob';
import { useTable } from '../tables/useTable';
import { useDesign } from './useDesign';

export interface DesignScreenProps {
  readonly tableId: string;
  readonly designId: string;
  /** The job the API created (or, for a repeat, the one it already had). */
  readonly onStarted: (job: DrawingJob) => void;
  readonly onWatchJob: (jobId: string) => void;
}

/** One design in full, and the button, pinned at the bottom, that starts it. */
export function DesignScreen({
  tableId,
  designId,
  onStarted,
  onWatchJob,
}: DesignScreenProps): ReactElement {
  const { t } = useI18n();
  const design = useDesign(designId);
  const table = useTable(tableId);
  const { state: startState, start } = useStartJob(tableId, designId);

  // A refused start for a busy table: find out which drawing is running, so the
  // visitor can be offered it.
  const refusedAsBusy =
    startState.status === 'error' &&
    startState.error instanceof ApiError &&
    startState.error.code === 'TABLE_BUSY';
  const refreshTable = table.refresh;

  useEffect(() => {
    if (refusedAsBusy) {
      refreshTable();
    }
  }, [refusedAsBusy, refreshTable]);

  if (design.state.status === 'error') {
    return (
      <Screen>
        <ErrorState error={design.state.error} onRetry={design.reload} testID="design-error" />
      </Screen>
    );
  }

  if (design.state.status === 'loading' || table.state.status === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState testID="design-loading" />
      </Screen>
    );
  }

  if (design.state.status !== 'ready') {
    return <Screen>{null}</Screen>;
  }

  const knownTable = table.state.status === 'ready' ? table.state.data : undefined;
  const runningJobId = refusedAsBusy ? (knownTable?.activeJobId ?? null) : null;

  return (
    <Screen
      testID="design-screen"
      footer={
        <>
          {runningJobId !== null ? (
            <Button
              label={t('design.watchRunning')}
              variant="secondary"
              onPress={() => {
                onWatchJob(runningJobId);
              }}
              testID="design-watch"
            />
          ) : null}
          <Button
            label={t('design.start')}
            dot
            loading={startState.status === 'starting'}
            onPress={async () => {
              const job = await start();

              if (job !== undefined) {
                onStarted(job);
              }
            }}
            testID="design-start"
          />
        </>
      }
    >
      <DesignDetails design={design.state.data} geometry={knownTable?.geometry} />

      {startState.status === 'error' ? (
        <ErrorState error={startState.error} testID="design-start-error" />
      ) : null}
    </Screen>
  );
}

function DesignDetails({
  design,
  geometry,
}: {
  readonly design: DesignDetail;
  /** The table's shape and size; round until the table has loaded. */
  readonly geometry: TableGeometry | undefined;
}): ReactElement {
  const { locale, t } = useI18n();
  const theme = useTheme();
  const duration = describeDuration(design.estimatedDurationSeconds, locale);

  return (
    <View style={styles.details}>
      <FadeIn>
        <Card tone="glow" padding="md" style={styles.disc}>
          <DesignPreview path={design.previewPath} geometry={geometry} testID="design-preview" />
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(1)} style={styles.heading}>
        <AppText variant="display">{localize(design.title, locale)}</AppText>
        <AppText tone="textMuted">{localize(design.description, locale)}</AppText>
        <DotRule />
      </FadeIn>

      <FadeIn delay={staggerDelay(2)} style={styles.duration}>
        <View style={[styles.durationIcon, { borderColor: theme.gold }]}>
          <Icon name="clock" color={theme.gold} size={20} />
        </View>
        <View>
          <AppText variant="caption" tone="textMuted">
            {t('design.estimated')}
          </AppText>
          <AppText variant="bodyStrong" testID="design-duration">
            {t(duration.key, duration.params)}
          </AppText>
        </View>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.lg },
  disc: { alignItems: 'center' },
  heading: { gap: spacing.sm, alignItems: 'flex-start' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  durationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
