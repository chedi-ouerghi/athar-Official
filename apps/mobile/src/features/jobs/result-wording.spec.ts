import { driverErrorCodeSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { job } from '../../test-fixtures';
import { JOB_STATE_KEY, describeResult } from './result-wording';

const text = (key: keyof typeof en) => en[key];

describe('describeResult', () => {
  it('says "Simulated drawing completed" for a completed simulation', () => {
    const wording = describeResult(job({ state: 'completed', progress: 1, mode: 'simulation' }));

    expect(wording && text(wording.title)).toBe('Simulated drawing completed');
    expect(wording?.tone).toBe('success');
  });

  it('says plainly that nothing was drawn on a real table', () => {
    const wording = describeResult(job({ state: 'completed', progress: 1, mode: 'simulation' }));

    expect(wording && text(wording.body)).toContain('simulation');
    expect(wording && text(wording.body)).toContain('Nothing was drawn on a real table');
  });

  it('uses plain wording only for a real table', () => {
    const wording = describeResult(job({ state: 'completed', progress: 1, mode: 'hardware' }));

    expect(wording && text(wording.title)).toBe('Drawing completed');
    expect(wording && text(wording.body)).toContain('in the sand');
  });

  it('never suggests a physical drawing unless the mode is exactly hardware', () => {
    const states = ['completed', 'failed', 'cancelled'] as const;
    const notHardware = ['simulation', 'nope', '', undefined, null] as const;

    for (const state of states) {
      for (const mode of notHardware) {
        const wording = describeResult(
          job({
            state,
            mode: mode as never,
            progress: state === 'completed' ? 1 : 0.4,
            errorCode: state === 'failed' ? 'FAULT' : null,
          }),
        );
        const words = wording ? `${text(wording.title)} ${text(wording.body)}` : '';

        // Nothing about sand, or a pattern being ready, that a real drawing would say.
        expect(words, `${state}/${String(mode)}`).not.toMatch(/in the sand|stays as it is/);
      }
    }
  });

  it('names a simulation in every finished state of a simulated job', () => {
    for (const state of ['completed', 'failed', 'cancelled'] as const) {
      const wording = describeResult(
        job({
          state,
          mode: 'simulation',
          progress: state === 'completed' ? 1 : 0.4,
          errorCode: state === 'failed' ? 'SIMULATED_FAULT' : null,
        }),
      );

      expect(wording && text(wording.title), state).toMatch(/imulat/);
    }
  });

  it('describes a stopped drawing as stopped, not as failed', () => {
    const wording = describeResult(job({ state: 'cancelled', mode: 'simulation' }));

    expect(wording && text(wording.title)).toBe('The simulated drawing was stopped');
    expect(wording?.tone).toBe('neutral');
  });

  it('describes a failure with the reason the table gave', () => {
    const wording = describeResult(
      job({ state: 'failed', mode: 'simulation', errorCode: 'SIMULATED_FAULT', progress: 0.6 }),
    );

    expect(wording && text(wording.title)).toBe('The simulated drawing could not be finished');
    expect(wording && text(wording.body)).toContain('simulated problem');
    expect(wording?.tone).toBe('danger');
  });

  it('has words for every reason a table can give', () => {
    for (const errorCode of driverErrorCodeSchema.options) {
      const wording = describeResult(job({ state: 'failed', errorCode, progress: 0.3 }));

      expect(wording && text(wording.body).length, errorCode).toBeGreaterThan(0);
    }
  });

  it('has a generic reason when a failed job gives none', () => {
    const wording = describeResult(job({ state: 'failed', errorCode: null, progress: 0.3 }));

    expect(wording?.body).toBe('job.error.unknown');
  });

  it('has nothing to say about a job that has not finished', () => {
    for (const state of ['queued', 'drawing', 'paused'] as const) {
      expect(describeResult(job({ state })), state).toBeUndefined();
    }
  });
});

describe('JOB_STATE_KEY', () => {
  it('has plain words for every state', () => {
    expect(Object.keys(JOB_STATE_KEY).sort()).toStrictEqual(
      ['cancelled', 'completed', 'drawing', 'failed', 'paused', 'queued'].sort(),
    );
  });
});
