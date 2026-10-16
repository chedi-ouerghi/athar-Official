import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawingJobSchema, type DriverStatus } from '@athar/contracts';
import { fixtureTables } from '../../test/table-fixtures.js';
import { DomainException } from '../common/http/domain.exception.js';
import { designCollectionV1 } from '../designs/data/designs.v1.js';
import { loadDesignCollection } from '../designs/design-collection.js';
import { DesignsService } from '../designs/designs.service.js';
import { FakeClock, ManualScheduler } from '../device/fake-clock.js';
import { SimulatedTableDriver } from '../device/simulated-table-driver.js';
import {
  DriverError,
  InvalidDriverCommandError,
  type DriverStartRequest,
  type TableDriver,
  type TableMode,
  type Unsubscribe,
} from '../device/table-driver.js';
import type { Authenticated } from '../auth/auth.service.js';
import { InMemoryTableRepository } from '../tables/in-memory-table.repository.js';
import { PairingStore } from '../tables/pairing-store.js';
import { generateTableId } from '../tables/table-id.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import { InMemoryJobRepository } from './in-memory-job.repository.js';
import { JobsService } from './jobs.service.js';

const TABLE = 'table-001';
const OTHER_TABLE = 'table-off'; // disabled in the fixtures; used for ids only here

/** The owner of both fixture tables, signed in on one session. */
const OWNER: Authenticated = {
  account: { id: 'owner-1', email: 'owner@athar.test', displayName: 'Owner', role: 'customer' },
  sessionId: 'session-1',
};

/** A driver whose every answer the test decides, for what the simulator cannot be made to do. */
class ScriptedDriver implements TableDriver {
  mode: TableMode = 'simulation';
  status: DriverStatus = ScriptedDriver.idle();
  readonly listeners = new Set<(event: DriverStatus) => void>();
  readonly calls: string[] = [];
  startJob = vi.fn<(tableId: string, request: DriverStartRequest) => Promise<void>>(() =>
    Promise.resolve(),
  );
  pause = vi.fn<(tableId: string, jobId: string) => Promise<void>>(() => Promise.resolve());
  resume = vi.fn<(tableId: string, jobId: string) => Promise<void>>(() => Promise.resolve());
  stop = vi.fn<(tableId: string, jobId: string) => Promise<void>>(() => Promise.resolve());

