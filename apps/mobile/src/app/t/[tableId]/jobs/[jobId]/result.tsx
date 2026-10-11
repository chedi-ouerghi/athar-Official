import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { environment } from '../../../../../config/environment';
import { ResultScreen } from '../../../../../features/jobs/ResultScreen';
import { routes } from '../../../../../navigation/routes';

export default function Result() {
  const { tableId, jobId } = useLocalSearchParams<{ tableId: string; jobId: string }>();
  const router = useRouter();

  const onStillRunning = useCallback(() => {
    router.replace(routes.job(tableId, jobId));
  }, [router, tableId, jobId]);

  // `navigate` returns to the table already in the stack, dropping the screens
  // above it, so the next design screen opens fresh with a new request id.
  const onDrawAgain = useCallback(() => {
    router.navigate(routes.table(tableId));
  }, [router, tableId]);

  return (
    <ResultScreen
      jobId={jobId}
      pollIntervalMs={environment.pollIntervalMs}
      onStillRunning={onStillRunning}
      onDrawAgain={onDrawAgain}
    />
  );
}
