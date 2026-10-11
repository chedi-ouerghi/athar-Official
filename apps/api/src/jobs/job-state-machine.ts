/**
 * The drawing-job state machine, as pure functions.
 *
 * The transitions themselves are **data** in `@athar/contracts`
 * (`JOB_TRANSITIONS`), shared with the app; nothing here duplicates them. These
 * functions only apply that data to a job: given a state and a trigger, they say
 * what the state becomes, or that the trigger is not allowed. They do no I/O,
 * read no clock and change nothing they are given, so the whole machine can be
 * tested by walking every state against every trigger.
 *
 * See docs/architecture.md, section 4.
 */

import {
  JOB_TRANSITIONS,
  isTerminalJobState,
  nextJobState,
  type DriverPhase,
  type DriverStatus,
  type DrawingJob,
  type JobErrorCode,
  type JobState,
  type JobTrigger,
} from '@athar/contracts';

/** What a client can ask of a running job. Each is also a machine trigger. */
export type JobCommand = 'pause' | 'resume' | 'stop';

export type TransitionResult =
  | { readonly ok: true; readonly state: JobState }
  | { readonly ok: false; readonly from: JobState; readonly trigger: JobTrigger };

/** The state `trigger` leads to from `from`, or a rejection. */
export function transition(from: JobState, trigger: JobTrigger): TransitionResult {
  const state = nextJobState(from, trigger);

  return state === undefined ? { ok: false, from, trigger } : { ok: true, state };
}

/**
 * The message for a command the job's state does not allow. It names the current
 * state so a client can refresh instead of guessing.
 */
export function describeRejectedCommand(command: JobCommand, state: JobState): string {
  return `Cannot ${command} a job that is ${state}.`;
}

/** The job state that matches what a driver reports, or `undefined` for an idle table. */
export function stateForPhase(phase: DriverPhase): JobState | undefined {
  switch (phase) {
    case 'drawing':
      return 'drawing';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'idle':
      return undefined;
  }
}

/**
 * The trigger that leads from one state to another, if exactly one does.
 *
 * It is how a driver's report ("the table is now paused") is turned back into the
 * transition it means. Every pair of states is joined by at most one trigger, so
 * there is never a choice to make.
 */
export function triggerBetween(from: JobState, to: JobState): JobTrigger | undefined {
  return JOB_TRANSITIONS.find((candidate) => candidate.from === from && candidate.to === to)
    ?.trigger;
}

/** Fields a transition may set alongside the new state. */
export interface TransitionDetails {
  /** Progress to record; it is never allowed to go down. */
  readonly progress?: number;
  /** Why the job failed. Only used on a transition into `failed`. */
  readonly errorCode?: JobErrorCode | null;
}

/** A progress below 1 for a job that has not completed, since 1 means completed. */
const ALMOST_COMPLETE = 0.999999;

/**
 * Apply a trigger to a job.
 *
 * @returns the updated job, or `undefined` if the trigger is not allowed in the
 *   job's state. The input is never changed.
 */
export function applyTrigger(
  job: DrawingJob,
  trigger: JobTrigger,
  now: string,
  details: TransitionDetails = {},
): DrawingJob | undefined {
  const result = transition(job.state, trigger);

  if (!result.ok) {
    return undefined;
  }

  const { state } = result;
  const terminal = isTerminalJobState(state);
  const wanted = Math.max(job.progress, details.progress ?? job.progress);
  const progress = state === 'completed' ? 1 : Math.min(wanted, ALMOST_COMPLETE);

  return {
    ...job,
    state,
    progress,
    updatedAt: now,
    startedAt: state === 'drawing' ? (job.startedAt ?? now) : job.startedAt,
    finishedAt: terminal ? now : job.finishedAt,
    errorCode: state === 'failed' ? (details.errorCode ?? job.errorCode ?? 'FAULT') : job.errorCode,
  };
}

export interface DriverStatusOutcome {
  /** The job after applying the status; the same object if nothing changed. */
  readonly job: DrawingJob;
  readonly changed: boolean;
  /** Set when the status describes something a job in this state cannot do. */
  readonly rejected?: string;
}

/**
 * Apply what a driver reports about a table to the job running on it.
 *
 * - A status about a different job, or about an idle table, changes nothing.
 * - A finished job never changes again.
 * - A status that agrees with the job's state may still advance its progress,
 *   never backwards.
 * - A status that disagrees is turned into the transition it means, through the
 *   state machine. If the machine has no such transition (a driver claiming that
 *   a queued job is paused) it is rejected and the job is left alone.
 */
export function applyDriverStatus(
  job: DrawingJob,
  status: DriverStatus,
  now: string,
): DriverStatusOutcome {
  const unchanged: DriverStatusOutcome = { job, changed: false };

  if (status.jobId !== job.id || isTerminalJobState(job.state)) {
    return unchanged;
  }

  const target = stateForPhase(status.phase);

  if (target === undefined) {
    return unchanged;
  }

  if (target === job.state) {
    return status.progress > job.progress
      ? {
          job: { ...job, progress: Math.min(status.progress, ALMOST_COMPLETE), updatedAt: now },
          changed: true,
        }
      : unchanged;
  }

  const trigger = triggerBetween(job.state, target);

  if (trigger === undefined) {
    return {
      job,
      changed: false,
      rejected: `The driver reported ${status.phase} for a job that is ${job.state}.`,
    };
  }

  const next = applyTrigger(job, trigger, now, {
    progress: status.progress,
    errorCode: status.errorCode,
  });

  return next === undefined ? unchanged : { job: next, changed: true };
}
