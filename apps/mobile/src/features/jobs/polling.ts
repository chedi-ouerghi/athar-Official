/**
 * The rules of polling a job, as pure functions so the schedule can be tested
 * without a clock or a screen.
 */

import { isTerminalJobState, type DrawingJob } from '@athar/contracts';
import { ApiError } from '../../api/http-client';

/** Longest wait between two polls, however many have failed. */
export const MAX_POLL_DELAY_MS = 15_000;

/**
 * Wait before the next poll. A healthy poll waits one interval; each consecutive
 * failure doubles it, up to {@link MAX_POLL_DELAY_MS}, so a phone with no signal
 * stops hammering the API and a recovering API is not met by a stampede.
 */
export function nextPollDelay(intervalMs: number, consecutiveFailures: number): number {
  const failures = Number.isFinite(consecutiveFailures)
    ? Math.max(0, Math.floor(consecutiveFailures))
    : 0;

  return Math.min(MAX_POLL_DELAY_MS, intervalMs * 2 ** failures);
}

/** Whether another poll can change anything: a finished job never changes. */
export function shouldKeepPolling(job: DrawingJob | undefined): boolean {
  return job === undefined || !isTerminalJobState(job.state);
}

/** Whether a polling failure is worth trying again (the job itself is not at fault). */
export function isRetryablePollError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  switch (error.kind) {
    case 'network':
    case 'timeout':
      return true;
    case 'http':
      return error.status !== undefined && error.status >= 500;
    default:
      return false;
  }
}

/** The job the API no longer knows, e.g. after a restart. A state, not a failure. */
export function isJobGone(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.code === 'JOB_NOT_FOUND';
}

/** Polling runs only while the screen is in front of the user and the app is in use. */
export function isScreenActive(focused: boolean, appState: string): boolean {
  return focused && appState === 'active';
}
