import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { environment } from '../../config/environment';
import { HomeScreen } from '../../features/home/HomeScreen';
import { readRecentTable } from '../../features/home/recent-table';
import { routes } from '../../navigation/routes';
import { useSession } from '../../session/SessionProvider';

export default function Home() {
  const router = useRouter();
  const { account } = useSession();
  const [recent, setRecent] = useState(readRecentTable);

  // Coming back from a table, the last one opened may have changed.
  useFocusEffect(
    useCallback(() => {
      setRecent(readRecentTable());
    }, []),
  );

  return (
    <HomeScreen
      allowedHosts={environment.tableLinkHosts}
      name={account?.displayName ?? ''}
      recent={recent}
      onScan={() => {
        router.navigate(routes.scan());
      }}
      onTable={(tableId) => {
        router.push(routes.table(tableId));
      }}
      onPairing={({ tableId, token }) => {
        router.push(routes.pair(tableId, token));
      }}
    />
  );
}
