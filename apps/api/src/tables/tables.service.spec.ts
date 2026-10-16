import { tableSchema } from '@athar/contracts';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DISABLED_TABLE, ENABLED_TABLE, fixtureTables } from '../../test/table-fixtures.js';
import { designCollectionV1 } from '../designs/data/designs.v1.js';
import { loadDesignCollection } from '../designs/design-collection.js';
import { DesignsService } from '../designs/designs.service.js';
import { FakeClock, ManualScheduler } from '../device/fake-clock.js';
import { SimulatedTableDriver } from '../device/simulated-table-driver.js';
import { InMemoryJobRepository } from '../jobs/in-memory-job.repository.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { ActiveJobLookup } from './active-job-lookup.js';
import { NoActiveJobs } from './active-job-lookup.js';
import { InMemoryTableRepository } from './in-memory-table.repository.js';
import { PairingStore } from './pairing-store.js';
import { generateTableId } from './table-id.js';
import { TableRegistry } from './table-registry.service.js';
import { TablesService } from './tables.service.js';

function setup(jobs: ActiveJobLookup = new NoActiveJobs()) {
  const clock = new FakeClock();
  const driver = new SimulatedTableDriver({
    clock,
    scheduler: new ManualScheduler(),
    speedFactor: 1,
    faultEveryNthJob: 0,
    faultAtProgress: 0.5,
  });
  const registry = new TableRegistry(
    new InMemoryTableRepository(fixtureTables()),
    { publicLinkBaseUrl: undefined },
    clock,
    generateTableId,
  );
  const pairings = new PairingStore(clock);

  return {
    clock,
    driver,
    registry,
    pairings,
    service: new TablesService(registry, driver, jobs, pairings),
  };
}

