import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { environment } from '../config/environment';
import { ScanScreen } from '../features/scan/ScanScreen';
import { routes } from '../navigation/routes';

export default function Scan() {
  const router = useRouter();

  const onTable = useCallback(
    (tableId: string) => {
      router.replace(routes.table(tableId));
    },
    [router],
  );

  // The pairing screen redeems the token and shows loading and errors; the scanner only hands over.
  const onPairing = useCallback(
    ({ tableId, token }: { tableId: string; token: string }) => {
      router.replace(routes.pair(tableId, token));
    },
    [router],
  );

  return (
    <ScanScreen allowedHosts={environment.tableLinkHosts} onTable={onTable} onPairing={onPairing} />
  );
}
