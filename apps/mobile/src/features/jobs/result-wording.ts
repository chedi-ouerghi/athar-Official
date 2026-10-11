import type { DrawingJob, JobErrorCode } from '@athar/contracts';
import { resolveDisplayMode, type DisplayMode } from '../../components/mode';
import type { TranslationKey } from '../../i18n/en';

export type FinishedState = 'completed' | 'failed' | 'cancelled';

export interface ResultWording {
  readonly title: TranslationKey;
  readonly body: TranslationKey;
  readonly tone: 'success' | 'danger' | 'neutral';
}

const JOB_ERROR_KEY: Readonly<Record<JobErrorCode, TranslationKey>> = {
  OFFLINE: 'job.error.OFFLINE',
  BUSY: 'job.error.BUSY',
  TRAJECTORY_REJECTED: 'job.error.TRAJECTORY_REJECTED',
  FAULT: 'job.error.FAULT',
  SIMULATED_FAULT: 'job.error.SIMULATED_FAULT',
};

const TITLE_KEY: Readonly<Record<FinishedState, Readonly<Record<DisplayMode, TranslationKey>>>> = {
  completed: {
    simulation: 'result.title.completed.simulation',
    hardware: 'result.title.completed.hardware',
    unknown: 'result.title.completed.unknown',
  },
  failed: {
    simulation: 'result.title.failed.simulation',
    hardware: 'result.title.failed.hardware',
    unknown: 'result.title.failed.unknown',
  },
  cancelled: {
    simulation: 'result.title.cancelled.simulation',
    hardware: 'result.title.cancelled.hardware',
    unknown: 'result.title.cancelled.unknown',
  },
};

const BODY_KEY: Readonly<
  Record<Exclude<FinishedState, 'failed'>, Readonly<Record<DisplayMode, TranslationKey>>>
> = {
  completed: {
    simulation: 'result.body.completed.simulation',
    hardware: 'result.body.completed.hardware',
    unknown: 'result.body.completed.unknown',
  },
  cancelled: {
    simulation: 'result.body.cancelled.simulation',
    hardware: 'result.body.cancelled.hardware',
    unknown: 'result.body.cancelled.unknown',
  },
};

/**
 * The words for a finished job. Fail-closed on mode, like the badge: a drawing is
 * described as a simulation when it is one, and nothing suggests a physical
 * drawing unless the mode is exactly `hardware`. A mode that is missing or
 * unrecognised gets wording that claims neither.
 *
 * Returns `undefined` for a job that has not finished.
 */
export function describeResult(job: DrawingJob): ResultWording | undefined {
  const mode = resolveDisplayMode(job.mode);

  switch (job.state) {
    case 'completed':
      return { title: TITLE_KEY.completed[mode], body: BODY_KEY.completed[mode], tone: 'success' };
    case 'cancelled':
      return { title: TITLE_KEY.cancelled[mode], body: BODY_KEY.cancelled[mode], tone: 'neutral' };
    case 'failed':
      return {
        title: TITLE_KEY.failed[mode],
        body: job.errorCode === null ? 'job.error.unknown' : JOB_ERROR_KEY[job.errorCode],
        tone: 'danger',
      };
    default:
      return undefined;
  }
}

export const JOB_STATE_KEY: Readonly<Record<DrawingJob['state'], TranslationKey>> = {
  queued: 'job.state.queued',
  drawing: 'job.state.drawing',
  paused: 'job.state.paused',
  completed: 'job.state.completed',
  failed: 'job.state.failed',
  cancelled: 'job.state.cancelled',
};
