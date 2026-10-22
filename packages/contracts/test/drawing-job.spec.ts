import { describe, expect, it } from 'vitest';
import {
  DRAWING_PATH_MAX_POINTS,
  JOB_ACTIVE_STATES,
  JOB_TERMINAL_STATES,
  JOB_TRANSITIONS,
  isActiveJobState,
  isTerminalJobState,
  jobStateSchema,
  jobTriggerSchema,
  nextJobState,
  ambienceSchema,
  drawingPathSchema,
  setAmbienceRequestSchema,
  startJobRequestSchema,
  type JobState,
  type JobTrigger,
} from '../src/index.js';

/**
 * The expected machine, written out independently of `JOB_TRANSITIONS` so the
 * test fails if the data and the specification in docs/architecture.md drift.
 */
const EXPECTED: Readonly<Record<string, JobState>> = {
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

const STATES = jobStateSchema.options;
const TRIGGERS = jobTriggerSchema.options;

describe('job state machine', () => {
  const pairs = STATES.flatMap((state) =>
    TRIGGERS.map((trigger) => [state, trigger] as [JobState, JobTrigger]),
  );

  it('covers the full state x trigger matrix', () => {
    expect(pairs).toHaveLength(STATES.length * TRIGGERS.length);
    expect(STATES).toHaveLength(6);
    expect(TRIGGERS).toHaveLength(7);
  });

  it.each(pairs)('%s + %s', (state, trigger) => {
    expect(nextJobState(state, trigger)).toBe(EXPECTED[`${state}/${trigger}`]);
  });

  it('allows exactly the specified transitions and no others', () => {
    const allowed = pairs.filter(([state, trigger]) => nextJobState(state, trigger) !== undefined);

    expect(allowed).toHaveLength(Object.keys(EXPECTED).length);
    expect(JOB_TRANSITIONS).toHaveLength(Object.keys(EXPECTED).length);
  });

  it('lists each (state, trigger) pair at most once', () => {
    const keys = JOB_TRANSITIONS.map((t) => `${t.from}/${t.trigger}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never leaves a terminal state', () => {
    for (const state of JOB_TERMINAL_STATES) {
      expect(JOB_TRANSITIONS.filter((t) => t.from === state)).toStrictEqual([]);
    }
  });

  it('never enters queued after creation', () => {
    expect(JOB_TRANSITIONS.filter((t) => t.to === 'queued')).toStrictEqual([]);
  });

  it('splits the states into active and terminal with no overlap', () => {
    const merged = [...JOB_ACTIVE_STATES, ...JOB_TERMINAL_STATES];

    expect([...merged].sort()).toStrictEqual([...STATES].sort());
    for (const state of STATES) {
      expect(isActiveJobState(state)).not.toBe(isTerminalJobState(state));
    }
  });

  it('rejects the cases called out in the architecture', () => {
    expect(nextJobState('paused', 'pause')).toBeUndefined();
    expect(nextJobState('queued', 'pause')).toBeUndefined();
    expect(nextJobState('drawing', 'resume')).toBeUndefined();
    expect(nextJobState('paused', 'driver-completed')).toBeUndefined();
    expect(nextJobState('completed', 'stop')).toBeUndefined();
  });
});

describe('start job request', () => {
  const clientRequestId = '6f1c2b0e-1d2a-4c3b-9f8e-7a6b5c4d3e2f';

  it('defaults kind to design, so a body without it still parses', () => {
    expect(startJobRequestSchema.parse({ designId: 'star', clientRequestId })).toStrictEqual({
      kind: 'design',
      designId: 'star',
      clientRequestId,
    });
  });

  it('accepts a path and a rake', () => {
    const path = [
      [0, 0.2],
      [1, 0.5],
    ];

    expect(startJobRequestSchema.safeParse({ kind: 'path', path, clientRequestId }).success).toBe(
      true,
    );
    expect(startJobRequestSchema.safeParse({ kind: 'rake', clientRequestId }).success).toBe(true);
  });

  it.each([
    ['an unknown kind', { kind: 'laser', clientRequestId }],
    ['a path with one point', { kind: 'path', path: [[0, 0]], clientRequestId }],
    [
      'a path off the table',
      {
        kind: 'path',
        path: [
          [0, 0],
          [1, 1.2],
        ],
        clientRequestId,
      },
    ],
    [
      'a path over the point limit',
      {
        kind: 'path',
        path: Array.from({ length: DRAWING_PATH_MAX_POINTS + 1 }, (_, i) => [i / 100, 0.5]),
        clientRequestId,
      },
    ],
    ['a path without its path', { kind: 'path', clientRequestId }],
    ['a rake without a request id', { kind: 'rake' }],
  ])('rejects %s', (_label, body) => {
    expect(startJobRequestSchema.safeParse(body).success).toBe(false);
  });

  it('accepts a path at the point limit', () => {
    const path = Array.from({ length: DRAWING_PATH_MAX_POINTS }, (_, i) => [i / 100, 0.5]);

    expect(drawingPathSchema.safeParse(path).success).toBe(true);
  });
});

describe('ambience', () => {
  it('accepts a named colour and rejects a malformed one', () => {
    const amber = { id: 'amber', name: { en: 'Amber', ar: 'كهرماني' }, color: '#ffbf00' };

    expect(ambienceSchema.safeParse(amber).success).toBe(true);
    expect(ambienceSchema.safeParse({ ...amber, color: 'orange' }).success).toBe(false);
    expect(setAmbienceRequestSchema.safeParse({ ambienceId: 'Amber!' }).success).toBe(false);
  });
});
