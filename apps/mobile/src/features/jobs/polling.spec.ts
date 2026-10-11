import { jobStateSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/http-client';
import { job } from '../../test-fixtures';
import {
  MAX_POLL_DELAY_MS,
  isJobGone,
  isRetryablePollError,
  isScreenActive,
  nextPollDelay,
  shouldKeepPolling,
} from './polling';

describe('nextPollDelay', () => {
  it('waits one interval when nothing has failed', () => {
    expect(nextPollDelay(1000, 0)).toBe(1000);
    expect(nextPollDelay(250, 0)).toBe(250);
  });

  it('doubles for each consecutive failure', () => {
    expect([1, 2, 3, 4].map((failures) => nextPollDelay(1000, failures))).toStrictEqual([
      2000, 4000, 8000, 15_000,
    ]);
  });

  it('never exceeds the cap, however many have failed', () => {
    expect(nextPollDelay(1000, 50)).toBe(MAX_POLL_DELAY_MS);
    expect(nextPollDelay(60_000, 0)).toBe(MAX_POLL_DELAY_MS);
  });

  it('treats a nonsensical failure count as none', () => {
    expect(nextPollDelay(1000, -3)).toBe(1000);
    expect(nextPollDelay(1000, Number.NaN)).toBe(1000);
  });
});

describe('shouldKeepPolling', () => {
  it('keeps going before the first answer and while a job is active', () => {
    expect(shouldKeepPolling(undefined)).toBe(true);

    for (const state of ['queued', 'drawing', 'paused'] as const) {
      expect(shouldKeepPolling(job({ state })), state).toBe(true);
    }
  });

  it('stops at every terminal state', () => {
    for (const state of ['completed', 'failed', 'cancelled'] as const) {
      expect(shouldKeepPolling(job({ state })), state).toBe(false);
    }
  });

  it('knows every state', () => {
    for (const state of jobStateSchema.options) {
      expect(typeof shouldKeepPolling(job({ state }))).toBe('boolean');
    }
  });
});

describe('isRetryablePollError', () => {
  it('retries connection trouble and server faults', () => {
    expect(isRetryablePollError(new ApiError('network', 'x'))).toBe(true);
    expect(isRetryablePollError(new ApiError('timeout', 'x'))).toBe(true);
    expect(isRetryablePollError(new ApiError('http', 'x', 503, 'SERVICE_UNAVAILABLE'))).toBe(true);
    expect(isRetryablePollError(new ApiError('http', 'x', 500))).toBe(true);
  });

  it('does not retry what retrying cannot fix', () => {
    expect(isRetryablePollError(new ApiError('http', 'x', 400, 'VALIDATION_FAILED'))).toBe(false);
    expect(isRetryablePollError(new ApiError('http', 'x', 404, 'JOB_NOT_FOUND'))).toBe(false);
    expect(isRetryablePollError(new ApiError('invalid-response', 'x'))).toBe(false);
    expect(isRetryablePollError(new ApiError('cancelled', 'x'))).toBe(false);
    expect(isRetryablePollError(new Error('boom'))).toBe(false);
  });
});

describe('isJobGone', () => {
  it('is true only for JOB_NOT_FOUND', () => {
    expect(isJobGone(new ApiError('http', 'x', 404, 'JOB_NOT_FOUND'))).toBe(true);
    expect(isJobGone(new ApiError('http', 'x', 404, 'TABLE_NOT_FOUND'))).toBe(false);
    expect(isJobGone(new ApiError('network', 'x'))).toBe(false);
    expect(isJobGone(undefined)).toBe(false);
  });
});

describe('isScreenActive', () => {
  it('needs both the focus and the foreground', () => {
    expect(isScreenActive(true, 'active')).toBe(true);
    expect(isScreenActive(false, 'active')).toBe(false);
    expect(isScreenActive(true, 'background')).toBe(false);
    expect(isScreenActive(true, 'inactive')).toBe(false);
  });
});
