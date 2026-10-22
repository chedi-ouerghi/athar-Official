import type { ActivateRequest, AuthAccount, LoginRequest } from '@athar/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useApiClient } from '../api/api-client-context';
import type { SessionManager } from './session-manager';

export interface SessionContextValue {
  /** The signed-in account, or `undefined` when signed out. */
  readonly account: AuthAccount | undefined;
  readonly signIn: (request: LoginRequest) => Promise<void>;
  readonly activate: (request: ActivateRequest) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Makes the session available to screens. Renders nothing until the stored
 * session has been read, so a signed-in user never sees the sign-in screen flash.
 */
export function SessionProvider({
  manager,
  children,
}: {
  readonly manager: SessionManager;
  readonly children: ReactNode;
}): ReactElement | null {
  const client = useApiClient();
  const [loaded, setLoaded] = useState(false);
  const session = useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.current,
  );

  useEffect(() => {
    void manager.load().then(() => {
      setLoaded(true);
    });
  }, [manager]);

  const signIn = useCallback(
    async (request: LoginRequest) => {
      await manager.set(await client.login(request));
    },
    [client, manager],
  );

  const activate = useCallback(
    async (request: ActivateRequest) => {
      await manager.set(await client.activate(request));
    },
    [client, manager],
  );

  const signOut = useCallback(async () => {
    // Best effort: the local session goes either way.
    await client.logout().catch(() => undefined);
    await manager.clear();
  }, [client, manager]);

  const value = useMemo(
    () => ({ account: session?.account, signIn, activate, signOut }),
    [session, signIn, activate, signOut],
  );

  return loaded ? (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  ) : null;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (value === null) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }

  return value;
}
