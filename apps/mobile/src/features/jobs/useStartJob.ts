import type { DrawingJob } from '@athar/contracts';
import { useCallback, useRef, useState } from 'react';
import { useApiClient } from '../../api/api-client-context';
import { ApiError } from '../../api/http-client';
import { createUuid } from '../../api/request-id';

export type StartJobState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'error'; readonly error: unknown };

export interface UseStartJob {
  readonly state: StartJobState;
  /**
   * Ask the table to draw. Resolves with the job, or `undefined` when it failed
   * (the failure is in `state`) or a start was already under way.
   */
  readonly start: () => Promise<DrawingJob | undefined>;
}

/**
 * Starting a drawing from the design screen.
 *
 * `clientRequestId` is created when the screen opens and reused for every retry
 * of the same start, so the API answers a repeat with the original job instead of
 * starting a second one. Two taps in a row send one request: a start already
 * under way is not repeated.
 *
 * If the API says the id was used for a different design (which the app should
 * never cause), the id is replaced so a retry can succeed.
 */
export function useStartJob(tableId: string, designId: string): UseStartJob {
  const client = useApiClient();
  const [state, setState] = useState<StartJobState>({ status: 'idle' });
  const clientRequestId = useRef<string>(createUuid());
  const inFlight = useRef(false);

  const start = useCallback(async (): Promise<DrawingJob | undefined> => {
    if (inFlight.current) {
      return undefined;
    }

    inFlight.current = true;
    setState({ status: 'starting' });

    try {
      const job = await client.startJob(tableId, {
        designId,
        clientRequestId: clientRequestId.current,
      });

      setState({ status: 'idle' });
      return job;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'IDEMPOTENCY_CONFLICT') {
        clientRequestId.current = createUuid();
      }

      setState({ status: 'error', error });
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, [client, tableId, designId]);

  return { state, start };
}
