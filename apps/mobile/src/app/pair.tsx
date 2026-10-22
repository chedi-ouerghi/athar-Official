import { useLocalSearchParams, useRouter } from 'expo-router';
import { PairScreen } from '../features/pairing/PairScreen';
import { routes } from '../navigation/routes';
import { useSession } from '../session/SessionProvider';

/** Opened by a scanned pairing QR code or an invitation link (`athar://pair?tableId=..&token=..`). */
export default function Pair() {
  const { tableId, token } = useLocalSearchParams<{ tableId: string; token: string }>();
  const router = useRouter();
  const { signOut } = useSession();

  return (
    <PairScreen
      tableId={tableId}
      token={token}
      onPaired={(id) => {
        // `replace`, so Back does not return to a spent token.
        router.replace(routes.table(id));
      }}
      onScanAnother={() => {
        // Back to the scanner this came from; opened by a link, there is nothing behind it.
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(routes.scan());
        }
      }}
      onSignOut={signOut}
    />
  );
}
