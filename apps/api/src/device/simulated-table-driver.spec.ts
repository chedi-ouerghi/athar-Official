import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { driverStatusSchema } from '@athar/contracts';
import { FakeClock, ManualScheduler } from './fake-clock.js';
import {
  DEFAULT_SIMULATED_DURATION_SECONDS,
  FAULT_PROGRESS_CEILING,
  SimulatedTableDriver,
  type SimulatedTableDriverOptions,
} from './simulated-table-driver.js';
import {
  DriverError,
  InvalidDriverCommandError,
  type DriverEvent,
  type DriverStartRequest,
} from './table-driver.js';
import { TRAJECTORY_FORMAT, type Trajectory } from './trajectory.js';

const TABLE = 'table-001';
const OTHER_TABLE = 'table-002';

/** A drawable trajectory: a spiral from near the centre to the edge. */
const TRAJECTORY: Trajectory = {
  format: TRAJECTORY_FORMAT,
  points: [
    [0, 0.1],
    [2 * Math.PI, 0.5],
    [4 * Math.PI, 1],
  ],
};

/** 100 seconds makes every expectation below simple arithmetic. */
function request(jobId: string, overrides: Partial<DriverStartRequest> = {}): DriverStartRequest {
  return { jobId, trajectory: TRAJECTORY, estimatedDurationSeconds: 100, ...overrides };
}

function setup(overrides: Partial<SimulatedTableDriverOptions> = {}) {
  const clock = new FakeClock();
  const scheduler = new ManualScheduler();
  const driver = new SimulatedTableDriver({
    clock,
    scheduler,
    speedFactor: 1,
    faultEveryNthJob: 0,
    faultAtProgress: 0.5,
    ...overrides,
  });

  /** Every event for one table, in the order it was delivered. */
  const record = (tableId = TABLE) => {
    const events: DriverEvent[] = [];
    driver.subscribe(tableId, (event) => events.push(event));
    return events;
  };

  return { clock, scheduler, driver, record };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof DriverError ? error.code : `not a DriverError: ${String(error)}`;
  }

  return 'resolved';
}

