import { useRouter } from 'expo-router';
import { AccountScreen } from '../../features/account/AccountScreen';
import { routes } from '../../navigation/routes';
import { useSession } from '../../session/SessionProvider';

export default function Account() {
  const router = useRouter();
  const { account, signOut } = useSession();

  // Only reachable signed in; while the session ends there is nothing to show.
  if (account === undefined) {
    return null;
  }

  return (
    <AccountScreen
      account={account}
      onDiagnostics={() => {
        router.push(routes.diagnostics());
      }}
      onSignOut={signOut}
    />
  );
}
