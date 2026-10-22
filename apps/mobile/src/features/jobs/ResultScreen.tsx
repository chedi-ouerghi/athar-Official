import { isActiveJobState } from '@athar/contracts';
import { useEffect, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DotRule } from '../../components/DotRule';
import { ErrorState } from '../../components/ErrorState';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { LoadingState } from '../../components/LoadingState';
import { ModeBadge } from '../../components/ModeBadge';
import { NoticeCard } from '../../components/NoticeCard';
import { Screen } from '../../components/Screen';
import { SuccessMark } from '../../components/SuccessMark';
import { useI18n } from '../../i18n/context';
import { spacing } from '../../theme';
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
    <Screen
      testID="result-screen"
      contentStyle={styles.content}
      footer={
        <Button
          label={t('result.drawAgain')}
          dot
          onPress={onDrawAgain}
          testID="result-draw-again"
        />
      }
    >
      <FadeIn style={styles.badge}>
        <ModeBadge mode={state.job.mode} testID="result-mode" />
      </FadeIn>

      <SuccessMark
        tone={
          wording.tone === 'success' ? 'success' : wording.tone === 'danger' ? 'danger' : 'neutral'
        }
      />

      <FadeIn delay={staggerDelay(3)}>
        <View style={styles.words} testID="result-notice">
          <AppText variant="title" style={styles.centre}>
            {t(wording.title)}
          </AppText>
          <View style={styles.rule}>
            <DotRule />
          </View>
          <AppText tone="textMuted" style={styles.centre}>
            {t(wording.body)}
          </AppText>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.lg },
  badge: { alignItems: 'center' },
  words: { alignItems: 'center', gap: spacing.md },
  rule: { alignSelf: 'stretch' },
  centre: { textAlign: 'center' },
});