describe('SimulatedTableDriver', () => {
  // The driver logs when it ignores a throwing listener; keep the output clean.
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  describe('an idle table', () => {
    it('is online, idle and simulated', async () => {
      const { driver, clock } = setup();

      expect(await driver.getStatus(TABLE)).toStrictEqual({
        tableId: TABLE,
        mode: 'simulation',
        connection: 'online',
        phase: 'idle',
        jobId: null,
        progress: 0,
        errorCode: null,
        observedAt: new Date(clock.now()).toISOString(),
      });
    });

    it('reports its mode as simulation', () => {
      expect(setup().driver.mode).toBe('simulation');
    });
  });

  describe('a full lifecycle', () => {
    it('draws from 0 to 1, then finishes and frees the table', async () => {
      const { driver, clock, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));

      const started = await driver.getStatus(TABLE);
      expect(started).toMatchObject({
        phase: 'drawing',
        connection: 'busy',
        jobId: 'job-1',
        progress: 0,
        errorCode: null,
      });

      clock.advanceSeconds(25);
      driver.tick();
      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'drawing', progress: 0.25 });

      clock.advanceSeconds(75);
      driver.tick();

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'completed',
        connection: 'online',
        jobId: 'job-1',
        progress: 1,
        errorCode: null,
      });
      expect(events.map((event) => [event.phase, event.progress])).toStrictEqual([
        ['drawing', 0],
        ['drawing', 0.25],
        ['completed', 1],
      ]);
    });

    it('computes progress purely from the clock, whether or not anything ticked', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(40);

      expect((await driver.getStatus(TABLE)).progress).toBe(0.4);

      clock.advanceSeconds(1000);

      expect((await driver.getStatus(TABLE)).phase).toBe('completed');
    });

    it('divides the duration by the speed factor', async () => {
      const { driver, clock } = setup({ speedFactor: 10 });

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(5);
      expect((await driver.getStatus(TABLE)).progress).toBe(0.5);

      clock.advanceSeconds(5);
      expect((await driver.getStatus(TABLE)).phase).toBe('completed');
    });

    it('uses a default duration when the request does not give one', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, { jobId: 'job-1', trajectory: TRAJECTORY });
      clock.advanceSeconds(DEFAULT_SIMULATED_DURATION_SECONDS / 2);

      expect((await driver.getStatus(TABLE)).progress).toBe(0.5);
    });

    it('accepts a new job once the last one has finished', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(100);
      await driver.startJob(TABLE, request('job-2'));

      expect(await driver.getStatus(TABLE)).toMatchObject({
        jobId: 'job-2',
        phase: 'drawing',
        progress: 0,
      });
    });

    it('keeps tables independent of each other', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(50);
      await driver.startJob(OTHER_TABLE, request('job-2'));
      clock.advanceSeconds(25);

      expect((await driver.getStatus(TABLE)).progress).toBe(0.75);
      expect((await driver.getStatus(OTHER_TABLE)).progress).toBe(0.25);
    });
  });

  describe('pause and resume', () => {
    it('freezes progress while paused, however long, and continues from there', async () => {
      const { driver, clock, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(20);
      await driver.pause(TABLE, 'job-1');

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'paused',
        connection: 'busy',
        progress: 0.2,
      });

      clock.advanceSeconds(500);
      driver.tick();

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'paused', progress: 0.2 });

      await driver.resume(TABLE, 'job-1');
      clock.advanceSeconds(30);

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'drawing', progress: 0.5 });

      clock.advanceSeconds(50);

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'completed', progress: 1 });
      expect(events.map((event) => event.phase)).toStrictEqual([
        'drawing',
        'paused',
        'drawing',
        'completed',
      ]);
    });

    it('subtracts every pause, not only the last', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');
      clock.advanceSeconds(100);
      await driver.resume(TABLE, 'job-1');
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');
      clock.advanceSeconds(100);
      await driver.resume(TABLE, 'job-1');
      clock.advanceSeconds(10);

      expect((await driver.getStatus(TABLE)).progress).toBeCloseTo(0.3, 12);
    });

    it('rejects commands that do not fit the job', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));

      await expect(driver.resume(TABLE, 'job-1')).rejects.toBeInstanceOf(InvalidDriverCommandError);

      await driver.pause(TABLE, 'job-1');

      await expect(driver.pause(TABLE, 'job-1')).rejects.toBeInstanceOf(InvalidDriverCommandError);
      await expect(driver.pause(TABLE, 'other-job')).rejects.toBeInstanceOf(
        InvalidDriverCommandError,
      );
      await expect(driver.pause(OTHER_TABLE, 'job-1')).rejects.toBeInstanceOf(
        InvalidDriverCommandError,
      );
    });

    it('rejects pausing a job that has already finished by the clock', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(100);

      await expect(driver.pause(TABLE, 'job-1')).rejects.toBeInstanceOf(InvalidDriverCommandError);
      expect((await driver.getStatus(TABLE)).phase).toBe('completed');
    });
  });

  describe('stop', () => {
    it('ends the job where it stands and frees the table', async () => {
      const { driver, clock, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(30);
      await driver.stop(TABLE, 'job-1');

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'cancelled',
        connection: 'online',
        jobId: 'job-1',
        progress: 0.3,
        errorCode: null,
      });

      clock.advanceSeconds(1000);
      driver.tick();

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'cancelled', progress: 0.3 });
      expect(events.at(-1)).toMatchObject({ phase: 'cancelled', progress: 0.3 });

      await driver.startJob(TABLE, request('job-2'));
      expect((await driver.getStatus(TABLE)).phase).toBe('drawing');
    });

    it('stops a paused job', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');
      await driver.stop(TABLE, 'job-1');

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'cancelled', progress: 0.1 });
    });

    it('rejects stopping a job that is not running', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));
      await driver.stop(TABLE, 'job-1');

      await expect(driver.stop(TABLE, 'job-1')).rejects.toBeInstanceOf(InvalidDriverCommandError);
      await expect(driver.stop(TABLE, 'never-started')).rejects.toBeInstanceOf(
        InvalidDriverCommandError,
      );
    });
  });

  describe('fault injection', () => {
    it('faults every Nth job at the configured progress, and no other', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 2, faultAtProgress: 0.5 });

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(100);
      expect((await driver.getStatus(TABLE)).phase).toBe('completed');

      await driver.startJob(TABLE, request('job-2'));
      clock.advanceSeconds(49);
      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'drawing', progress: 0.49 });

      clock.advanceSeconds(1);
      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'failed',
        connection: 'online',
        jobId: 'job-2',
        progress: 0.5,
        errorCode: 'SIMULATED_FAULT',
      });

      clock.advanceSeconds(1000);
      expect((await driver.getStatus(TABLE)).progress).toBe(0.5);

      await driver.startJob(TABLE, request('job-3'));
      clock.advanceSeconds(100);
      expect((await driver.getStatus(TABLE)).phase).toBe('completed');
    });

    it('never faults when the interval is 0', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 0 });

      for (const jobId of ['a', 'b', 'c', 'd']) {
        await driver.startJob(TABLE, request(jobId));
        clock.advanceSeconds(100);

        expect((await driver.getStatus(TABLE)).phase).toBe('completed');
      }
    });

    it('is deterministic: the same inputs give the same outcome', async () => {
      const outcomes: string[] = [];

      for (let run = 0; run < 3; run += 1) {
        const { driver, clock } = setup({ faultEveryNthJob: 3, faultAtProgress: 0.25 });
        const phases: string[] = [];

        for (const jobId of ['a', 'b', 'c', 'd']) {
          await driver.startJob(TABLE, request(jobId));
          clock.advanceSeconds(100);
          phases.push((await driver.getStatus(TABLE)).phase);
        }

        outcomes.push(phases.join(','));
      }

      expect(new Set(outcomes)).toStrictEqual(new Set(['completed,completed,failed,completed']));
    });

    it('counts only accepted jobs', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 2 });

      await driver.startJob(TABLE, request('job-1'));
      await expect(driver.startJob(TABLE, request('rejected'))).rejects.toBeInstanceOf(DriverError);
      clock.advanceSeconds(100);
      await driver.startJob(TABLE, request('job-2'));
      clock.advanceSeconds(100);

      expect((await driver.getStatus(TABLE)).phase).toBe('failed');
    });

    it('counts jobs across tables', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 2 });

      await driver.startJob(TABLE, request('job-1'));
      await driver.startJob(OTHER_TABLE, request('job-2'));
      clock.advanceSeconds(100);

      expect((await driver.getStatus(TABLE)).phase).toBe('completed');
      expect((await driver.getStatus(OTHER_TABLE)).phase).toBe('failed');
    });

    it('does not advance toward a fault while paused', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 1, faultAtProgress: 0.5 });

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(40);
      await driver.pause(TABLE, 'job-1');
      clock.advanceSeconds(1000);

      expect((await driver.getStatus(TABLE)).phase).toBe('paused');

      await driver.resume(TABLE, 'job-1');
      clock.advanceSeconds(10);

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'failed',
        progress: 0.5,
        errorCode: 'SIMULATED_FAULT',
      });
    });

    it('never lets a faulted job reach progress 1', async () => {
      const { driver, clock } = setup({ faultEveryNthJob: 1, faultAtProgress: 1 });

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(100);

      const status = await driver.getStatus(TABLE);

      expect(status.phase).toBe('failed');
      expect(status.progress).toBe(FAULT_PROGRESS_CEILING);
    });

    it('announces the fault to subscribers', async () => {
      const { driver, clock, record } = setup({ faultEveryNthJob: 1, faultAtProgress: 0.5 });
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(60);
      driver.tick();

      expect(events.map((event) => event.phase)).toStrictEqual(['drawing', 'failed']);
      expect(events.at(-1)).toMatchObject({ errorCode: 'SIMULATED_FAULT', progress: 0.5 });
    });
  });

  describe('an offline or failing table', () => {
    it('refuses to start a job while offline', async () => {
      const { driver } = setup();

      driver.simulateConnection(TABLE, 'offline');

      expect(await codeOf(driver.startJob(TABLE, request('job-1')))).toBe('OFFLINE');
      expect(await driver.getStatus(TABLE)).toMatchObject({ connection: 'offline', phase: 'idle' });
    });

    it('refuses to start a job while in error', async () => {
      const { driver } = setup();

      driver.simulateConnection(TABLE, 'error');

      expect(await codeOf(driver.startJob(TABLE, request('job-1')))).toBe('FAULT');
      expect((await driver.getStatus(TABLE)).connection).toBe('error');
    });

    it('accepts jobs again once it recovers', async () => {
      const { driver } = setup();

      driver.simulateConnection(TABLE, 'offline');
      driver.simulateConnection(TABLE, 'online');
      await driver.startJob(TABLE, request('job-1'));

      expect((await driver.getStatus(TABLE)).phase).toBe('drawing');
    });

    it('fails a running job with OFFLINE, keeping the progress it had', async () => {
      const { driver, clock, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(40);
      driver.simulateConnection(TABLE, 'offline');

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'failed',
        connection: 'offline',
        progress: 0.4,
        errorCode: 'OFFLINE',
      });

      clock.advanceSeconds(1000);
      expect((await driver.getStatus(TABLE)).progress).toBe(0.4);
      expect(events.at(-1)).toMatchObject({ phase: 'failed', errorCode: 'OFFLINE' });
    });

    it('fails a paused job with FAULT when the table goes into error', async () => {
      const { driver, clock } = setup();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');
      driver.simulateConnection(TABLE, 'error');

      expect(await driver.getStatus(TABLE)).toMatchObject({
        phase: 'failed',
        connection: 'error',
        progress: 0.1,
        errorCode: 'FAULT',
      });
    });

    it('lets one table fail without touching another', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));
      await driver.startJob(OTHER_TABLE, request('job-2'));
      driver.simulateConnection(TABLE, 'offline');

      expect((await driver.getStatus(OTHER_TABLE)).phase).toBe('drawing');
    });
  });

  describe('a busy table', () => {
    it('rejects a second start with BUSY while drawing', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));

      expect(await codeOf(driver.startJob(TABLE, request('job-2')))).toBe('BUSY');
      expect(await driver.getStatus(TABLE)).toMatchObject({ jobId: 'job-1', phase: 'drawing' });
    });

    it('rejects a second start with BUSY while paused', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));
      await driver.pause(TABLE, 'job-1');

      expect(await codeOf(driver.startJob(TABLE, request('job-2')))).toBe('BUSY');
    });

    it('rejects the same job id started twice', async () => {
      const { driver } = setup();

      await driver.startJob(TABLE, request('job-1'));

      expect(await codeOf(driver.startJob(TABLE, request('job-1')))).toBe('BUSY');
    });
  });

  describe('a trajectory or duration the table cannot draw', () => {
    /** Named cases, typed as `Trajectory` so each literal is checked as written. */
    const unusable: [label: string, trajectory: Trajectory][] = [
      ['too few points', { format: TRAJECTORY_FORMAT, points: [[0, 0.5]] }],
      [
        'a rho outside the table',
        {
          format: TRAJECTORY_FORMAT,
          points: [
            [0, 0],
            [1, 1.5],
          ],
        },
      ],
      [
        'a point that is not a number',
        {
          format: TRAJECTORY_FORMAT,
          points: [
            [0, 0],
            [Number.NaN, 0.5],
          ],
        },
      ],
      [
        'no length',
        {
          format: TRAJECTORY_FORMAT,
          points: [
            [1, 0.5],
            [1, 0.5],
          ],
        },
      ],
      [
        'an unknown format',
        {
          format: 'cartesian/v1',
          points: [
            [0, 0],
            [1, 1],
          ],
        } as unknown as Trajectory,
      ],
    ];

    it.each(unusable)('rejects %s with TRAJECTORY_REJECTED', async (_label, trajectory) => {
      const { driver } = setup();

      expect(await codeOf(driver.startJob(TABLE, request('job-1', { trajectory })))).toBe(
        'TRAJECTORY_REJECTED',
      );
      expect((await driver.getStatus(TABLE)).phase).toBe('idle');
    });

    it.each([0, -5, Number.NaN, Infinity])('rejects a duration of %s', async (seconds) => {
      const { driver } = setup();

      expect(
        await codeOf(
          driver.startJob(TABLE, request('job-1', { estimatedDurationSeconds: seconds })),
        ),
      ).toBe('TRAJECTORY_REJECTED');
    });
  });

  describe('subscribers', () => {
    it('receive every change in order, including the start', async () => {
      const { driver, clock, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');
      await driver.resume(TABLE, 'job-1');
      await driver.stop(TABLE, 'job-1');

      expect(events.map((event) => [event.phase, event.progress])).toStrictEqual([
        ['drawing', 0],
        ['paused', 0.1],
        ['drawing', 0.1],
        ['cancelled', 0.1],
      ]);
    });

    it('only receive events for the table they subscribed to', async () => {
      const { driver, record } = setup();
      const other = record(OTHER_TABLE);

      await driver.startJob(TABLE, request('job-1'));

      expect(other).toStrictEqual([]);
    });

    it('stop receiving after they unsubscribe', async () => {
      const { driver, clock } = setup();
      const events: DriverEvent[] = [];
      const unsubscribe = driver.subscribe(TABLE, (event) => events.push(event));

      await driver.startJob(TABLE, request('job-1'));
      unsubscribe();
      clock.advanceSeconds(10);
      await driver.pause(TABLE, 'job-1');

      expect(events).toHaveLength(1);
    });

    it('are not told about a tick that changed nothing', async () => {
      const { driver, record } = setup();
      const events = record();

      await driver.startJob(TABLE, request('job-1'));
      driver.tick();
      driver.tick();

      expect(events).toHaveLength(1);
    });

    it('cannot break the driver or the other subscribers by throwing', async () => {
      const { driver, clock } = setup();
      const received: DriverEvent[] = [];
      let calls = 0;

      driver.subscribe(TABLE, () => {
        calls += 1;
        throw new Error('listener bug');
      });
      driver.subscribe(TABLE, (event) => received.push(event));

      await expect(driver.startJob(TABLE, request('job-1'))).resolves.toBeUndefined();
      clock.advanceSeconds(10);
      await expect(driver.pause(TABLE, 'job-1')).resolves.toBeUndefined();
      await expect(driver.resume(TABLE, 'job-1')).resolves.toBeUndefined();

      expect(calls).toBe(3);
      expect(received.map((event) => event.phase)).toStrictEqual(['drawing', 'paused', 'drawing']);
      expect((await driver.getStatus(TABLE)).phase).toBe('drawing');
    });

    it('see events in order even when a listener calls back into the driver', async () => {
      const { driver, record } = setup();

      // The re-entering listener comes first, so a later listener would see
      // the nested event before the one that caused it if delivery re-entered.
      driver.subscribe(TABLE, (event) => {
        if (event.phase === 'drawing' && event.progress === 0) {
          void driver.pause(TABLE, event.jobId ?? '');
        }
      });
      const seen = record();

      await driver.startJob(TABLE, request('job-1'));

      expect(seen.map((event) => event.phase)).toStrictEqual(['drawing', 'paused']);
      expect((await driver.getStatus(TABLE)).phase).toBe('paused');
    });
  });

  describe('every status says it is a simulation', () => {
    it('on every status and event, valid against the shared contract', async () => {
      const { driver, clock, record } = setup({ faultEveryNthJob: 2, faultAtProgress: 0.4 });
      const events = record();
      const statuses = [await driver.getStatus(TABLE)];

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(20);
      driver.tick();
      await driver.pause(TABLE, 'job-1');
      await driver.resume(TABLE, 'job-1');
      statuses.push(await driver.getStatus(TABLE));
      clock.advanceSeconds(200);
      statuses.push(await driver.getStatus(TABLE));
      await driver.startJob(TABLE, request('job-2'));
      clock.advanceSeconds(100);
      statuses.push(await driver.getStatus(TABLE));
      driver.simulateConnection(TABLE, 'offline');
      statuses.push(await driver.getStatus(TABLE));
      statuses.push(await driver.getStatus(OTHER_TABLE));

      for (const status of [...statuses, ...events]) {
        expect(status.mode).toBe('simulation');
        expect(driverStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(events.length).toBeGreaterThan(4);
    });
  });

  describe('ticking', () => {
    it('is driven by the scheduler once started, and only then', async () => {
      const { driver, clock, scheduler, record } = setup();
      const events = record();

      expect(driver.running).toBe(false);
      expect(scheduler.active).toBe(0);

      driver.start();
      driver.start();

      expect(driver.running).toBe(true);
      expect(scheduler.active).toBe(1);

      await driver.startJob(TABLE, request('job-1'));
      clock.advanceSeconds(50);
      scheduler.tick();

      expect(events.at(-1)).toMatchObject({ phase: 'drawing', progress: 0.5 });
    });

    it('stops when disposed, and when the application closes', async () => {
      const { driver, scheduler } = setup();

      driver.start();
      driver.dispose();
      driver.dispose();

      expect(driver.running).toBe(false);
      expect(scheduler.active).toBe(0);

      driver.start();
      driver.onModuleDestroy();

      expect(scheduler.active).toBe(0);
      await expect(driver.getStatus(TABLE)).resolves.toMatchObject({ phase: 'idle' });
    });
  });
});
