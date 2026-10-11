import { useLocalSearchParams, useRouter } from 'expo-router';
import { DesignScreen } from '../../../../features/designs/DesignScreen';
import { routes } from '../../../../navigation/routes';

export default function Design() {
  const { tableId, designId } = useLocalSearchParams<{ tableId: string; designId: string }>();
  const router = useRouter();

  return (
    <DesignScreen
      tableId={tableId}
      designId={designId}
      // `replace`: Back from the progress screen goes to the table, not to a start
      // button that belongs to a drawing already begun.
      onStarted={(job) => {
        router.replace(routes.job(tableId, job.id));
      }}
      onWatchJob={(jobId) => {
        router.replace(routes.job(tableId, jobId));
      }}
    />
  );
}
