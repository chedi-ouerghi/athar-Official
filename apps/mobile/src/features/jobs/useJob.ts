import type { DrawingJob } from '@athar/contracts';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useApiClient } from '../../api/api-client-context';
import { ApiError } from '../../api/http-client';
import { isJobGone, isRetryablePollError, nextPollDelay, shouldKeepPolling } from './polling';

export type JobState =
  | { readonly status: 'loading' }
  /** `trouble`: the last poll failed and the job shown is the last one known. */
  | { readonly status: 'ready'; readonly job: DrawingJob; readonly trouble: boolean }
  /** The API does not know this job (for instance after it restarted). */
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: unknown };

type Action =
  | { readonly type: 'loaded'; readonly job: DrawingJob }
  | { readonly type: 'trouble'; readonly error: unknown }
  | { readonly type: 'not-found' }
  | { readonly type: 'failed'; readonly error: unknown };

function reduce(state: JobState, action: Action): JobState {
  switch (action.type) {
    case 'loaded':
      return { status: 'ready', job: action.job, trouble: false };
    case 'trouble':
      // Keep showing what we last knew; only a job we never saw is an error.
      return state.status === 'ready'
        ? { ...state, trouble: true }
        : { status: 'error', error: action.error };
    case 'not-found':
      return { status: 'not-found' };
    case 'failed':
      return { status: 'error', error: action.error };
  }
}

export interface UseJobOptions {
  /** Delay between polls. */
  readonly intervalMs: number;
  /**
   * Whether to poll at all. Pass false while the screen is not in front of the
   * user or the app is in the background; polling resumes at once when it turns
   * true again.
   */
  readonly active: boolean;
}

export interface UseJob {
  readonly state: JobState;
  /** Fetch now and keep polling. For a retry after an error. */
  readonly refresh: () => void;
  /**
   * Use a job the API just returned (a command's response) as the current one, so
   * the screen updates without waiting for the next poll.
   */
  readonly applyJob: (job: DrawingJob) => void;
}

/**
 * A job, kept current by polling.
 *
 * It stops at a terminal state, aborts on unmount, backs off after failures, and
 * reports a job the API no longer knows as its own state. It owns no business
 * rules: the server decides what is valid.
 */
export function useJob(jobId: string, { intervalMs, active }: UseJobOptions): UseJob {
  const client = useApiClient();
  const [state, dispatch] = useReducer(reduce, { status: 'loading' } as JobState);
  const [attempt, refresh] = useReducer((value: number) => value + 1, 0);

  // What the polling loop needs to know without being restarted by it.
  const latest = useRef<DrawingJob | undefined>(undefined);

  useEffect(() => {
    if (!active || !shouldKeepPolling(latest.current)) {
      return undefined;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const poll = async (): Promise<void> => {
      try {
        const job = await client.getJob(jobId, controller.signal);
        failures = 0;
        latest.current = job;
        dispatch({ type: 'loaded', job });
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof ApiError && error.kind === 'cancelled')
        ) {
          return;
        }

        if (isJobGone(error)) {
          dispatch({ type: 'not-found' });
          return;
        }

        if (!isRetryablePollError(error)) {
          dispatch({ type: 'failed', error });
          return;
        }

        failures += 1;
        dispatch({ type: 'trouble', error });
      }

      if (shouldKeepPolling(latest.current)) {
        timer = setTimeout(
          () => {
            // A command may have finished the job while this wait was running.
            if (shouldKeepPolling(latest.current)) {
              void poll();
            }
          },
          nextPollDelay(intervalMs, failures),
        );
      }
    };

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, jobId, intervalMs, active, attempt]);

  const applyJob = useCallback((job: DrawingJob) => {
    latest.current = job;
    dispatch({ type: 'loaded', job });
  }, []);

  return { state, refresh, applyJob };
}
