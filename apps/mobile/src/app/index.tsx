import { useRouter } from 'expo-router';
import { environment } from '../config/environment';
import { HomeScreen } from '../features/home/HomeScreen';
import { routes } from '../navigation/routes';

export default function Home() {
  const router = useRouter();

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
    />
  );
}