  static idle(): DriverStatus {
    return {
      tableId: TABLE,
      mode: 'simulation',
      connection: 'online',
      phase: 'idle',
      jobId: null,
      progress: 0,
      errorCode: null,
      observedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  getStatus(): Promise<DriverStatus> {
    return Promise.resolve(this.status);
  }

  subscribe(_tableId: string, listener: (event: DriverStatus) => void): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Tell everyone listening that the table now looks like this. */
  report(change: Partial<DriverStatus>): void {
    this.status = { ...this.status, ...change };

    for (const listener of [...this.listeners]) {
      listener(this.status);
    }
  }
}

const collection = loadDesignCollection(designCollectionV1);

function build(driver?: TableDriver, historyLimit = 5) {
  const clock = new FakeClock();
  const scheduler = new ManualScheduler();
  const simulator = new SimulatedTableDriver({
    clock,
    scheduler,
    speedFactor: 100,
    faultEveryNthJob: 0,
    faultAtProgress: 0.5,
  });
  simulator.start();
  const used = driver ?? simulator;
  const repository = new InMemoryJobRepository(historyLimit);
  const pairings = new PairingStore(clock);
  const registry = new TableRegistry(
    new InMemoryTableRepository(
      fixtureTables().map((table) => ({ ...table, ownerAccountId: OWNER.account.id })),
    ),
    { publicLinkBaseUrl: undefined },
    clock,
    generateTableId,
  );
  const service = new JobsService(
    repository,
    used,
    registry,
    new DesignsService(collection),
    clock,
    pairings,
  );
  pairings.pair(OWNER.sessionId, TABLE);
  pairings.pair(OWNER.sessionId, OTHER_TABLE);

  return {
    clock,
    pairings,
    registry,
    scheduler,
    simulator,
    repository,
    service,
    request: (designId = 'star', clientRequestId: string = randomUUID()) => ({
      designId,
      clientRequestId,
    }),
    advance: async (seconds: number) => {
      clock.advanceSeconds(seconds);
      scheduler.tick();
      await service.whenIdle();
    },
  };
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

const codeOf = (error: unknown): string | undefined =>
  error instanceof DomainException ? error.code : undefined;

describe('JobsService', () => {
  const lines: { level: string; message: string }[] = [];

  beforeEach(() => {
    lines.length = 0;
    const record = (level: string) => (message: unknown) => {
      lines.push({ level, message: String(message) });
    };
    Logger.overrideLogger({
      log: record('log'),
      warn: record('warn'),
      error: record('error'),
      debug: record('debug'),
      verbose: record('verbose'),
    });
  });

  afterEach(() => {
    Logger.overrideLogger(['log', 'error', 'warn']);
  });

  describe('starting', () => {
    it('creates a job that the driver has accepted, copying the mode from the driver', async () => {
      const { service, request } = build();

      const { job, created } = await service.start(TABLE, request(), OWNER);

      expect(created).toBe(true);
      expect(drawingJobSchema.safeParse(job).success).toBe(true);
      expect(job).toMatchObject({
        tableId: TABLE,
        designId: 'star',
        mode: 'simulation',
        state: 'drawing',
        progress: 0,
        finishedAt: null,
        errorCode: null,
      });
      expect(job.startedAt).toBe(job.createdAt);
    });

    it('copies the mode from the driver, whatever it is', async () => {
      const driver = new ScriptedDriver();
      driver.mode = 'hardware';
      const { service, request } = build(driver);

      expect((await service.start(TABLE, request(), OWNER)).job.mode).toBe('hardware');
    });

    it('gives the driver the design’s trajectory and estimated duration', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);

      const { job } = await service.start(TABLE, request('sadu'), OWNER);

      const [tableId, handed] = driver.startJob.mock.calls[0]!;
      expect(tableId).toBe(TABLE);
      expect(handed.jobId).toBe(job.id);
      expect(handed.trajectory).toStrictEqual(collection.designs[1]!.trajectory);
      expect(handed.estimatedDurationSeconds).toBe(collection.designs[1]!.estimatedDurationSeconds);
    });

    it('looks the design up once when starting a job', async () => {
      const lookups = vi.spyOn(DesignsService.prototype, 'get');

      try {
        const { service, request } = build(new ScriptedDriver());

        await service.start(TABLE, request(), OWNER);

        expect(lookups).toHaveBeenCalledTimes(1);
      } finally {
        lookups.mockRestore();
      }
    });

    it('returns the earlier job for a repeat, without asking the driver again', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const same = request();

      const first = await service.start(TABLE, same, OWNER);
      const second = await service.start(TABLE, same, OWNER);

      expect(second).toStrictEqual({ job: first.job, created: false });
      expect(driver.startJob).toHaveBeenCalledTimes(1);
    });

    it('checks in the documented order', async () => {
      const { service, request, simulator } = build();

      expect(
        codeOf(await failureOf(service.start('no-such', request('no-such-design'), OWNER))),
      ).toBe('TABLE_NOT_FOUND');
      expect(codeOf(await failureOf(service.start(TABLE, request('no-such-design'), OWNER)))).toBe(
        'DESIGN_NOT_FOUND',
      );

      const same = request();
      await service.start(TABLE, same, OWNER);
      expect(
        codeOf(await failureOf(service.start(TABLE, { ...same, designId: 'dunes' }, OWNER))),
      ).toBe('IDEMPOTENCY_CONFLICT');
      expect(codeOf(await failureOf(service.start(TABLE, request(), OWNER)))).toBe('TABLE_BUSY');

      simulator.simulateConnection(TABLE, 'offline');
      await service.whenIdle();
      expect(codeOf(await failureOf(service.start(TABLE, request(), OWNER)))).toBe('TABLE_OFFLINE');
      expect(codeOf(await failureOf(service.start('table-off', request(), OWNER)))).toBe(
        'TABLE_DISABLED',
      );
    });

    it('answers a repeat before it checks whether the table is offline or disabled', async () => {
      const { service, request, simulator } = build();
      const same = request();
      const first = await service.start(TABLE, same, OWNER);

      simulator.simulateConnection(TABLE, 'offline');
      await service.whenIdle();

      expect((await service.start(TABLE, same, OWNER)).job.id).toBe(first.job.id);
    });

    it('refuses anyone but the owner as if the table did not exist', async () => {
      const { service, request } = build();
      const stranger = { ...OWNER, account: { ...OWNER.account, id: 'someone-else' } };

      expect(codeOf(await failureOf(service.start(TABLE, request(), stranger)))).toBe(
        'TABLE_NOT_FOUND',
      );
    });

    it('needs this session to be paired, after the enabled check and before the online one', async () => {
      const { service, request, simulator, pairings } = build();
      const otherSession = { ...OWNER, sessionId: 'session-2' };
      simulator.simulateConnection(TABLE, 'offline');
      await service.whenIdle();

      expect(codeOf(await failureOf(service.start(TABLE, request(), otherSession)))).toBe(
        'PAIRING_REQUIRED',
      );
      expect(codeOf(await failureOf(service.start(OTHER_TABLE, request(), otherSession)))).toBe(
        'TABLE_DISABLED',
      );

      pairings.unpair(OWNER.sessionId, TABLE);
      expect(codeOf(await failureOf(service.start(TABLE, request(), OWNER)))).toBe(
        'PAIRING_REQUIRED',
      );
    });

    it('answers a repeat without the pairing, and extends the pairing on a new job', async () => {
      const { service, request, pairings, clock } = build(new ScriptedDriver());
      const same = request();
      clock.advanceSeconds(10 * 60);
      const first = await service.start(TABLE, same, OWNER);

      clock.advanceSeconds(10 * 60);
      expect(pairings.isPaired(OWNER.sessionId, TABLE)).toBe(true);

      pairings.unpair(OWNER.sessionId, TABLE);
      expect(await service.start(TABLE, same, OWNER)).toStrictEqual({
        job: first.job,
        created: false,
      });
    });

    it('turns a refusal by the driver into a failed job carrying the driver’s code', async () => {
      const driver = new ScriptedDriver();
      driver.startJob.mockRejectedValue(new DriverError('TRAJECTORY_REJECTED', 'no'));
      const { service, request } = build(driver);

      const { job, created } = await service.start(TABLE, request(), OWNER);

      expect(created).toBe(true);
      expect(job).toMatchObject({ state: 'failed', errorCode: 'TRAJECTORY_REJECTED', progress: 0 });
      expect(job.finishedAt).not.toBeNull();
      expect(await service.activeJobIdFor(TABLE)).toBeNull();
    });

    it('never leaves a job holding the table when the driver fails unexpectedly', async () => {
      const driver = new ScriptedDriver();
      const boom = new Error('socket hang up');
      driver.startJob.mockRejectedValue(boom);
      const { service, request } = build(driver);

      expect(await failureOf(service.start(TABLE, request(), OWNER))).toBe(boom);

      expect(await service.activeJobIdFor(TABLE)).toBeNull();
      expect((await service.listForTable(TABLE, 10))[0]).toMatchObject({
        state: 'failed',
        errorCode: 'FAULT',
      });
      // The table can be used again at once.
      driver.startJob.mockResolvedValue(undefined);
      expect((await service.start(TABLE, request(), OWNER)).created).toBe(true);
    });
  });

  describe('driver events', () => {
    it('applies progress, in order, as the driver reports it', async () => {
      const { service, request, advance } = build();
      const { job } = await service.start(TABLE, request(), OWNER);

      await advance(1);
      const a = (await service.get(job.id)).progress;
      await advance(1);
      const b = (await service.get(job.id)).progress;

      expect(a).toBeCloseTo(1 / 3, 5);
      expect(b).toBeCloseTo(2 / 3, 5);
      expect((await service.get(job.id)).updatedAt).toBe(
        new Date(Date.parse('2026-01-01T00:00:00.000Z') + 2000).toISOString(),
      );
    });

    it('completes the job when the driver reports completion', async () => {
      const { service, request, advance } = build();
      const { job } = await service.start(TABLE, request(), OWNER);

      await advance(10);

      expect(await service.get(job.id)).toMatchObject({ state: 'completed', progress: 1 });
    });

    it('listens to a table once, however many jobs it runs', async () => {
      const driver = new ScriptedDriver();
      const subscribe = vi.spyOn(driver, 'subscribe');
      const { service, request } = build(driver);

      for (let n = 0; n < 3; n += 1) {
        const { job } = await service.start(TABLE, request(), OWNER);
        await service.stop(job.id, OWNER);
      }

      expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it('ignores events about jobs it does not know, and about an idle table', async () => {
      const driver = new ScriptedDriver();
      const { service, request, repository } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);

      driver.report({ jobId: 'a-job-from-another-process', phase: 'completed', progress: 1 });
      driver.report({ jobId: null, phase: 'idle', progress: 0 });
      await service.whenIdle();

      expect(await repository.get(job.id)).toMatchObject({ state: 'drawing' });
    });

    it('ignores, and logs, a report the state machine has no transition for', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      await service.pause(job.id, OWNER);

      // A paused job cannot complete: the table must be paused, so a "completed" report is wrong.
      driver.report({ jobId: job.id, phase: 'completed', progress: 1 });
      await service.whenIdle();

      expect(await service.get(job.id)).toMatchObject({ state: 'paused', finishedAt: null });
      const warning = lines.find((line) => line.level === 'warn');
      expect(warning?.message).toBe(
        `Job ${job.id}: The driver reported completed for a job that is paused. Ignored.`,
      );
    });

    it('does not apply an event after shutdown', async () => {
      const driver = new ScriptedDriver();
      const { service, request, repository } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);

      service.onModuleDestroy();
      driver.report({ jobId: job.id, phase: 'completed', progress: 1 });
      await service.whenIdle();

      expect(driver.listeners.size).toBe(0);
      expect(await repository.get(job.id)).toMatchObject({ state: 'drawing' });
    });

    it('applies an event that arrives while a command is running only after it, in order', async () => {
      const driver = new ScriptedDriver();
      let finishStart: () => void = () => undefined;
      driver.startJob.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishStart = resolve;
          }),
      );
      const { service, request, repository } = build(driver);

      const starting = service.start(TABLE, request(), OWNER);
      await vi.waitFor(() => expect(driver.listeners.size).toBe(1));
      const [queued] = await repository.listRecent(TABLE, 1);

      driver.report({ jobId: queued!.id, phase: 'drawing', progress: 0.1 });
      // The event is waiting behind the start: the job is still exactly as the start left it.
      expect(await repository.get(queued!.id)).toMatchObject({ state: 'queued', progress: 0 });

      finishStart();
      const { job } = await starting;
      await service.whenIdle();

      expect(job.state).toBe('drawing');
      expect(await repository.get(job.id)).toMatchObject({ state: 'drawing', progress: 0.1 });
    });
  });

  describe('commands', () => {
    it('need this session to be paired, and extend the pairing when they succeed', async () => {
      const driver = new ScriptedDriver();
      const { service, request, pairings, clock } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      const otherSession = { ...OWNER, sessionId: 'session-2' };

      expect(codeOf(await failureOf(service.pause(job.id, otherSession)))).toBe('PAIRING_REQUIRED');
      expect(driver.pause).not.toHaveBeenCalled();

      clock.advanceSeconds(10 * 60);
      await service.pause(job.id, OWNER);
      clock.advanceSeconds(10 * 60);
      expect(pairings.isPaired(OWNER.sessionId, TABLE)).toBe(true);
    });

    it('stops without a pairing, the safety action, and does not create one', async () => {
      const driver = new ScriptedDriver();
      const { service, request, pairings } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      pairings.unpair(OWNER.sessionId, TABLE);

      expect(codeOf(await failureOf(service.resume(job.id, OWNER)))).toBe('PAIRING_REQUIRED');
      expect((await service.stop(job.id, OWNER)).state).toBe('cancelled');
      expect(driver.stop).toHaveBeenCalledTimes(1);
      expect(pairings.isPaired(OWNER.sessionId, TABLE)).toBe(false);
    });

    it('pauses, resumes and stops through the driver and the state machine', async () => {
      const { service, request, advance } = build();
      const { job } = await service.start(TABLE, request(), OWNER);
      await advance(1);

      const paused = await service.pause(job.id, OWNER);
      expect(paused.state).toBe('paused');
      expect(paused.progress).toBeCloseTo(1 / 3, 5);

      expect((await service.resume(job.id, OWNER)).state).toBe('drawing');

      const stopped = await service.stop(job.id, OWNER);
      expect(stopped).toMatchObject({ state: 'cancelled' });
      expect(stopped.finishedAt).not.toBeNull();
    });

    it('judges a command against what the table is really doing, not what it last reported', async () => {
      const { service, request, clock } = build();
      const { job } = await service.start(TABLE, request(), OWNER);

      // The drawing ended, but no tick has told the job.
      clock.advanceSeconds(10);

      const error = await failureOf(service.pause(job.id, OWNER));

      expect(codeOf(error)).toBe('INVALID_TRANSITION');
      expect((error as DomainException).message).toBe('Cannot pause a job that is completed.');
      // The job learnt of the completion in the process.
      expect(await service.get(job.id)).toMatchObject({ state: 'completed', progress: 1 });
    });

    it('does not tell a driver to act on a job the table has already lost, even a driver that would obey', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      // The table dropped off the network, but the job has not heard yet.
      driver.status = {
        ...driver.status,
        jobId: job.id,
        phase: 'failed',
        progress: 0.2,
        errorCode: 'OFFLINE',
      };

      const error = await failureOf(service.pause(job.id, OWNER));

      expect(codeOf(error)).toBe('INVALID_TRANSITION');
      expect((error as DomainException).message).toBe('Cannot pause a job that is failed.');
      expect(driver.pause).not.toHaveBeenCalled();
      expect(await service.get(job.id)).toMatchObject({ state: 'failed', errorCode: 'OFFLINE' });
    });

    it('turns the driver’s refusal of a command that no longer applies into INVALID_TRANSITION', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      driver.pause.mockRejectedValue(new InvalidDriverCommandError('already finished'));

      expect(codeOf(await failureOf(service.pause(job.id, OWNER)))).toBe('INVALID_TRANSITION');
      expect((await service.get(job.id)).state).toBe('drawing');
    });

    it('trusts a command the driver accepted even if its status lags', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);
      // The driver says yes to pause but its status keeps saying "drawing".
      driver.status = { ...driver.status, jobId: job.id, phase: 'drawing', progress: 0.2 };

      expect((await service.pause(job.id, OWNER)).state).toBe('paused');
    });

    it('does not ask the driver to do something the state machine forbids', async () => {
      const driver = new ScriptedDriver();
      const { service, request } = build(driver);
      const { job } = await service.start(TABLE, request(), OWNER);

      expect(codeOf(await failureOf(service.resume(job.id, OWNER)))).toBe('INVALID_TRANSITION');

      expect(driver.resume).not.toHaveBeenCalled();
    });

    it('changes nothing when a command is rejected', async () => {
      const { service, request, advance } = build();
      const { job } = await service.start(TABLE, request(), OWNER);
      await advance(1);
      const before = await service.get(job.id);

      await failureOf(service.resume(job.id, OWNER));

      expect(await service.get(job.id)).toStrictEqual(before);
    });

    it('answers JOB_NOT_FOUND for an unknown job', async () => {
      const { service } = build();

      expect(codeOf(await failureOf(service.stop(randomUUID(), OWNER)))).toBe('JOB_NOT_FOUND');
    });
  });

  describe('reads', () => {
    it('lists a table’s jobs newest first, and refuses an unknown table', async () => {
      const { service, request } = build();
      const first = (await service.start(TABLE, request(), OWNER)).job;
      await service.stop(first.id, OWNER);
      const second = (await service.start(TABLE, request('dunes'), OWNER)).job;

      expect((await service.listForTable(TABLE, 10)).map((job) => job.id)).toStrictEqual([
        second.id,
        first.id,
      ]);
      expect(codeOf(await failureOf(service.listForTable('no-such', 10)))).toBe('TABLE_NOT_FOUND');
    });

    it('says which job is active, and none once it has finished', async () => {
      const { service, request } = build();
      expect(await service.activeJobIdFor(TABLE)).toBeNull();

      const { job } = await service.start(TABLE, request(), OWNER);
      expect(await service.activeJobIdFor(TABLE)).toBe(job.id);
      expect(await service.activeJobIdFor(OTHER_TABLE)).toBeNull();

      await service.stop(job.id, OWNER);
      expect(await service.activeJobIdFor(TABLE)).toBeNull();
    });
  });

  describe('logging', () => {
    it('logs each step of a job’s life by its job id, table and design', async () => {
      const { service, request, advance } = build();
      const { job } = await service.start(TABLE, request(), OWNER);
      await advance(1);
      await service.pause(job.id, OWNER);
      await service.resume(job.id, OWNER);
      await advance(10);

      const messages = lines.map((line) => line.message);

      expect(messages).toContain(
        `Job ${job.id} queued on table ${TABLE} (design star, simulation)`,
      );
      for (const step of [
        'queued -> drawing',
        'drawing -> paused',
        'paused -> drawing',
        'drawing -> completed',
      ]) {
        expect(messages).toContain(`Job ${job.id} on table ${TABLE}: ${step}`);
      }
    });

    it('logs a change of state once, and not every progress update', async () => {
      const { service, request, advance } = build();
      await service.start(TABLE, request(), OWNER);
      lines.length = 0;

      for (let second = 0; second < 2; second += 1) {
        await advance(0.5);
      }

      expect(lines).toStrictEqual([]);
    });

    it('logs a failure with its error code, at warn level for a refusal', async () => {
      const driver = new ScriptedDriver();
      driver.startJob.mockRejectedValue(new DriverError('OFFLINE', 'unreachable'));
      const { service, request } = build(driver);

      const { job } = await service.start(TABLE, request(), OWNER);

      expect(lines.find((line) => line.level === 'warn')?.message).toBe(
        `Job ${job.id} on table ${TABLE} failed: the driver refused it (OFFLINE)`,
      );
    });

    it('carries no personal data: neither the client’s request id nor anything about the caller', async () => {
      const { service, request, advance } = build();
      const clientRequestId = randomUUID();

      const { job } = await service.start(TABLE, request('star', clientRequestId), OWNER);
      await service.start(TABLE, request('star', clientRequestId), OWNER);
      await service.pause(job.id, OWNER);
      await service.stop(job.id, OWNER);
      await advance(5);

      const everything = lines.map((line) => line.message).join('\n');

      expect(everything).not.toContain(clientRequestId);
      expect(everything).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // no IP address
      expect(everything).not.toMatch(/@|user-agent|authorization/i);
    });
  });
});
