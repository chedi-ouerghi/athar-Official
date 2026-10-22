import { useLocalSearchParams, useRouter } from 'expo-router';
import { PairScreen } from '../features/pairing/PairScreen';
import { routes } from '../navigation/routes';

/** Opened by a scanned pairing QR code or an invitation link (`athar://pair?tableId=..&token=..`). */
export default function Pair() {
  const { tableId, token } = useLocalSearchParams<{ tableId: string; token: string }>();
  const router = useRouter();

  return (
    <PairScreen
      tableId={tableId}
      token={token}
      onPaired={(id) => {
        // `replace`, so Back does not return to a spent token.
        router.replace(routes.table(id));
      }}
      onScanAnother={() => {
        router.replace(routes.scan());
      }}
    />
  );
}
