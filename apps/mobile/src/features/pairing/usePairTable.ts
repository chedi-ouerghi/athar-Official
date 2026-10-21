import type { PairTableRequest, PairTableResponse } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useAction, type Action } from '../use-action';

/** Claim a table (first scan of its QR code) or join it as a guest (an invitation). */
export function usePairTable(): Action<[PairTableRequest], PairTableResponse> {
  const client = useApiClient();

  return useAction((request: PairTableRequest) => client.pairTable(request));
}