describe('TablesService', () => {
  it('returns the public Table shape for a registered table', async () => {
    const { service } = setup();

    const table = await service.getTable('table-001');

    expect(tableSchema.safeParse(table).success).toBe(true);
    expect(table).toStrictEqual({
      id: ENABLED_TABLE.id,
      displayName: ENABLED_TABLE.displayName,
      location: ENABLED_TABLE.location,
      enabled: true,
      mode: 'simulation',
      connection: 'online',
      activeJobId: null,
      plan: 'basic',
      voiceAssistant: false,
      features: ['catalogue', 'rake'],
      readiness: { paired: false, online: true, free: true, canStart: false },
    });
  });

  describe('readiness, for the calling session', () => {
    it('can start only when enabled, paired, online and free', async () => {
      const { service, pairings, driver } = setup();
      pairings.pair('session-1', 'table-001');
      pairings.pair('session-1', 'table-off');

      expect((await service.getTable('table-001', 'session-1')).readiness).toStrictEqual({
        paired: true,
        online: true,
        free: true,
        canStart: true,
      });
      expect((await service.getTable('table-001', 'session-2')).readiness.paired).toBe(false);
      expect((await service.getTable('table-off', 'session-1')).readiness.canStart).toBe(false);

      driver.simulateConnection('table-001', 'error');
      expect((await service.getTable('table-001', 'session-1')).readiness).toMatchObject({
        online: false,
        canStart: false,
      });
    });

    it('is not free while a job is active', async () => {
      const { service, pairings } = setup({ activeJobIdFor: () => Promise.resolve('job-42') });
      pairings.pair('session-1', 'table-001');

      expect((await service.getTable('table-001', 'session-1')).readiness).toStrictEqual({
        paired: true,
        online: true,
        free: false,
        canStart: false,
      });
    });
  });

  it('derives the features from the plan and the voice assistant', async () => {
    const { registry, service } = setup();
    await registry.update('table-001', { plan: 'personalized', voiceAssistant: true });

    expect(await service.getTable('table-001')).toMatchObject({
      plan: 'personalized',
      voiceAssistant: true,
      features: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences', 'voiceAssistant'],
    });
  });

  it('exposes no timestamps or other registration internals', async () => {
    const { service } = setup();

    expect(Object.keys(await service.getTable('table-001')).sort()).toStrictEqual([
      'activeJobId',
      'connection',
      'displayName',
      'enabled',
      'features',
      'id',
      'location',
      'mode',
      'plan',
      'readiness',
      'voiceAssistant',
    ]);
  });

  it('returns a disabled table with enabled: false rather than hiding it', async () => {
    const { service } = setup();

    expect(await service.getTable(DISABLED_TABLE.id)).toMatchObject({
      id: 'table-off',
      enabled: false,
      connection: 'online',
    });
  });

  it('takes mode from the driver, not from storage', async () => {
    const { service, driver } = setup();

    expect((await service.getTable('table-001')).mode).toBe(driver.mode);
  });

  it('derives connection from the driver on every read, so it is never stale', async () => {
    const { service, driver } = setup();

    driver.simulateConnection('table-001', 'offline');
    expect((await service.getTable('table-001')).connection).toBe('offline');

    driver.simulateConnection('table-001', 'error');
    expect((await service.getTable('table-001')).connection).toBe('error');

    driver.simulateConnection('table-001', 'online');
    expect((await service.getTable('table-001')).connection).toBe('online');
  });

  it('reports a table as busy while the driver is drawing', async () => {
    const { service, driver } = setup();

    await driver.startJob('table-001', {
      jobId: 'job-1',
      trajectory: {
        format: 'polar-theta-rho/v1',
        points: [
          [0, 0],
          [6, 1],
        ],
      },
    });

    expect((await service.getTable('table-001')).connection).toBe('busy');
    expect((await service.getTable('table-off')).connection).toBe('online');
  });

  describe('busy comes from the jobs module', () => {
    it('reports a table with an active job as busy, even if the driver has not caught up and says online', async () => {
      const { service } = setup({ activeJobIdFor: () => Promise.resolve('job-42') });

      expect(await service.getTable('table-001')).toMatchObject({
        connection: 'busy',
        activeJobId: 'job-42',
      });
    });

    it('does not hide that a table is offline or in error just because it has a job', async () => {
      const { service, driver } = setup({ activeJobIdFor: () => Promise.resolve('job-42') });

      driver.simulateConnection('table-001', 'offline');
      expect((await service.getTable('table-001')).connection).toBe('offline');

      driver.simulateConnection('table-001', 'error');
      expect((await service.getTable('table-001')).connection).toBe('error');
    });

    it('reports a table with no active job as whatever the driver says', async () => {
      const { service } = setup({ activeJobIdFor: () => Promise.resolve(null) });

      expect((await service.getTable('table-001')).connection).toBe('online');
    });
  });

  describe('the seam to jobs', () => {
    it('does not show a finished job as active when the read itself settles its completion', async () => {
      const { clock, driver, registry, pairings } = setup();
      const jobs = new JobsService(
        new InMemoryJobRepository(5),
        driver,
        registry,
        new DesignsService(loadDesignCollection(designCollectionV1)),
        clock,
        pairings,
      );
      const service = new TablesService(registry, driver, jobs, pairings);
      const owner = {
        account: { id: 'owner-1', email: 'o@athar.test', displayName: 'O', role: 'customer' },
        sessionId: 'session-1',
      } as const;
      await registry.update('table-001', { ownerAccountId: owner.account.id });
      pairings.pair(owner.sessionId, 'table-001');
      const { job } = await jobs.start(
        'table-001',
        { designId: 'star', clientRequestId: randomUUID() },
        owner,
      );

      // Long past the end of the drawing, with nothing having looked at the table since.
      clock.advanceSeconds(24 * 60 * 60);

      expect(await service.getTable('table-001')).toMatchObject({
        connection: 'online',
        activeJobId: null,
      });
      expect((await jobs.get(job.id)).state).toBe('completed');
    });

    it('reports no active job by default', async () => {
      const { service } = setup();

      expect((await service.getTable('table-001')).activeJobId).toBeNull();
    });

    it('reports whatever the job lookup says, per table', async () => {
      const { service } = setup({
        activeJobIdFor: (tableId) => Promise.resolve(tableId === 'table-001' ? 'job-42' : null),
      });

      expect((await service.getTable('table-001')).activeJobId).toBe('job-42');
      expect((await service.getTable('table-off')).activeJobId).toBeNull();
    });
  });

  it('throws TABLE_NOT_FOUND for an unknown table, without asking the driver about it', async () => {
    const { service, driver } = setup();
    let asked = false;
    const original = driver.getStatus.bind(driver);
    driver.getStatus = (tableId) => {
      asked = true;
      return original(tableId);
    };

    await expect(service.getTable('nope-nope')).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' });
    expect(asked).toBe(false);
  });
});
