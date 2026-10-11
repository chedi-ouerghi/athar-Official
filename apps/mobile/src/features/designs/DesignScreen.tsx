import type { DesignDetail, DrawingJob } from '@athar/contracts';
import { useEffect, type ReactElement } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/http-client';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DesignPreview } from '../../components/DesignPreview';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ModeBadge } from '../../components/ModeBadge';
import { FadeIn } from '../../components/FadeIn';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { describeDuration } from '../../i18n/format-duration';
import { useI18n } from '../../i18n/context';
import { localize } from '../../i18n/locale';
import { radius, shadows, spacing } from '../../theme';
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

/** One design in full, and the button that starts it. */
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
    <Screen testID="design-screen">
      <DesignDetails design={design.state.data} mode={knownTable?.mode} />

      {startState.status === 'error' ? (
        <ErrorState error={startState.error} testID="design-start-error" />
      ) : null}

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
        loading={startState.status === 'starting'}
        onPress={async () => {
          const job = await start();

          if (job !== undefined) {
            onStarted(job);
          }
        }}
        testID="design-start"
      />
    </Screen>
  );
}

function DesignDetails({
  design,
  mode,
}: {
  readonly design: DesignDetail;
  readonly mode: unknown;
}): ReactElement {
  const { locale, t } = useI18n();
  const theme = useTheme();
  const duration = describeDuration(design.estimatedDurationSeconds, locale);
  const inspiration = design.inspiration;
  const label =
    inspiration.kind === 'documented-traditional'
      ? t('design.inspiration.traditional')
      : t('design.inspiration.modern');

  return (
    <View style={styles.details}>
      <FadeIn style={styles.disc}>
        <DesignPreview path={design.previewPath} testID="design-preview" />
      </FadeIn>

      <FadeIn delay={120} style={styles.heading}>
        <ModeBadge mode={mode} testID="design-mode" />
        <AppText variant="display">{localize(design.title, locale)}</AppText>
        <AppText tone="textMuted">{localize(design.description, locale)}</AppText>
      </FadeIn>

      <FadeIn
        delay={220}
        style={[
          styles.card,
          shadows.soft,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
        ]}
      >
        <View style={[styles.cardBar, { backgroundColor: theme.gold }]} />
        <View style={styles.cardBody}>
          <AppText variant="label" tone="accentText" testID="design-inspiration-label">
            {label}
          </AppText>
          <AppText tone="textMuted">{localize(inspiration.note, locale)}</AppText>

          {inspiration.sources.length > 0 ? (
            <View style={styles.block}>
              <AppText variant="label" tone="textMuted">
                {t('design.sources')}
              </AppText>
              {inspiration.sources.map((source) => (
                <SourceLine
                  key={`${source.label}-${source.url ?? ''}`}
                  label={source.label}
                  url={source.url}
                />
              ))}
            </View>
          ) : null}
        </View>
      </FadeIn>

      <FadeIn delay={300} style={styles.duration}>
        <Icon name="clock" color={theme.gold} size={20} />
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

function SourceLine({
  label,
  url,
}: {
  readonly label: string;
  readonly url: string | undefined;
}): ReactElement {
  if (url === undefined) {
    return <AppText variant="caption">{label}</AppText>;
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        // A source link is a courtesy; if the phone cannot open it, nothing is lost.
        Linking.openURL(url).catch(() => undefined);
      }}
    >
      <AppText variant="caption" tone="accentText" style={styles.link}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.lg },
  disc: { paddingHorizontal: spacing.md },
  heading: { gap: spacing.sm, alignItems: 'flex-start' },
  card: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardBar: { width: 5 },
  cardBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  block: { gap: spacing.xs, marginTop: spacing.sm },
  duration: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  link: { textDecorationLine: 'underline' },
});
