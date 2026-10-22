import {
  JOB_TRANSITIONS,
  jobStateSchema,
  jobTriggerSchema,
  type DrawingJob,
  type DriverStatus,
  type JobState,
  type JobTrigger,
} from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyDriverStatus,
  applyTrigger,
  describeRejectedCommand,
  stateForPhase,
  transition,
  triggerBetween,
} from './job-state-machine.js';

const STATES = jobStateSchema.options;
const TRIGGERS = jobTriggerSchema.options;

/**
 * The specification, written out independently of `JOB_TRANSITIONS`, so that the
 * test fails if the data and docs/architecture.md section 4 drift apart.
 */
const ALLOWED: Readonly<Record<string, JobState>> = {
  'queued/driver-accepted': 'drawing',
  'queued/driver-rejected': 'failed',
  'queued/stop': 'cancelled',
  'drawing/pause': 'paused',
  'paused/resume': 'drawing',
  'drawing/driver-completed': 'completed',
  'drawing/driver-fault': 'failed',
  'paused/driver-fault': 'failed',
  'drawing/stop': 'cancelled',
  'paused/stop': 'cancelled',
};

const NOW = '2026-01-01T00:00:10.000Z';

function job(overrides: Partial<DrawingJob> = {}): DrawingJob {
  return {
    id: '4d7a5f0e-5b0b-4f0e-9d0e-0a0a0a0a0a0a',
    tableId: 'table-001',
    kind: 'design',
    designId: 'star',
    mode: 'simulation',
    state: 'queued',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    errorCode: null,
    ...overrides,
  };
}

function status(overrides: Partial<DriverStatus> = {}): DriverStatus {
  return {
    tableId: 'table-001',
    mode: 'simulation',
    connection: 'busy',
    phase: 'drawing',
    jobId: job().id,
    progress: 0.25,
    errorCode: null,
    ambienceId: null,
    observedAt: NOW,
    ...overrides,
  };
}

describe('the job state machine: every state against every trigger', () => {
  const pairs = STATES.flatMap((state) =>
    TRIGGERS.map((trigger) => [state, trigger] as [JobState, JobTrigger]),
  );

  it('walks the whole matrix: 6 states x 7 triggers', () => {
    expect(STATES).toHaveLength(6);
    expect(TRIGGERS).toHaveLength(7);
    expect(pairs).toHaveLength(42);
  });

  it.each(pairs)('%s + %s', (from, trigger) => {
    const expected = ALLOWED[`${from}/${trigger}`];
    const result = transition(from, trigger);

    if (expected === undefined) {
      expect(result).toStrictEqual({ ok: false, from, trigger });
    } else {
      expect(result).toStrictEqual({ ok: true, state: expected });
    }
  });

  it('allows exactly ten of the 42 combinations', () => {
    expect(pairs.filter(([from, trigger]) => transition(from, trigger).ok)).toHaveLength(10);
    expect(JOB_TRANSITIONS).toHaveLength(10);
  });

  it('lets no trigger change a finished job', () => {
    for (const from of ['completed', 'failed', 'cancelled'] as const) {
      for (const trigger of TRIGGERS) {
        expect(transition(from, trigger).ok).toBe(false);
        expect(applyTrigger(job({ state: from }), trigger, NOW)).toBeUndefined();
      }
    }
  });

  describe('applyTrigger, for every allowed transition', () => {
    it.each(Object.entries(ALLOWED))('%s', (key, to) => {
      const [from, trigger] = key.split('/') as [JobState, JobTrigger];
      const before = job({
        state: from,
        progress: 0.4,
        startedAt: from === 'queued' ? null : '2026-01-01T00:00:01.000Z',
      });
      const copy = JSON.stringify(before);

      const after = applyTrigger(before, trigger, NOW, { errorCode: 'FAULT' });

      expect(after?.state).toBe(to);
      expect(after?.updatedAt).toBe(NOW);
      expect(JSON.stringify(before)).toBe(copy);
      // Finishing sets finishedAt; nothing else does.
      expect(after?.finishedAt).toBe(
        ['completed', 'failed', 'cancelled'].includes(to) ? NOW : null,
      );
      // Only a failure carries an error code.
      expect(after?.errorCode).toBe(to === 'failed' ? 'FAULT' : null);
      // Progress is 1 if and only if the job completed.
      expect(after?.progress === 1).toBe(to === 'completed');
    });
  });

  describe('applyTrigger, the details', () => {
    it('sets startedAt the first time a job draws, and keeps it after a pause and resume', () => {
      const started = applyTrigger(job(), 'driver-accepted', NOW)!;
      const paused = applyTrigger(started, 'pause', '2026-01-01T00:00:20.000Z')!;
      const resumed = applyTrigger(paused, 'resume', '2026-01-01T00:00:30.000Z')!;

      expect(started.startedAt).toBe(NOW);
      expect(resumed.startedAt).toBe(NOW);
    });

    it('never moves progress backwards', () => {
      const paused = job({ state: 'paused', progress: 0.5 });

      expect(applyTrigger(paused, 'stop', NOW, { progress: 0.1 })?.progress).toBe(0.5);
      expect(applyTrigger(paused, 'stop', NOW, { progress: 0.7 })?.progress).toBe(0.7);
    });

    it('keeps progress below 1 for anything that did not complete', () => {
      const drawing = job({ state: 'drawing' });

      expect(applyTrigger(drawing, 'stop', NOW, { progress: 1 })!.progress).toBeLessThan(1);
      expect(applyTrigger(drawing, 'driver-completed', NOW)!.progress).toBe(1);
    });

    it('records the error code a failure gives, and falls back to FAULT', () => {
      const drawing = job({ state: 'drawing' });

      expect(
        applyTrigger(drawing, 'driver-fault', NOW, { errorCode: 'SIMULATED_FAULT' })?.errorCode,
      ).toBe('SIMULATED_FAULT');
      expect(applyTrigger(drawing, 'driver-fault', NOW)?.errorCode).toBe('FAULT');
      expect(applyTrigger(drawing, 'driver-fault', NOW, { errorCode: null })?.errorCode).toBe(
        'FAULT',
      );
    });

    it('does not record an error code on a job that did not fail', () => {
      expect(
        applyTrigger(job({ state: 'drawing' }), 'stop', NOW, { errorCode: 'OFFLINE' })?.errorCode,
      ).toBeNull();
    });
  });
});

