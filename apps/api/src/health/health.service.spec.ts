import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from '@athar/contracts';
import { FakeClock, ManualScheduler } from '../device/fake-clock.js';
import { SimulatedTableDriver } from '../device/simulated-table-driver.js';
import type { TableDriver } from '../device/table-driver.js';
import { InMemoryTableRepository } from '../tables/in-memory-table.repository.js';
import { generateTableId } from '../tables/table-id.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import { fixtureTables } from '../../test/table-fixtures.js';
import { createTestConfig } from '../../test/create-test-config.js';
import { HealthService } from './health.service.js';

function setup(overrides: { driver?: TableDriver; tables?: TableRegistry } = {}) {
  const clock = new FakeClock();
  const simulator = new SimulatedTableDriver({
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

  return {
    simulator,
    service: (config = createTestConfig()) =>
      new HealthService(config, overrides.driver ?? simulator, overrides.tables ?? registry),
  };
}

describe('HealthService', () => {
  it('reports a healthy liveness payload', () => {
    const service = setup().service();

    const health = healthResponseSchema.parse(service.getHealth());

    expect(health).toStrictEqual({
      status: 'ok',
      service: 'athar-api',
      version: '0.1.0-test',
      timestamp: health.timestamp,
      uptimeSeconds: 0,
    });
    expect(Date.parse(health.timestamp)).not.toBeNaN();
  });

  it('keeps liveness exactly as it was: five fields, nothing about tables', () => {
    expect(Object.keys(setup().service().getHealth()).sort()).toStrictEqual([
      'service',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ]);
  });

  it('reports the configured service name and version', () => {
    const service = setup().service();

    const health = service.getHealth();

    expect(health.service).toBe(createTestConfig().serviceName);
    expect(health.version).toBe(createTestConfig().serviceVersion);
  });

  it('reports all probes as passing, including the table driver', async () => {
    const readiness = readyResponseSchema.parse(await setup().service().getReadiness());

    expect(readiness.status).toBe('ok');
    expect(readiness.checks).toStrictEqual([
      { name: 'configuration', status: 'ok' },
      { name: 'event-loop', status: 'ok' },
      { name: 'table-driver', status: 'ok' },
    ]);
  });

  it('names the table mode and nothing else about the driver', async () => {
    const readiness = await setup().service().getReadiness();

    expect(readiness.tableMode).toBe('simulation');
    expect(Object.keys(readiness).sort()).toStrictEqual([
      'checks',
      'service',
      'status',
      'tableMode',
      'timestamp',
      'uptimeSeconds',
      'version',
    ]);
    expect(JSON.stringify(readiness)).not.toMatch(/table-001|speed|fault|seed|duration/i);
  });

  it('takes the mode from the driver, not from configuration', async () => {
    const hardware = { ...new SimulatedTableDriver(simulatorOptions()), mode: 'hardware' as const };
    const driver = Object.assign(Object.create(new SimulatedTableDriver(simulatorOptions())), {
      mode: hardware.mode,
    }) as TableDriver;

    expect((await setup({ driver }).service().getReadiness()).tableMode).toBe('hardware');
  });

  it('reports readiness as degraded when configuration is unusable', async () => {
    // An empty service name can only occur if configuration bypassed
    // validation, so this simulates a corrupted runtime state.
    const service = setup().service({ ...createTestConfig(), serviceName: '' });

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('error');
    expect(readiness.checks).toContainEqual({ name: 'configuration', status: 'error' });
  });

  it('reports readiness as degraded when the driver cannot answer for a table', async () => {
    const { simulator } = setup();
    const broken: TableDriver = {
      mode: 'simulation',
      getStatus: () => Promise.reject(new Error('controller unreachable at 10.0.0.9')),
      startJob: simulator.startJob.bind(simulator),
      pause: simulator.pause.bind(simulator),
      resume: simulator.resume.bind(simulator),
      stop: simulator.stop.bind(simulator),
      setAmbience: simulator.setAmbience.bind(simulator),
      setLight: simulator.setLight.bind(simulator),
      subscribe: simulator.subscribe.bind(simulator),
    };

    const readiness = await setup({ driver: broken }).service().getReadiness();

    expect(readiness.status).toBe('error');
    expect(readiness.checks).toContainEqual({ name: 'table-driver', status: 'error' });
    // Which table failed and why is for the logs: the response carries only the name.
    expect(JSON.stringify(readiness)).not.toContain('10.0.0.9');
  });

  it('reports readiness as degraded when the table list cannot be read', async () => {
    const tables = {
      list: () => Promise.reject(new Error('disk gone')),
    } as unknown as TableRegistry;

    const readiness = await setup({ tables }).service().getReadiness();

    expect(readiness.checks).toContainEqual({ name: 'table-driver', status: 'error' });
  });

  it('is ready when there are no tables yet: a new installation starts empty', async () => {
    const empty = new TableRegistry(
      new InMemoryTableRepository(),
      { publicLinkBaseUrl: undefined },
      new FakeClock(),
      generateTableId,
    );

    expect((await setup({ tables: empty }).service().getReadiness()).status).toBe('ok');
  });
});

function simulatorOptions() {
  return {
    clock: new FakeClock(),
    scheduler: new ManualScheduler(),
    speedFactor: 1,
    faultEveryNthJob: 0,
    faultAtProgress: 0.5,
  };
}
