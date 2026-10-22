import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { environment } from '../../config/environment';
import { ScanScreen } from '../../features/scan/ScanScreen';
import { routes } from '../../navigation/routes';

export default function Scan() {
  const router = useRouter();

  // The pairing screen redeems the code and shows loading and errors; the scanner only hands over.
  // `push`, so Back returns to the scanner, which starts scanning again.
  const onPairing = useCallback(
    ({ tableId, token }: { tableId: string; token: string }) => {
      router.push(routes.pair(tableId, token));
    },
    [router],
  );

  return <ScanScreen allowedHosts={environment.tableLinkHosts} onPairing={onPairing} />;
}
