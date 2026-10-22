import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { environment } from '../../../../config/environment';
import { JobScreen } from '../../../../features/jobs/JobScreen';
import { useTable } from '../../../../features/tables/useTable';
import { useScreenActive } from '../../../../features/jobs/use-screen-active';
import { routes } from '../../../../navigation/routes';

export default function Job() {
  const { tableId, jobId } = useLocalSearchParams<{ tableId: string; jobId: string }>();
  const router = useRouter();
  const active = useScreenActive();
  const left = useRef(false);
  // For the shape of the picture only: the screen works without it, as a round table.
  const table = useTable(tableId);
  const geometry = table.state.status === 'ready' ? table.state.data.geometry : undefined;

  // Once only: the job may be reported finished by several renders.
  const onFinished = useCallback(() => {
    if (!left.current) {
      left.current = true;
      router.replace(routes.result(tableId, jobId));
    }
  }, [router, tableId, jobId]);

  const onBackToTable = useCallback(() => {
    router.navigate(routes.table(tableId));
  }, [router, tableId]);

  return (
    <JobScreen
      jobId={jobId}
      active={active}
      pollIntervalMs={environment.pollIntervalMs}
      geometry={geometry}
      onFinished={onFinished}
      onBackToTable={onBackToTable}
    />
  );
}