describe('describeRejectedCommand', () => {
  it('names the command and the state the job is in', () => {
    expect(describeRejectedCommand('pause', 'paused')).toBe('Cannot pause a job that is paused.');
    expect(describeRejectedCommand('resume', 'completed')).toBe(
      'Cannot resume a job that is completed.',
    );
    expect(describeRejectedCommand('stop', 'cancelled')).toBe(
      'Cannot stop a job that is cancelled.',
    );
  });
});

describe('stateForPhase', () => {
  it('maps what the table does to what the job is', () => {
    expect(stateForPhase('drawing')).toBe('drawing');
    expect(stateForPhase('paused')).toBe('paused');
    expect(stateForPhase('completed')).toBe('completed');
    expect(stateForPhase('failed')).toBe('failed');
    expect(stateForPhase('cancelled')).toBe('cancelled');
  });

  it('has nothing for an idle table, which is running no job', () => {
    expect(stateForPhase('idle')).toBeUndefined();
  });
});

describe('triggerBetween', () => {
  it('finds the one trigger that joins two states', () => {
    expect(triggerBetween('queued', 'drawing')).toBe('driver-accepted');
    expect(triggerBetween('queued', 'failed')).toBe('driver-rejected');
    expect(triggerBetween('drawing', 'paused')).toBe('pause');
    expect(triggerBetween('paused', 'drawing')).toBe('resume');
    expect(triggerBetween('drawing', 'completed')).toBe('driver-completed');
    expect(triggerBetween('paused', 'failed')).toBe('driver-fault');
  });

  it('is undefined where there is no transition', () => {
    expect(triggerBetween('queued', 'paused')).toBeUndefined();
    expect(triggerBetween('paused', 'completed')).toBeUndefined();
    expect(triggerBetween('completed', 'drawing')).toBeUndefined();
  });

  it('joins any two states by at most one trigger, so a report never needs a choice', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const matches = JOB_TRANSITIONS.filter((t) => t.from === from && t.to === to);

        expect(matches.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('applyDriverStatus', () => {
  it('moves a queued job to drawing when the driver reports drawing', () => {
    const outcome = applyDriverStatus(job(), status({ progress: 0 }), NOW);

    expect(outcome.changed).toBe(true);
    expect(outcome.job).toMatchObject({ state: 'drawing', startedAt: NOW });
  });

  it('advances progress while the state stays the same, and never backwards', () => {
    const drawing = job({ state: 'drawing', progress: 0.2 });

    expect(applyDriverStatus(drawing, status({ progress: 0.6 }), NOW).job.progress).toBe(0.6);
    expect(applyDriverStatus(drawing, status({ progress: 0.1 }), NOW).changed).toBe(false);
    expect(applyDriverStatus(drawing, status({ progress: 0.2 }), NOW).changed).toBe(false);
  });

  it('completes a drawing job at progress 1', () => {
    const outcome = applyDriverStatus(
      job({ state: 'drawing', progress: 0.9 }),
      status({ phase: 'completed', progress: 1 }),
      NOW,
    );

    expect(outcome.job).toMatchObject({ state: 'completed', progress: 1, finishedAt: NOW });
  });

  it('fails a drawing job with the driver’s error code and the progress it reached', () => {
    const outcome = applyDriverStatus(
      job({ state: 'drawing' }),
      status({ phase: 'failed', progress: 0.5, errorCode: 'SIMULATED_FAULT' }),
      NOW,
    );

    expect(outcome.job).toMatchObject({
      state: 'failed',
      progress: 0.5,
      errorCode: 'SIMULATED_FAULT',
    });
  });

  it('fails a paused job too: a table lost while paused', () => {
    const outcome = applyDriverStatus(
      job({ state: 'paused', progress: 0.3 }),
      status({ phase: 'failed', progress: 0.3, errorCode: 'OFFLINE' }),
      NOW,
    );

    expect(outcome.job).toMatchObject({ state: 'failed', errorCode: 'OFFLINE' });
  });

  it('fails a queued job that the table never took', () => {
    const outcome = applyDriverStatus(
      job(),
      status({ phase: 'failed', progress: 0, errorCode: 'OFFLINE' }),
      NOW,
    );

    expect(outcome.job).toMatchObject({ state: 'failed', errorCode: 'OFFLINE' });
  });

  it('applies a pause, resume and cancellation the driver reports', () => {
    const paused = applyDriverStatus(
      job({ state: 'drawing' }),
      status({ phase: 'paused' }),
      NOW,
    ).job;
    const resumed = applyDriverStatus(paused, status({ phase: 'drawing' }), NOW).job;
    const cancelled = applyDriverStatus(resumed, status({ phase: 'cancelled' }), NOW).job;

    expect([paused.state, resumed.state, cancelled.state]).toStrictEqual([
      'paused',
      'drawing',
      'cancelled',
    ]);
  });

  it('ignores a status about another job, or about an idle table', () => {
    expect(applyDriverStatus(job(), status({ jobId: 'someone-else' }), NOW).changed).toBe(false);
    expect(applyDriverStatus(job(), status({ jobId: null, phase: 'idle' }), NOW).changed).toBe(
      false,
    );
  });

  it('never changes a finished job, whatever the driver says', () => {
    for (const state of ['completed', 'failed', 'cancelled'] as const) {
      const finished = job({ state, progress: state === 'completed' ? 1 : 0.4 });

      for (const phase of ['drawing', 'paused', 'completed', 'failed', 'cancelled'] as const) {
        expect(applyDriverStatus(finished, status({ phase, progress: 0.9 }), NOW).changed).toBe(
          false,
        );
      }
    }
  });

  it('rejects a report the machine has no transition for, and leaves the job alone', () => {
    const queued = job();
    const outcome = applyDriverStatus(queued, status({ phase: 'paused' }), NOW);

    expect(outcome.changed).toBe(false);
    expect(outcome.job).toBe(queued);
    expect(outcome.rejected).toContain('paused');
    expect(outcome.rejected).toContain('queued');
  });

  it('never changes the job it was given', () => {
    const before = job({ state: 'drawing' });
    const copy = JSON.stringify(before);

    applyDriverStatus(before, status({ phase: 'completed', progress: 1 }), NOW);

    expect(JSON.stringify(before)).toBe(copy);
  });
});
