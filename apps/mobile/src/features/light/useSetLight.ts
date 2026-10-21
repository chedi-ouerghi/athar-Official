import type { LightInput } from '@athar/contracts';
import { useCallback } from 'react';
import { useApiClient } from '../../api/api-client-context';

/**
 * Sends a light command to the table. Unlike `useAction` it allows several calls
 * at once and leaves ordering and failure to the caller: a colour picker fires
 * often and shows its own state instantly (`LightControl`).
 */
export function useSetLight(tableId: string): (light: LightInput) => Promise<unknown> {
  const client = useApiClient();

  return useCallback((light: LightInput) => client.setLight(tableId, light), [client, tableId]);
}
