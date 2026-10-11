import { tableSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { DISABLED_TABLE, ENABLED_TABLE, fixtureTables } from '../../test/table-fixtures.js';
import { FakeClock, ManualScheduler } from '../device/fake-clock.js';
import { SimulatedTableDriver } from '../device/simulated-table-driver.js';
import type { ActiveJobLookup } from './active-job-lookup.js';
import { NoActiveJobs } from './active-job-lookup.js';
import { InMemoryTableRepository } from './in-memory-table.repository.js';
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

  return { driver, service: new TablesService(registry, driver, jobs) };
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
    });
  });

  it('exposes no timestamps or other registration internals', async () => {
    const { service } = setup();

    expect(Object.keys(await service.getTable('table-001')).sort()).toStrictEqual([
      'activeJobId',
      'connection',
      'displayName',
      'enabled',
      'id',
      'location',
      'mode',
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
