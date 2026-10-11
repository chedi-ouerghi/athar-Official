import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { TableScreen } from '../../../features/tables/TableScreen';
import { routes } from '../../../navigation/routes';

export default function Table() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const router = useRouter();
  const focused = useIsFocused();

  return (
    <TableScreen
      tableId={tableId}
      active={focused}
      onOpenDesign={(designId) => {
        router.push(routes.design(tableId, designId));
      }}
      onWatchJob={(jobId) => {
        router.push(routes.job(tableId, jobId));
      }}
      onScanAnother={() => {
        router.replace(routes.scan());
      }}
    />
  );
}
