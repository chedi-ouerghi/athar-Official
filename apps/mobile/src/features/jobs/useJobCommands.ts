import type { DrawingJob } from '@athar/contracts';
import { useCallback, useRef, useState } from 'react';
import { useApiClient } from '../../api/api-client-context';
import { ApiError } from '../../api/http-client';

export type JobCommand = 'pause' | 'resume' | 'stop';

export interface UseJobCommands {
  /** The last command's failure, cleared by the next command. */
  readonly error: unknown;
  readonly run: (command: JobCommand) => Promise<void>;
}

/**
 * Pause, resume and stop.
 *
 * A command's answer is the updated job, which is used directly (no second round
 * trip). `INVALID_TRANSITION` means the job moved on without the screen knowing
 * (it finished, say), so the job is refreshed instead of the user being told off.
 * One command at a time: a second one while the first is under way is ignored.
 */
export function useJobCommands(
  jobId: string,
  handlers: {
    readonly applyJob: (job: DrawingJob) => void;
    readonly refresh: () => void;
  },
): UseJobCommands {
  const client = useApiClient();
  const [error, setError] = useState<unknown>(undefined);
  const inFlight = useRef(false);
  const { applyJob, refresh } = handlers;

  const run = useCallback(
    async (command: JobCommand): Promise<void> => {
      if (inFlight.current) {
        return;
      }

      inFlight.current = true;
      setError(undefined);

      try {
        const job = await (command === 'pause'
          ? client.pauseJob(jobId)
          : command === 'resume'
            ? client.resumeJob(jobId)
            : client.stopJob(jobId));

        applyJob(job);
      } catch (failure) {
        if (failure instanceof ApiError && failure.code === 'INVALID_TRANSITION') {
          refresh();
        } else {
          setError(failure);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [client, jobId, applyJob, refresh],
  );

  return { error, run };
}
