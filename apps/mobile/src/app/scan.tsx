import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { environment } from '../config/environment';
import { ScanScreen } from '../features/scan/ScanScreen';
import { routes } from '../navigation/routes';

export default function Scan() {
  const router = useRouter();

  // `replace`, so Back from the table returns to the home screen, not to a camera.
  const onTable = useCallback(
    (tableId: string) => {
      router.replace(routes.table(tableId));
    },
    [router],
  );

  return <ScanScreen allowedHosts={environment.tableLinkHosts} onTable={onTable} />;
}
