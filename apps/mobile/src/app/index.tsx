import { useRouter } from 'expo-router';
import { environment } from '../config/environment';
import { HomeScreen } from '../features/home/HomeScreen';
import { routes } from '../navigation/routes';
import { useSession } from '../session/SessionProvider';

export default function Home() {
  const router = useRouter();
  const { signOut } = useSession();

  return (
    <HomeScreen
      allowedHosts={environment.tableLinkHosts}
      onScan={() => {
        router.push(routes.scan());
      }}
      onTable={(tableId) => {
        router.push(routes.table(tableId));
      }}
      onDiagnostics={() => {
        router.push(routes.diagnostics());
      }}
      onSignOut={signOut}
    />
  );
}
