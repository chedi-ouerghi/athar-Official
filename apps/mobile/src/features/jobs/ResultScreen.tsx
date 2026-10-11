import { isActiveJobState } from '@athar/contracts';
import { useEffect, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ModeBadge } from '../../components/ModeBadge';
import { NoticeCard } from '../../components/NoticeCard';
import { FadeIn } from '../../components/FadeIn';
import { Ornament } from '../../components/Ornament';
import { Screen } from '../../components/Screen';
import { useI18n } from '../../i18n/context';
import { describeResult } from './result-wording';
import { useJob } from './useJob';

export interface ResultScreenProps {
  readonly jobId: string;
  readonly pollIntervalMs: number;
  /** The job is still running (someone opened this address early): go back to watching it. */
  readonly onStillRunning: () => void;
  /** Back to the table. The next start from there uses a new request id. */
  readonly onDrawAgain: () => void;
}

/** How a drawing ended, in words that never call a simulation a real drawing. */
export function ResultScreen({
  jobId,
  pollIntervalMs,
  onStillRunning,
  onDrawAgain,
}: ResultScreenProps): ReactElement {
  const { t } = useI18n();
  // One read is enough for a finished job: the hook stops polling at a terminal state.
  const { state, refresh } = useJob(jobId, { intervalMs: pollIntervalMs, active: true });

  const running = state.status === 'ready' && isActiveJobState(state.job.state);

  useEffect(() => {
    if (running) {
      onStillRunning();
    }
  }, [running, onStillRunning]);

  if (state.status === 'loading' || running) {
    return (
      <Screen scroll={false}>
        <LoadingState testID="result-loading" />
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
          testID="result-gone"
        >
          <Button label={t('job.backToTable')} onPress={onDrawAgain} testID="result-back" />
        </NoticeCard>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <ErrorState error={state.error} onRetry={refresh} testID="result-error" />
      </Screen>
    );
  }

  const wording = describeResult(state.job);

  if (wording === undefined) {
    return (
      <Screen scroll={false}>
        <LoadingState testID="result-loading" />
      </Screen>
    );
  }

  return (
    <Screen testID="result-screen">
      <ModeBadge mode={state.job.mode} testID="result-mode" />
      <FadeIn style={styles.ornament}>
        <Ornament size={160} strength={0.9} />
      </FadeIn>
      <FadeIn delay={140}>
        <NoticeCard
          title={t(wording.title)}
          body={t(wording.body)}
          tone={
            wording.tone === 'success'
              ? 'success'
              : wording.tone === 'danger'
                ? 'danger'
                : 'neutral'
          }
          testID="result-notice"
        />
      </FadeIn>
      <Button label={t('result.drawAgain')} onPress={onDrawAgain} testID="result-draw-again" />
    </Screen>
  );
}

const styles = StyleSheet.create({ ornament: { alignItems: 'center' } });
