import { isTerminalJobState, type DrawingJob, type TableGeometry } from '@athar/contracts';
import { useEffect, type ReactElement } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DesignPreview } from '../../components/DesignPreview';
import { ErrorState } from '../../components/ErrorState';
import { Eyebrow } from '../../components/Eyebrow';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { LoadingState } from '../../components/LoadingState';
import { NoticeCard } from '../../components/NoticeCard';
import { ProgressBar } from '../../components/ProgressBar';
import { Screen } from '../../components/Screen';
import { useI18n } from '../../i18n/context';
import { spacing } from '../../theme';
import { useDesign } from '../designs/useDesign';
import { JOB_STATE_KEY } from './result-wording';
import { useJob } from './useJob';
import { useJobCommands, type JobCommand } from './useJobCommands';

export interface JobScreenProps {
  readonly jobId: string;
  /** Poll only while true: the screen is in front and the app is in use. */
  readonly active: boolean;
  readonly pollIntervalMs: number;
  /** The table's shape and size, so the picture has its shape. Round when left out. */
  readonly geometry?: TableGeometry;
  /** The job reached a terminal state: go to the result. Called once per job. */
  readonly onFinished: () => void;
  readonly onBackToTable: () => void;
}

/** A drawing in progress: the picture filling in, and the commands pinned below it. */
export function JobScreen({
  jobId,
  active,
  pollIntervalMs,
  geometry,
  onFinished,
  onBackToTable,
}: JobScreenProps): ReactElement {
  const { t } = useI18n();
  const { state, refresh, applyJob } = useJob(jobId, { intervalMs: pollIntervalMs, active });
  const commands = useJobCommands(jobId, { applyJob, refresh });

  if (state.status === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState testID="job-loading" />
      </Screen>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Screen>
        <NoticeCard
          title={t('job.gone.title')}
          body={t('error.jobNotFound')}
          tone="warning"
          testID="job-gone"
        >
          <Button label={t('job.backToTable')} onPress={onBackToTable} testID="job-back" />
        </NoticeCard>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <ErrorState error={state.error} onRetry={refresh} testID="job-error" />
      </Screen>
    );
  }

  return (
    <JobBody
      job={state.job}
      geometry={geometry}
      trouble={state.trouble}
      commandError={commands.error}
      onCommand={commands.run}
      onFinished={onFinished}
    />
  );
}

interface JobBodyProps {
  readonly job: DrawingJob;
  readonly geometry: TableGeometry | undefined;
  readonly trouble: boolean;
  readonly commandError: unknown;
  readonly onCommand: (command: JobCommand) => Promise<void>;
  readonly onFinished: () => void;
}

function JobBody({
  job,
  geometry,
  trouble,
  commandError,
  onCommand,
  onFinished,
}: JobBodyProps): ReactElement {
  const { t, percent } = useI18n();
  // The design is fetched once for the picture. If it fails, the bar still shows
  // everything that matters: the preview is never required to show state.
  const design = useDesign(job.designId);
  const finished = isTerminalJobState(job.state);

  useEffect(() => {
    if (finished) {
      onFinished();
    }
  }, [finished, onFinished]);

  const confirmStop = () => {
    // react-native-web's Alert.alert does nothing, so the web asks with the browser's own dialog.
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('job.stop.confirmTitle')}\n${t('job.stop.confirmBody')}`)) {
        void onCommand('stop');
      }
      return;
    }

    Alert.alert(t('job.stop.confirmTitle'), t('job.stop.confirmBody'), [
      { text: t('job.stop.keep'), style: 'cancel' },
      {
        text: t('job.stop.confirm'),
        style: 'destructive',
        onPress: () => {
          void onCommand('stop');
        },
      },
    ]);
  };

  const commands = finished ? undefined : (
    <View style={styles.commands}>
      {job.state === 'drawing' ? (
        <Button
          label={t('job.pause')}
          variant="secondary"
          icon="pause"
          onPress={() => onCommand('pause')}
          testID="job-pause"
        />
      ) : null}
      {job.state === 'paused' ? (
        <Button
          label={t('job.resume')}
          icon="play"
          onPress={() => onCommand('resume')}
          testID="job-resume"
        />
      ) : null}
      <Button
        label={t('job.stop')}
        variant="ghost"
        icon="stop"
        onPress={confirmStop}
        testID="job-stop"
      />
    </View>
  );

  return (
    <Screen testID="job-screen" footer={commands}>
      {design.state.status === 'ready' && design.state.data !== null ? (
        <FadeIn>
          <Card tone="glow" padding="md" style={styles.stage}>
            <DesignPreview
              path={design.state.data.previewPath}
              progress={job.progress}
              ring
              geometry={geometry}
              testID="job-preview"
            />
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn delay={staggerDelay(2)} style={styles.status}>
        <AppText variant="hero" testID="job-percent">
          {percent(job.progress)}
        </AppText>
        <Eyebrow accent testID="job-state">
          {t(JOB_STATE_KEY[job.state])}
        </Eyebrow>
      </FadeIn>

      <ProgressBar progress={job.progress} />

      {trouble ? (
        <AppText tone="warning" accessibilityRole="alert" testID="job-trouble">
          {t('job.reconnecting')}
        </AppText>
      ) : null}

      {commandError !== undefined ? (
        <ErrorState error={commandError} testID="job-command-error" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center' },
  status: { gap: spacing.xs, alignItems: 'center' },
  commands: { gap: spacing.sm },
});
