import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { AtharApiClient } from './athar-api-client';

const ApiClientContext = createContext<AtharApiClient | null>(null);

/**
 * Makes the one API client available to every screen and hook. The root layout
 * creates it from the validated configuration; tests hand in a stub.
 */
export function ApiClientProvider({
  client,
  children,
}: {
  readonly client: AtharApiClient;
  readonly children: ReactNode;
}): ReactElement {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): AtharApiClient {
  const client = useContext(ApiClientContext);

  if (client === null) {
    throw new Error('useApiClient must be used inside an ApiClientProvider.');
  }

  return client;
}
