import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppModuleOptions } from '../src/app.module.js';
import { createConfiguredApp } from '../src/bootstrap.js';
import { FakeClock, ManualScheduler } from '../src/device/fake-clock.js';
import type { SimulatedTableDriver } from '../src/device/simulated-table-driver.js';
import { TABLE_DRIVER } from '../src/device/table-driver.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { InMemoryTableRepository } from '../src/tables/in-memory-table.repository.js';
import { createTestConfig } from './create-test-config.js';
import { fixtureTables } from './table-fixtures.js';

/** Admin key used by integration tests. Not a secret: it protects nothing real. */
export const TEST_ADMIN_KEY = 'test-admin-key-0123456789-0123456789-abcdef';

/**
 * The real application with an in-memory table repository seeded from fixtures,
 * so no test touches the file system or depends on a developer's data file.
 *
 * Pass `ADMIN_API_KEY: undefined` among `environment` to build a server with no
 * admin key configured.
 */
export function createTestApp(
  environment: Record<string, unknown> = {},
  options: Partial<AppModuleOptions> = {},
): Promise<NestExpressApplication> {
  return createConfiguredApp(createTestConfig({ ADMIN_API_KEY: TEST_ADMIN_KEY, ...environment }), {
    ...options,
    repository: options.repository ?? new InMemoryTableRepository(fixtureTables()),
  });
}

/**
 * An application whose time the test controls.
 *
 * The clock only moves when `advance` is called, and the simulator's ticks only run
 * when it ticks them, so a drawing that takes minutes passes in microseconds and
 * nothing depends on real timers. The speed factor is high by default, so a design
 * takes a few seconds of fake time.
 */
export interface TimedApp {
  readonly app: NestExpressApplication;
  readonly clock: FakeClock;
  readonly driver: SimulatedTableDriver;
  readonly jobs: JobsService;
  /** Move the clock on, let the simulator notice, and wait for the jobs to catch up. */
  advance(seconds: number): Promise<void>;
  /** Wait for every driver event so far to have been applied to its job. */
  settle(): Promise<void>;
}

export async function createTimedApp(
  environment: Record<string, unknown> = {},
  options: Partial<AppModuleOptions> = {},
): Promise<TimedApp> {
  const clock = options.clock instanceof FakeClock ? options.clock : new FakeClock();
  const scheduler = new ManualScheduler();
  const app = await createTestApp(
    { SIMULATION_SPEED_FACTOR: '100', ...environment },
    { ...options, clock, scheduler },
  );
  const driver = app.get<SimulatedTableDriver>(TABLE_DRIVER);
  const jobs = app.get(JobsService);

  const settle = async (): Promise<void> => {
    await jobs.whenIdle();
  };

  return {
    app,
    clock,
    driver,
    jobs,
    settle,
    advance: async (seconds) => {
      clock.advanceSeconds(seconds);
      scheduler.tick();
      await settle();
    },
  };
}
